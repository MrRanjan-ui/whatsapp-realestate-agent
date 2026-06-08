import { Lead, Message, Property, Appointment } from '../db/models';
import { parseLeadDetails, generateAIResponse, getInteractivePayload, parseBudgetToNumeric } from './gemini';
import { calculateLeadScore } from './leadScorer';
import { config } from '../config';
import { generateBrochurePDF, generatePropertyBrochurePDF } from './pdfGenerator';

export class WhatsAppBot {
  async start() {
    console.log('🤖 WhatsApp Bot initialized for Meta Cloud API.');
    if (!config.WHATSAPP_TOKEN || config.WHATSAPP_TOKEN === 'YOUR_META_ACCESS_TOKEN_HERE') {
      console.warn('\n⚠️ WARNING: WHATSAPP_TOKEN is missing or set to placeholder in .env.');
      console.warn('The WhatsApp actual sender will run in MOCK LOG MODE. Add your credentials for real messaging.\n');
    }
  }

  /**
   * Internal wrapper for Meta Graph API calls
   */
  private async callMetaAPI(phone: string, type: string, payload: any) {
    if (!config.WHATSAPP_TOKEN || config.WHATSAPP_TOKEN === 'YOUR_META_ACCESS_TOKEN_HERE') {
      console.log(`[MOCK WHATSAPP SEND] to ${phone} (${type}):`, JSON.stringify(payload, null, 2));
      return { mock: true, message_id: 'mock_wamid_' + Math.random().toString(36).substring(7) };
    }

    const url = `https://graph.facebook.com/${config.WHATSAPP_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.WHATSAPP_TOKEN}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          ...payload
        })
      });

      const resText = await response.text();
      if (!response.ok) {
        console.error(`❌ Meta API Error [${response.status}]:`, resText);
        throw new Error(`Meta API error: ${response.statusText} - ${resText}`);
      }

      const resJson = JSON.parse(resText);
      console.log(`🟢 Meta API message sent successfully. Message ID: ${resJson.messages?.[0]?.id}`);
      return resJson;
    } catch (err) {
      console.error('❌ Failed to call Meta WhatsApp API:', err);
      throw err;
    }
  }

  async sendTextMessage(phone: string, text: string) {
    return this.callMetaAPI(phone, 'text', {
      type: 'text',
      text: { body: text }
    });
  }

  async sendImageMessage(phone: string, imageUrl: string, caption?: string) {
    return this.callMetaAPI(phone, 'image', {
      type: 'image',
      image: {
        link: imageUrl,
        caption: caption
      }
    });
  }

  async sendDocumentMessage(phone: string, documentUrl: string, filename: string, caption?: string) {
    return this.callMetaAPI(phone, 'document', {
      type: 'document',
      document: {
        link: documentUrl,
        filename: filename,
        caption: caption
      }
    });
  }

  async sendButtonsMessage(phone: string, bodyText: string, buttons: Array<{ id: string; text: string }>) {
    return this.callMetaAPI(phone, 'interactive', {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText.slice(0, 1024) },
        footer: { text: 'Prime Estates Assistant' },
        action: {
          buttons: buttons.slice(0, 3).map(b => ({
            type: 'reply',
            reply: {
              id: b.id,
              title: b.text.slice(0, 20) // Meta buttons max length is 20 chars
            }
          }))
        }
      }
    });
  }

  async sendListMessage(phone: string, bodyText: string, buttonText: string, sections: any[]) {
    return this.callMetaAPI(phone, 'interactive', {
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'Select Option' },
        body: { text: bodyText.slice(0, 1024) },
        footer: { text: 'Prime Estates Assistant' },
        action: {
          button: buttonText.slice(0, 20), // List button label max 20 chars
          sections: sections.map(sec => ({
            title: sec.title.slice(0, 20),
            rows: sec.rows.map((r: any) => ({
              id: r.id,
              title: r.title.slice(0, 24), // Meta row title max 24 chars
              description: r.description ? r.description.slice(0, 72) : undefined
            }))
          }))
        }
      }
    });
  }

  async sendImageButtonsMessage(phone: string, imageUrl: string, bodyText: string, buttons: Array<{ id: string; text: string }>) {
    return this.callMetaAPI(phone, 'interactive', {
      type: 'interactive',
      interactive: {
        type: 'button',
        header: {
          type: 'image',
          image: { link: imageUrl }
        },
        body: { text: bodyText.slice(0, 1024) }, // Body text limit is 1024 chars
        footer: { text: 'Prime Estates Assistant' },
        action: {
          buttons: buttons.slice(0, 3).map(b => ({
            type: 'reply',
            reply: {
              id: b.id,
              title: b.text.slice(0, 20)
            }
          }))
        }
      }
    });
  }

  /**
   * Bypasses AI to let agents send a manual text message from the CRM
   */
  async sendManualMessage(phone: string, text: string) {
    await this.sendTextMessage(phone, text);
  }

  /**
   * Core logic for processing incoming WhatsApp events (called from HTTP POST /webhook)
   */
  async handleIncomingMessage(senderPhone: string, messageText: string, hostUrl?: string) {
    // Whitelist validation
    const whitelist = config.WHITELISTED_PHONES;
    if (whitelist.length > 0 && !whitelist.includes(senderPhone)) {
      console.log(`ℹ️ Number [${senderPhone}] is not whitelisted. Skipping AI auto-reply.`);
      try {
        let lead = await Lead.findOne({ phone: senderPhone });
        if (!lead) {
          lead = new Lead({ phone: senderPhone, status: 'Cold', leadScore: 10 });
          await lead.save();
        }
        const userMsg = new Message({ leadId: lead._id, sender: 'user', text: messageText });
        await userMsg.save();
      } catch (e) {
        console.error('Error logging non-whitelisted message:', e);
      }
      return;
    }

    try {
      // 1. Get or create Lead in MongoDB
      let lead = await Lead.findOne({ phone: senderPhone });
      if (!lead) {
        lead = new Lead({
          phone: senderPhone,
          status: 'Cold',
          leadScore: 10 // +10 for verified phone
        });
        await lead.save();
        console.log(`🆕 Created new lead for WhatsApp: ${senderPhone}`);
      }

      // 2. Log User message in Database
      const userMsg = new Message({
        leadId: lead._id,
        sender: 'user',
        text: messageText
      });
      await userMsg.save();

      // 3. Check for Human Takeover
      if (lead.humanTakeover) {
        console.log(`⚠️ Handoff Active: Ignoring AI response for lead ${senderPhone}`);
        return; // Dashboard agent will respond manually
      }

      // Check if user is replying with a site visit day selection
      const lowerText = messageText.toLowerCase().trim();
      if (lowerText === 'tomorrow' || lowerText === 'this weekend' || lowerText === 'next week') {
        const lastBotMsg = await Message.findOne({
          leadId: lead._id,
          sender: 'bot'
        }).sort({ timestamp: -1 });

        if (lastBotMsg && (lastBotMsg.text.includes('Which day works best?') || lastBotMsg.text.includes('works best'))) {
          let propertyName = 'Green Valley';
          if (lead.locationPreference) {
            const matchedProp = await Property.findOne({
              location: { $regex: new RegExp(lead.locationPreference, 'i') }
            });
            if (matchedProp) {
              propertyName = matchedProp.name;
            }
          } else {
            const anyProp = await Property.findOne({});
            if (anyProp) {
              propertyName = anyProp.name;
            }
          }

          const appointment = new Appointment({
            leadId: lead._id,
            propertyName,
            date: messageText,
            timeSlot: 'Morning (10:00 AM - 12:00 PM)',
            status: 'Scheduled'
          });
          await appointment.save();
          console.log(`📅 Automatically scheduled site visit for WhatsApp lead [${lead.phone}] at ${propertyName}`);

          lead.timeline = `Immediate (${messageText})`;
        }
      } else if (lowerText.includes('request callback')) {
        lead.timeline = 'Immediate (Callback requested)';
        await lead.save();
        console.log(`📞 Logged priority callback request for lead [${lead.phone}]`);
      } else if (lowerText.includes('brochure')) {
        let targetProperty: any = null;

        // Try to find the last recommended property from message history
        const lastImageMsg = await Message.findOne({
          leadId: lead._id,
          sender: 'bot',
          imageUrl: { $exists: true, $ne: '' }
        }).sort({ timestamp: -1 });

        if (lastImageMsg && lastImageMsg.text) {
          const match = lastImageMsg.text.match(/🏢 \*([^*]+)\*/);
          if (match && match[1]) {
            const propName = match[1].trim();
            targetProperty = await Property.findOne({ name: propName });
            if (targetProperty) {
              console.log(`Resolved target property from history: ${targetProperty.name}`);
            }
          }
        }

        // Fallback: If not resolved from history, find the first property matching the lead's criteria
        if (!targetProperty) {
          const loc = lead.locationPreference || 'Noida';
          const query: any = {
            location: { $regex: new RegExp(loc, 'i') },
            isForRent: lead.purchaseType === 'Rent'
          };
          if (lead.budget) {
            const numericBudget = parseBudgetToNumeric(lead.budget);
            if (numericBudget > 0) {
              query.priceNumeric = { $gte: numericBudget * 0.7, $lte: numericBudget * 1.3 };
            }
          }
          let props = await Property.find(query);
          if (props.length === 0) {
            delete query.priceNumeric;
            props = await Property.find(query);
          }
          if (props.length > 0) {
            targetProperty = props[0];
            console.log(`Resolved target property from criteria fallback: ${targetProperty.name}`);
          } else {
            // Ultimate fallback: get any property
            targetProperty = await Property.findOne({});
            if (targetProperty) {
              console.log(`Resolved target property from global fallback: ${targetProperty.name}`);
            }
          }
        }

        if (!targetProperty) {
          await this.sendTextMessage(senderPhone, `Sorry, we could not find any properties to generate a brochure. Please specify a location and budget first.`);
          return;
        }

        console.log(`📄 Generating dynamic 5-page property brochure PDF for lead [${lead.phone}] and property ${targetProperty.name}...`);
        await this.sendTextMessage(senderPhone, `Generating your personalized brochure for ${targetProperty.name}... 📄`);

        try {
          const fileName = await generatePropertyBrochurePDF(targetProperty);
          const host = hostUrl || `http://localhost:5000`;
          const brochureUrl = `${host}/brochures/${fileName}`;

          console.log(`🚀 Delivering generated property brochure PDF to WhatsApp: ${brochureUrl}`);

          const docMsg = new Message({
            leadId: lead._id,
            sender: 'bot',
            text: `Sent property brochure PDF for ${targetProperty.name}`,
            timestamp: new Date()
          });
          await docMsg.save();

          await this.sendDocumentMessage(
            senderPhone,
            brochureUrl,
            `${targetProperty.name.replace(/\s+/g, '_')}_Brochure.pdf`,
            `🏡 Property Brochure for ${targetProperty.name}`
          );
        } catch (pdfErr) {
          console.error('Failed to generate or deliver PDF:', pdfErr);
          await this.sendTextMessage(senderPhone, `Sorry, we encountered an error compiling the brochure for ${targetProperty.name}. Please try again shortly.`);
        }
        return; // Prevent triggering AI chat response
      }

      // 4. Load full message history for this lead (needed for Gemini context)
      const allDbMessages = await Message.find({ leadId: lead._id }).sort({ timestamp: 1 });
      
      // Format message history for Gemini chat structure
      const chatHistoryForAI = allDbMessages.map(m => ({
        role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
        parts: [{ text: m.text }]
      }));

      // Simple flat text array for the parameter parser
      const plainTextMessages = allDbMessages.map(m => `${m.sender}: ${m.text}`);

      // 5. Run Gemini JSON parser to extract parameters from current state of chat
      const parsedProfile = await parseLeadDetails(plainTextMessages);

      // Update Lead details in MongoDB based on what Gemini extracted
      if (parsedProfile.name) lead.name = parsedProfile.name;
      if (parsedProfile.city) lead.city = parsedProfile.city;
      if (parsedProfile.propertyType) lead.propertyType = parsedProfile.propertyType;
      if (parsedProfile.locationPreference) lead.locationPreference = parsedProfile.locationPreference;
      if (parsedProfile.budget) lead.budget = parsedProfile.budget;
      if (parsedProfile.timeline) lead.timeline = parsedProfile.timeline;
      if (parsedProfile.purchaseType) lead.purchaseType = parsedProfile.purchaseType;

      // 6. Query matching properties based on preferences
      let matchedProperties: any[] = [];
      if (lead.locationPreference) {
        const query: any = {
          location: { $regex: new RegExp(lead.locationPreference, 'i') },
          isForRent: lead.purchaseType === 'Rent'
        };

        if (lead.budget) {
          const numericBudget = parseBudgetToNumeric(lead.budget);
          if (numericBudget > 0) {
            // Flexible budget range (+/- 30% range)
            query.priceNumeric = { $gte: numericBudget * 0.7, $lte: numericBudget * 1.3 };
          }
        }

        matchedProperties = await Property.find(query);

        // Fallback: if no properties matched the budget range filter, retrieve listings by location & rent/buy status
        if (matchedProperties.length === 0) {
          delete query.priceNumeric;
          matchedProperties = await Property.find(query);
        }

        if (lead.propertyType && matchedProperties.length > 0) {
          const typeRegex = new RegExp(lead.propertyType.replace(/\s+/g, ''), 'i');
          matchedProperties = matchedProperties.filter(p => 
            p.type.replace(/\s+/g, '').match(typeRegex) || p.type.toLowerCase().includes(lead.propertyType!.toLowerCase())
          );
        }
      }

      // 7. Generate Bot response via Gemini
      const replyText = await generateAIResponse(chatHistoryForAI, parsedProfile as any, matchedProperties);

      // 8. Log Bot Response in Database
      const interactive = getInteractivePayload(replyText);
      const botMsg = new Message({
        leadId: lead._id,
        sender: 'bot',
        text: replyText,
        interactivePayload: interactive || undefined
      });
      await botMsg.save();

      // 9. Recalculate lead score and score status
      const scoring = calculateLeadScore(lead);
      lead.leadScore = scoring.score;
      lead.status = scoring.status;
      await lead.save();

      console.log(`🤖 Bot response saved. Lead Score: ${lead.leadScore} (${lead.status})`);

      // 10. Send reply back to customer on WhatsApp via Meta API
      if (interactive) {
        if (interactive.type === 'buttons') {
          await this.sendButtonsMessage(senderPhone, replyText, interactive.buttons);
        } else if (interactive.type === 'list') {
          await this.sendListMessage(senderPhone, replyText, interactive.buttonText, interactive.sections);
        }
      } else {
        await this.sendTextMessage(senderPhone, replyText);
      }

      // Send the top 3 matched properties as interactive cards if in recommending state
      if (matchedProperties.length > 0 && lead.locationPreference && lead.budget) {
        const isRecommending = /found|recommend|here|matching/i.test(replyText);
        if (isRecommending) {
          const propsToSend = matchedProperties.slice(0, 3);
          console.log(`📸 Sending ${propsToSend.length} matching properties as interactive cards...`);
          
          for (const prop of propsToSend) {
            if (prop.imageUrl) {
              const rentOrBuy = prop.isForRent ? 'Rent' : 'Price';
              const specs = prop.type || 'Luxury Apartment';
              const descText = prop.isForRent
                ? `A premium renting opportunity for a ${specs} located in ${prop.location}.`
                : `An exclusive premium residential ${specs} in ${prop.location}, offering high-class architecture and lifestyle.`;
              const cardBodyText = `🏢 *${prop.name}*\n` +
                `📍 Location: ${prop.location}\n` +
                `💰 ${rentOrBuy}: ${prop.price}\n` +
                `🛏️ Specs: ${specs}\n` +
                `📅 Possession: ${prop.possessionDate || 'Ready to move'}\n` +
                `📋 RERA No: ${prop.reraNumber || 'Verified'}\n\n` +
                `📝 Description: ${descText}\n\n` +
                `✨ Amenities: ${prop.amenities.slice(0, 4).join(', ')}`;
              
              const absoluteImageUrl = prop.imageUrl.startsWith('http')
                ? prop.imageUrl
                : `${hostUrl || 'http://localhost:5000'}${prop.imageUrl}`;

              // Log the interactive card in database so CRM renders it with buttons
              const imageMsg = new Message({
                leadId: lead._id,
                sender: 'bot',
                text: cardBodyText,
                imageUrl: absoluteImageUrl,
                interactivePayload: {
                  type: 'buttons',
                  buttons: [
                    { id: 'Schedule Site Visit', text: 'Schedule Visit 📅' },
                    { id: 'Brochure PDF', text: 'Brochure PDF 📄' }
                  ]
                }
              });
              await imageMsg.save();

              // Send interactive image buttons message via Meta API
              await this.sendImageButtonsMessage(
                senderPhone, 
                absoluteImageUrl,
                cardBodyText,
                [
                  { id: 'Schedule Site Visit', text: 'Schedule Visit 📅' },
                  { id: 'Brochure PDF', text: 'Brochure PDF 📄' }
                ]
              );
            }
          }
        }
      }

    } catch (error) {
      console.error(`Error processing message from ${senderPhone}:`, error);
    }
  }
}

// Export a singleton instance of the WhatsApp Bot
export const whatsappBot = new WhatsAppBot();
