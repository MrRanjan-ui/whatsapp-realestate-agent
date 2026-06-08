import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { config } from './config';
import { Lead, Message, Property, Appointment } from './db/models';
import { whatsappBot } from './services/whatsapp';
import { calculateLeadScore } from './services/leadScorer';
import { parseLeadDetails, generateAIResponse, getInteractivePayload, parseBudgetToNumeric } from './services/gemini';
import { generateBrochurePDF, generatePropertyBrochurePDF } from './services/pdfGenerator';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/brochures', express.static(path.join(__dirname, '../public/brochures')));
app.use('/images', express.static(path.join(__dirname, '../public/images')));

// ==========================================
// REST API ENDPOINTS FOR THE CRM DASHBOARD
// ==========================================

// 1. Get all leads, sorted by lead score descending
app.get('/api/leads', async (req, res) => {
  try {
    const leads = await Lead.find({}).sort({ leadScore: -1 });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

// 2. Get details and chat logs for a specific lead
app.get('/api/leads/:id', async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch lead details' });
  }
});

// 3. Get chat messages for a lead
app.get('/api/leads/:id/chat', async (req, res) => {
  try {
    const messages = await Message.find({ leadId: req.params.id }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chat log' });
  }
});

// 4. Toggle Human Takeover state
app.post('/api/leads/:id/takeover', async (req, res) => {
  try {
    const { takeover } = req.body;
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { humanTakeover: !!takeover },
      { new: true }
    );
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    console.log(`👤 Takeover status updated for lead [${lead.phone}]: ${lead.humanTakeover}`);
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: 'Failed to toggle takeover' });
  }
});

// 5. Send manual message from human agent (Takeover)
app.post('/api/leads/:id/message', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Send the message via Baileys WhatsApp client
    await whatsappBot.sendManualMessage(lead.phone, text);

    // Save message as 'agent' type
    const agentMsg = new Message({
      leadId: lead._id,
      sender: 'agent',
      text
    });
    await agentMsg.save();

    // Force takeover true when an agent sends a manual message
    lead.humanTakeover = true;
    await lead.save();

    res.json(agentMsg);
  } catch (error) {
    console.error('Error sending agent manual message:', error);
    res.status(500).json({ error: 'Failed to send message via WhatsApp' });
  }
});

// 6. Get all properties listings
app.get('/api/properties', async (req, res) => {
  try {
    const properties = await Property.find({});
    res.json(properties);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// 7. Get scheduled appointments
app.get('/api/appointments', async (req, res) => {
  try {
    const appointments = await Appointment.find({}).populate('leadId').sort({ date: 1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// 8. Schedule a site visit manually or update one
app.post('/api/appointments', async (req, res) => {
  try {
    const { leadId, propertyName, date, timeSlot } = req.body;
    if (!leadId || !propertyName || !date || !timeSlot) {
      return res.status(400).json({ error: 'All appointment fields are required' });
    }

    const appointment = new Appointment({
      leadId,
      propertyName,
      date,
      timeSlot,
      status: 'Scheduled'
    });
    await appointment.save();

    // Ensure the lead has scheduling scoring indicators
    const lead = await Lead.findById(leadId);
    if (lead) {
      // Set timeline as immediate since they scheduled a visit
      lead.timeline = 'Immediate (Site Visit)';
      const scoring = calculateLeadScore(lead);
      lead.leadScore = scoring.score;
      lead.status = scoring.status;
      await lead.save();
    }

    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// 9. Fetch CRM Summary Analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const totalLeads = await Lead.countDocuments({});
    const hotLeads = await Lead.countDocuments({ status: 'Hot' });
    const warmLeads = await Lead.countDocuments({ status: 'Warm' });
    const coldLeads = await Lead.countDocuments({ status: 'Cold' });
    const totalAppointments = await Appointment.countDocuments({ status: 'Scheduled' });

    res.json({
      totalLeads,
      hotLeads,
      warmLeads,
      coldLeads,
      totalAppointments
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load analytics summary' });
  }
});


// 10. Simulation endpoint for local browser-based testing
app.post('/api/leads/simulate-incoming', async (req, res) => {
  try {
    const { phone, text } = req.body;
    if (!phone || !text) {
      return res.status(400).json({ error: 'Phone and text are required' });
    }

    const protocol = req.protocol;
    const host = req.headers.host || `localhost:${config.PORT}`;
    const hostUrl = `${protocol}://${host}`;

    // 1. Get or create Lead in MongoDB
    let lead = await Lead.findOne({ phone });
    if (!lead) {
      lead = new Lead({
        phone,
        status: 'Cold',
        leadScore: 10
      });
      await lead.save();
    }

    // 2. Log User message in Database
    const userMsg = new Message({
      leadId: lead._id,
      sender: 'user',
      text
    });
    await userMsg.save();

    // 3. Process with AI if takeover is false and number is whitelisted
    let replyText = "";
    const whitelist = config.WHITELISTED_PHONES;
    const isWhitelisted = whitelist.length === 0 || whitelist.includes(phone);
    const botRepliesList: any[] = [];

    if (!isWhitelisted) {
      console.log(`ℹ️ Simulation: Number [${phone}] is not whitelisted. Skipping AI auto-reply.`);
    }

    if (!lead.humanTakeover && isWhitelisted) {
      // Check if user is replying with a site visit day selection
      const lowerText = text.toLowerCase().trim();
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
            date: text,
            timeSlot: 'Morning (10:00 AM - 12:00 PM)',
            status: 'Scheduled'
          });
          await appointment.save();
          console.log(`📅 Automatically scheduled site visit for simulated lead [${lead.phone}] at ${propertyName}`);

          lead.timeline = `Immediate (${text})`;
        }
      } else if (lowerText.includes('request callback')) {
        lead.timeline = 'Immediate (Callback requested)';
        await lead.save();
        console.log(`📞 Logged priority callback request for simulated lead [${lead.phone}]`);
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
          const errMsg = new Message({
            leadId: lead._id,
            sender: 'bot',
            text: `Sorry, we could not find any properties to generate a brochure. Please select a location and budget first.`
          });
          await errMsg.save();

          return res.json({
            lead: lead,
            userMessage: userMsg,
            botReply: errMsg,
            botReplies: [errMsg]
          });
        }

        console.log(`📄 Simulator: Generating dynamic 5-page property brochure PDF for lead [${lead.phone}] and property ${targetProperty.name}...`);

        try {
          const fileName = await generatePropertyBrochurePDF(targetProperty);
          const protocol = req.protocol;
          const host = req.headers.host || `localhost:${config.PORT}`;
          const brochureUrl = `${protocol}://${host}/brochures/${fileName}`;

          console.log(`🚀 Simulator: Dynamic property brochure PDF generated at: ${brochureUrl}`);

          const genMsg = new Message({
            leadId: lead._id,
            sender: 'bot',
            text: `Generating your personalized brochure for ${targetProperty.name}... 📄`
          });
          await genMsg.save();

          const docMsg = new Message({
            leadId: lead._id,
            sender: 'bot',
            text: `🏡 *Property Brochure for ${targetProperty.name}* compiled successfully!\n\n👉 [Click here to Download Brochure PDF](${brochureUrl}) 📄`
          });
          await docMsg.save();

          const scoring = calculateLeadScore(lead);
          lead.leadScore = scoring.score;
          lead.status = scoring.status;
          await lead.save();

          const matchedLead = await Lead.findById(lead._id);

          return res.json({
            lead: matchedLead || lead,
            userMessage: userMsg,
            botReply: genMsg,
            botReplies: [genMsg, docMsg]
          });
        } catch (pdfErr) {
          console.error('Simulator PDF generation error:', pdfErr);
          const errMsg = new Message({
            leadId: lead._id,
            sender: 'bot',
            text: `Sorry, we encountered an error compiling the brochure for ${targetProperty.name}. Please try again shortly.`
          });
          await errMsg.save();

          return res.json({
            lead: lead,
            userMessage: userMsg,
            botReply: errMsg,
            botReplies: [errMsg]
          });
        }
      }

      const allDbMessages = await Message.find({ leadId: lead._id }).sort({ timestamp: 1 });
      const chatHistoryForAI = allDbMessages.map(m => ({
        role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
        parts: [{ text: m.text }]
      }));
      const plainTextMessages = allDbMessages.map(m => `${m.sender}: ${m.text}`);

      const parsedProfile = await parseLeadDetails(plainTextMessages);

      if (parsedProfile.name) lead.name = parsedProfile.name;
      if (parsedProfile.city) lead.city = parsedProfile.city;
      if (parsedProfile.propertyType) lead.propertyType = parsedProfile.propertyType;
      if (parsedProfile.locationPreference) lead.locationPreference = parsedProfile.locationPreference;
      if (parsedProfile.budget) lead.budget = parsedProfile.budget;
      if (parsedProfile.timeline) lead.timeline = parsedProfile.timeline;
      if (parsedProfile.purchaseType) lead.purchaseType = parsedProfile.purchaseType;

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

      replyText = await generateAIResponse(chatHistoryForAI, parsedProfile as any, matchedProperties);

      if (replyText) {
        const interactive = getInteractivePayload(replyText);
        const botMsg = new Message({
          leadId: lead._id,
          sender: 'bot',
          text: replyText,
          interactivePayload: interactive || undefined
        });
        await botMsg.save();
        botRepliesList.push(botMsg);

        // Save simulated property image messages as interactive property cards with buttons if in recommending state
        if (matchedProperties.length > 0 && lead.locationPreference && lead.budget) {
          const isRecommending = /found|recommend|here|matching/i.test(replyText);
          if (isRecommending) {
            const propsToSend = matchedProperties.slice(0, 3);
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
                  : `${hostUrl}${prop.imageUrl}`;

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
                botRepliesList.push(imageMsg);
              }
            }
          }
        }
      }

      const scoring = calculateLeadScore(lead);
      lead.leadScore = scoring.score;
      lead.status = scoring.status;
      await lead.save();
    }

    const matchedLead = await Lead.findById(lead._id);
    const savedBotMsg = botRepliesList[0];

    res.json({
      lead: matchedLead || lead,
      userMessage: userMsg,
      botReply: savedBotMsg ? { 
        text: savedBotMsg.text, 
        sender: 'bot', 
        interactivePayload: savedBotMsg.interactivePayload 
      } : null,
      botReplies: botRepliesList
    });
  } catch (error) {
    console.error('Error simulating incoming message:', error);
    res.status(500).json({ error: 'Failed to simulate message processing' });
  }
});

// ==========================================
// WHATSAPP META CLOUD WEBHOOK ENDPOINTS
// ==========================================

// 1. Webhook Verification (GET /webhook)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
      console.log('🟢 WhatsApp Webhook Verified Successfully!');
      return res.status(200).send(challenge);
    }
  }
  console.warn('⚠️ Webhook verification failed.');
  return res.sendStatus(403);
});

// 2. Webhook Event Handler (POST /webhook)
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Check if it's a WhatsApp webhook event
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const message = change?.messages?.[0];

      if (message) {
        const senderPhone = message.from;
        let messageText = '';

        if (message.type === 'text') {
          messageText = message.text?.body || '';
        } else if (message.type === 'interactive') {
          const interactive = message.interactive;
          if (interactive.type === 'button_reply') {
            messageText = interactive.button_reply?.title || '';
          } else if (interactive.type === 'list_reply') {
            messageText = interactive.list_reply?.title || '';
          }
        }

        if (messageText.trim()) {
          console.log(`📥 Webhook incoming message from [${senderPhone}]: "${messageText}"`);
          const protocol = req.headers['x-forwarded-proto'] || req.protocol;
          const host = req.headers.host;
          const hostUrl = `${protocol}://${host}`;
          await whatsappBot.handleIncomingMessage(senderPhone, messageText, hostUrl);
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }
    
    return res.sendStatus(404);
  } catch (error) {
    console.error('Error in POST /webhook:', error);
    return res.sendStatus(500);
  }
});

// ==========================================
// SYSTEM BOOTSTRAPPING
// ==========================================

async function startServer() {
  try {
    console.log(`Connecting to database at ${config.MONGODB_URI}...`);
    await mongoose.connect(config.MONGODB_URI);
    console.log('🔌 Database connected successfully.');

    // Auto-seed properties database if empty
    const propertiesCount = await Property.countDocuments({});
    if (propertiesCount === 0) {
      console.log('Seeding properties database because it is empty...');
      const { seedDatabase } = require('./seed');
      await seedDatabase(false);
    }

    // Start WhatsApp client worker
    console.log('Starting WhatsApp service client...');
    await whatsappBot.start();

    // Start Express API server
    app.listen(config.PORT, () => {
      console.log(`🚀 CRM Dashboard Backend Server listening on http://localhost:${config.PORT}`);
    });
  } catch (error) {
    console.error('Fatal error during startup bootstrap:', error);
  }
}

startServer();
