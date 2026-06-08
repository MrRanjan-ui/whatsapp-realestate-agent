import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

// Initialize Gemini SDK safely
let genAI: GoogleGenerativeAI | null = null;
if (config.GEMINI_API_KEY && config.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE') {
  genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  console.log('🤖 Gemini AI SDK initialized successfully.');
} else {
  console.warn('\n⚠️ WARNING: GEMINI_API_KEY is missing or set to placeholder.');
  console.warn('The agent will run in DEMO MOCK MODE. Add your Gemini API key to .env for full AI functionality.\n');
}

export interface ExtractedLeadProfile {
  name: string | null;
  city: string | null;
  propertyType: string | null;
  locationPreference: string | null;
  budget: string | null;
  timeline: string | null;
  purchaseType: string | null;
}

/**
 * Parses user requirements and qualification metrics from chat history using Gemini JSON Mode.
 */
export async function parseLeadDetails(chatHistory: string[]): Promise<ExtractedLeadProfile> {
  const defaultProfile: ExtractedLeadProfile = {
    name: null,
    city: null,
    propertyType: null,
    locationPreference: null,
    budget: null,
    timeline: null,
    purchaseType: null
  };

  if (!genAI) {
    // Mock fallback parser for quick testing
    return mockParseLeadDetails(chatHistory);
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    const conversationText = chatHistory.join('\n');
    const prompt = `
Analyze the following conversation between a Real Estate bot and a customer. Extract the customer's profile details in JSON format.
If a detail is not explicitly mentioned, output null for that field.

Fields to extract:
1. "name": Customer's name (only if they shared it)
2. "city": Customer's current city
3. "propertyType": The configuration or type of property they want (e.g. "2 BHK", "3 BHK", "Villa", "Apartment", "Plot", "Commercial")
4. "locationPreference": Target city/micro-market for the property (e.g. "Noida", "Gurgaon", "Pune", "Bangalore")
5. "budget": Maximum budget or range they are looking at (e.g. "1.5 Cr", "85 Lakhs", "25k", "50k")
6. "timeline": Buying/renting urgency timeline (e.g. "Immediate", "1 Month", "3 Months", "Just Researching")
7. "purchaseType": Service Needed category (must be one of: "Buy", "Rent", "Sell", "Contact Us")

Conversation:
"""
${conversationText}
"""

Provide your output ONLY as a JSON object matching this schema:
{
  "name": string | null,
  "city": string | null,
  "propertyType": string | null,
  "locationPreference": string | null,
  "budget": string | null,
  "timeline": string | null,
  "purchaseType": "Buy" | "Rent" | "Sell" | "Contact Us" | null
}
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    return JSON.parse(responseText.trim()) as ExtractedLeadProfile;
  } catch (error) {
    console.error('Error in parseLeadDetails Gemini API. Falling back to Mock parser:', error);
    return mockParseLeadDetails(chatHistory);
  }
}

/**
 * Generates natural real estate assistant responses.
 * Uses propertiesContext (list of matched listings) to suggest options if parameters match.
 */
export async function generateAIResponse(
  chatHistory: Array<{ role: 'user' | 'model'; parts: { text: string }[] }>,
  leadProfile: ExtractedLeadProfile,
  propertiesContext: any[]
): Promise<string> {
  if (!genAI) {
    return generateMockResponse(chatHistory, leadProfile, propertiesContext);
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite'
    });

    // Format properties context
    const propertiesText = propertiesContext.length > 0 
      ? propertiesContext.map(p => `
- Project: ${p.name}
  Location: ${p.location}
  Price: ${p.price}
  Type: ${p.type}
  Amenities: ${p.amenities.join(', ')}
  Possession: ${p.possessionDate}
  RERA No: ${p.reraNumber}
  Brochure: ${p.brochureUrl}
  Google Maps: ${p.mapUrl}
`).join('\n')
      : 'No exact matches found.';

    const systemPrompt = `
You are "Aria", a helpful, professional, and charming 24/7 AI Sales Executive representing "Prime Estates Real Estate Company".
You MUST follow this exact, strict conversational flow with the customer depending on the service they selected:

**GREETING & INITIAL SERVICE SELECTION (Stage 1)**:
If the customer has not selected a service yet (Service Needed is "Not selected yet" or null), you MUST greet them and output exactly:
"Hi, thanks for choosing us, please select what service you need:
1️⃣ Buy
2️⃣ Rent
3️⃣ Sell
4️⃣ Contact Us"

---

**BRANCH A: BUY FLOW**
1. **Type Selection**: If Service Needed is "Buy" and Real Estate Type is "Not selected yet", ask:
   "Please select real estate Type:
   🏢 Tower
   🏙️ Apartment
   🏡 House / Villa"
2. **Location Selection**: If Real Estate Type is selected but Location Preference is "Not selected yet", ask:
   "Please select your considered locations:
   📍 Janakpuri
   📍 Oxford Street
   📍 Noida
   📍 Gurgaon"
3. **Budget Selection**: If Location is selected but Budget is "Not selected yet", ask:
   "What is your approximate budget range? (e.g. 1.3 Cr, 1.5 Cr, 2.5 Cr)"
4. **Property Recommendations**: If Budget is specified, acknowledge the location/budget match and generate a friendly conversational introduction stating that you have found matching properties (specify the number of matching properties found) and that you are sending each property details separately with images and brochure download buttons below.
   DO NOT output any lists of properties, tables, prices, descriptions, specs, or buttons in your response. Keep it short and conversational.
   
5. **Schedule Site Visit**: If they ask to schedule a site visit (or click the button), reply exactly:
   "Excellent! Let's schedule a site visit for you. Which day works best? 📅"
6. **Confirm Site Visit**: If they select a day (e.g. "Tomorrow", "This Weekend", "Next Week"), reply exactly:
   "📅 *Site Visit Scheduled!*\n\nYour visit has been successfully booked. Our relationship manager will call you shortly to confirm. See you soon! ✨"

---

**BRANCH B: RENT FLOW**
1. **Type Selection**: If Service Needed is "Rent" and Real Estate Type is "Not selected yet", ask:
   "Please select real estate Type:
   🏢 Tower
   🏙️ Apartment
   🏡 House / Villa"
2. **Location Selection**: If Real Estate Type is selected but Location Preference is "Not selected yet", ask:
   "Please select your considered locations:
   📍 Janakpuri
   📍 Oxford Street
   📍 Noida
   📍 Gurgaon"
3. **Rent Budget Selection**: If Location is selected but Budget is "Not selected yet", ask:
   "What is your approximate monthly rent budget range? (e.g. 25k, 50k, 75k)"
4. **Rent Property Recommendations**: If Budget is specified, acknowledge the location/budget match and generate a friendly conversational introduction stating that you have found matching rental properties (specify the number of matching rental properties found) and that you are sending each rental property details separately with images and brochure download buttons below.
   DO NOT output any lists of properties, tables, prices, descriptions, specs, or buttons in your response. Keep it short and conversational.
   
5. **Schedule Rent Site Visit & Confirm**: Follow the same site visit scheduling flow as the Buy branch.

---

**BRANCH C: SELL FLOW**
1. **Request Details**: If Service Needed is "Sell" and the customer hasn't provided location/spec/price details yet, ask:
   "To help you list and sell your property, please share: Location, Configuration (e.g. 3 BHK, Villa), and expected Price in a single reply. 🏢"
2. **Confirm Registration**: Once they provide those details, confirm registration by replying exactly:
   "Thank you! I have registered your property details. One of our valuation experts will call you shortly to assist with the listing and valuation. 📞"

---

**BRANCH D: CONTACT US FLOW**
1. **Show Contact Details**: If Service Needed is "Contact Us", reply exactly with:
   "Here is how you can reach us:
   📞 Phone: +91 99999 99999
   📧 Email: contact@primeestates.com
   📍 Office: Sector 62, Noida, UP, India

   If you would like us to call you back, click the button below:
   [Request Callback 📞]"
2. **Confirm Callback**: If they request a callback (or click the button), reply exactly:
   "Your request for a priority callback has been scheduled! A senior relationship manager will call you within 15 minutes. 📞"

---

Current Lead Profile Status:
- Service Needed: ${leadProfile.purchaseType || 'Not selected yet'}
- Real Estate Type: ${leadProfile.propertyType || 'Not selected yet'}
- Location Preference: ${leadProfile.locationPreference || 'Not selected yet'}
- Budget: ${leadProfile.budget || 'Not selected yet'}

Property Database Matches:
${propertiesText}

Assistant Guidelines:
1. Identify the active branch (Buy, Rent, Sell, Contact Us) based on Service Needed.
2. Only ask the next question in the sequence for that active branch. Do not jump steps.
3. Keep replies concise and formatted perfectly for WhatsApp readability (short lines, bullet points, emojis).
4. Do not preamble or output metadata, write only the WhatsApp message.
`;

    // Start a chat with system instruction
    const chat = model.startChat({
      history: chatHistory.slice(0, -1), // feed previous messages
      generationConfig: {
        maxOutputTokens: 500,
      }
    });

    // Provide context and the last user prompt
    const lastMessageText = chatHistory[chatHistory.length - 1]?.parts[0]?.text || 'Hello';
    const finalPrompt = `${systemPrompt}\n\nUser's latest message: "${lastMessageText}"\n\nGenerate assistant reply:`;

    const result = await chat.sendMessage(finalPrompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Error in generateAIResponse Gemini API. Falling back to Mock responder:', error);
    return generateMockResponse(chatHistory, leadProfile, propertiesContext);
  }
}


// ==========================================
// DEMO MOCK FALLBACKS (If API Key is absent)
// ==========================================

function mockParseLeadDetails(chatHistory: string[]): ExtractedLeadProfile {
  const text = chatHistory.join(' ').toLowerCase();
  
  const profile: ExtractedLeadProfile = {
    name: null,
    city: null,
    propertyType: null,
    locationPreference: null,
    budget: null,
    timeline: null,
    purchaseType: null
  };

  // 1. Service Type (Buy / Rent / Sell / Contact Us)
  if (text.includes('buy')) profile.purchaseType = 'Buy';
  else if (text.includes('rent')) profile.purchaseType = 'Rent';
  else if (text.includes('sell')) profile.purchaseType = 'Sell';
  else if (text.includes('contact')) profile.purchaseType = 'Contact Us';

  // 2. Real estate type (Tower / Apartment / House / Villa)
  if (text.includes('tower')) profile.propertyType = 'Tower';
  else if (text.includes('apartment') || text.includes('flat')) profile.propertyType = 'Apartment';
  else if (text.includes('house') || text.includes('villa')) profile.propertyType = 'House / Villa';
  else if (text.includes('3 bhk') || text.includes('3bhk')) profile.propertyType = '3 BHK';
  else if (text.includes('2 bhk') || text.includes('2bhk')) profile.propertyType = '2 BHK';

  // 3. Location (Janakpuri / Oxford Street / Noida / Gurgaon)
  if (text.includes('janakpuri')) profile.locationPreference = 'Janakpuri';
  else if (text.includes('oxford')) profile.locationPreference = 'Oxford Street';
  else if (text.includes('noida')) profile.locationPreference = 'Noida';
  else if (text.includes('gurgaon')) profile.locationPreference = 'Gurgaon';

  // 4. Budget
  if (text.includes('25k') || text.includes('25,000') || text.includes('25000')) profile.budget = '₹25,000/mo';
  else if (text.includes('50k') || text.includes('50,000') || text.includes('50000')) profile.budget = '₹50,000/mo';
  else if (text.includes('75k') || text.includes('75,000') || text.includes('75000')) profile.budget = '₹75,000/mo';
  else if (text.includes('1.2') || text.includes('1.2cr') || text.includes('1.2 cr')) profile.budget = '₹1.2 Cr';
  else if (text.includes('1.3') || text.includes('1.3cr') || text.includes('1.3 cr') || text.includes('130')) profile.budget = '₹1.3 Cr';
  else if (text.includes('1.5') || text.includes('1.5cr') || text.includes('1.5 cr')) profile.budget = '1.5 Cr';
  else if (text.includes('2.5') || text.includes('2.5cr') || text.includes('2.5 cr')) profile.budget = '₹2.5 Cr';
  else if (text.includes('85 lakh')) profile.budget = '85 Lakhs';

  return profile;
}

function generateMockResponse(
  chatHistory: Array<{ role: 'user' | 'model'; parts: { text: string }[] }>,
  leadProfile: ExtractedLeadProfile,
  propertiesContext: any[]
): string {
  const lastUserText = chatHistory[chatHistory.length - 1]?.parts[0]?.text || '';
  const text = lastUserText.toLowerCase().trim();

  // Global Check: Site visit scheduling clicks / callbacks
  if (text.includes('schedule site visit') || text.includes('schedule_visit')) {
    return `Excellent! Let's schedule a site visit for you. Which day works best? 📅`;
  }
  if (text.includes('tomorrow') || text.includes('this weekend') || text.includes('next week')) {
    return `📅 *Site Visit Scheduled!*\n\nYour visit has been successfully booked. Our relationship manager will call you shortly to confirm. See you soon! ✨`;
  }
  if (text.includes('request callback') || text.includes('callback')) {
    return `Your request for a priority callback has been scheduled! A senior relationship manager will call you within 15 minutes. 📞`;
  }

  // 1. Greeting & Service Selection
  if (!leadProfile.purchaseType) {
    return `Hi, thanks for choosing us, please select what service you need:\n\n1️⃣ *Buy*\n2️⃣ *Rent*\n3️⃣ *Sell*\n4️⃣ *Contact Us*`;
  }

  // BRANCH A: BUY FLOW
  if (leadProfile.purchaseType === 'Buy') {
    if (!leadProfile.propertyType) {
      return `Please select real estate Type:\n\n🏢 *Tower*\n🏙️ *Apartment*\n🏡 *House / Villa*`;
    }
    if (!leadProfile.locationPreference) {
      return `Please select your considered locations:\n\n📍 *Janakpuri*\n📍 *Oxford Street*\n📍 *Noida*\n📍 *Gurgaon*`;
    }
    if (!leadProfile.budget) {
      return `What is your approximate budget range? (e.g. *1.3 Cr*, *1.5 Cr*, *2.5 Cr*) 💰`;
    }

    // Recommendations
    // Recommendations Intro
    if (propertiesContext.length > 0) {
      return `I found ${propertiesContext.length} excellent properties matching your preferences in ${leadProfile.locationPreference} under ${leadProfile.budget}. I am sending the details for each property separately with their images and brochure download links below:`;
    }
    return `📍 I'm looking for listings in *${leadProfile.locationPreference}* matching *${leadProfile.propertyType}* under *${leadProfile.budget}* but did not find any matches. Would you like to schedule a callback with our sales representative to explore nearby inventory? 📞`;
  }

  // BRANCH B: RENT FLOW
  if (leadProfile.purchaseType === 'Rent') {
    if (!leadProfile.propertyType) {
      return `Please select real estate Type:\n\n🏢 *Tower*\n🏙️ *Apartment*\n🏡 *House / Villa*`;
    }
    if (!leadProfile.locationPreference) {
      return `Please select your considered locations:\n\n📍 *Janakpuri*\n📍 *Oxford Street*\n📍 *Noida*\n📍 *Gurgaon*`;
    }
    if (!leadProfile.budget) {
      return `What is your approximate monthly rent budget range? (e.g. *25k*, *50k*, *75k*) 💰`;
    }

    // Rent Recommendations
    // Rent Recommendations Intro
    if (propertiesContext.length > 0) {
      return `I found ${propertiesContext.length} rental properties matching your preferences in ${leadProfile.locationPreference} under ${leadProfile.budget}. I am sending the details for each property separately with their images and brochure download links below:`;
    }
    return `📍 I'm looking for rental listings in *${leadProfile.locationPreference}* matching *${leadProfile.propertyType}* under *${leadProfile.budget}* but did not find any matches. Would you like to schedule a callback with our renting specialist? 📞`;
  }

  // BRANCH C: SELL FLOW
  if (leadProfile.purchaseType === 'Sell') {
    const hasSharedDetails = leadProfile.locationPreference || leadProfile.propertyType || leadProfile.budget;
    if (!hasSharedDetails) {
      return `To help you list and sell your property, please share: Location, Configuration (e.g. 3 BHK, Villa), and expected Price in a single reply. 🏢`;
    }
    return `Thank you! I have registered your property details. One of our valuation experts will call you shortly to assist with the listing and valuation. 📞`;
  }

  // BRANCH D: CONTACT US FLOW
  if (leadProfile.purchaseType === 'Contact Us') {
    return `Here is how you can reach us:\n\n📞 Phone: *+91 99999 99999*\n📧 Email: *contact@primeestates.com*\n📍 Office: *Sector 62, Noida, UP, India*\n\nIf you would like us to call you back, click the button below:\n\n[Request Callback 📞]`;
  }

  return `Hi, thanks for choosing us, please select what service you need:\n\n1️⃣ *Buy*\n2️⃣ *Rent*\n3️⃣ *Sell*\n4️⃣ *Contact Us*`;
}

/**
 * Detects if a message text corresponds to a step requiring interactive buttons or lists,
 * and returns the structured payload for rendering/sending.
 */
export function getInteractivePayload(text: string): any {
  const lowerText = text.toLowerCase();

  // 1. Service Selection
  if (lowerText.includes('service you need') || lowerText.includes('select what service')) {
    return {
      type: 'list',
      buttonText: 'Select Services',
      sections: [
        {
          title: 'Real Estate Services',
          rows: [
            { id: 'Buy', title: 'Buy', description: 'Find properties to buy' },
            { id: 'Rent', title: 'Rent', description: 'Find properties to rent' },
            { id: 'Sell', title: 'Sell', description: 'List your property with us' },
            { id: 'Contact Us', title: 'Contact Us', description: 'Talk to our team' }
          ]
        }
      ]
    };
  }

  // 2. Property Type Selection
  if (lowerText.includes('real estate type') || lowerText.includes('select real estate type')) {
    return {
      type: 'buttons',
      buttons: [
        { id: 'Tower', text: 'Tower' },
        { id: 'Apartment', text: 'Apartment' },
        { id: 'House / Villa', text: 'House / Villa' }
      ]
    };
  }

  // 3. Location Selection
  if (lowerText.includes('considered locations') || lowerText.includes('consider locations')) {
    return {
      type: 'list',
      buttonText: 'Locations',
      sections: [
        {
          title: 'Prime Locations',
          rows: [
            { id: 'Janakpuri', title: 'Janakpuri', description: 'Delhi sector' },
            { id: 'Oxford Street', title: 'Oxford Street', description: 'Premium sector' },
            { id: 'Noida', title: 'Noida', description: 'NCR Sector' },
            { id: 'Gurgaon', title: 'Gurgaon', description: 'IT Hub' }
          ]
        }
      ]
    };
  }

  // 4. Budget Selection
  if (lowerText.includes('budget range') || lowerText.includes('approximate budget') || lowerText.includes('monthly rent')) {
    if (lowerText.includes('monthly') || lowerText.includes('rent') || lowerText.includes('mo') || lowerText.includes('25k')) {
      return {
        type: 'buttons',
        buttons: [
          { id: '25k', text: '25k' },
          { id: '50k', text: '50k' },
          { id: '75k', text: '75k' }
        ]
      };
    }
    return {
      type: 'buttons',
      buttons: [
        { id: '1.3 Cr', text: '1.3 Cr' },
        { id: '1.5 Cr', text: '1.5 Cr' },
        { id: '2.5 Cr', text: '2.5 Cr' }
      ]
    };
  }

  // 4.5 Contact Us Buttons
  if (lowerText.includes('reach us') || lowerText.includes('request callback') || lowerText.includes('email:') || lowerText.includes('contact@') || lowerText.includes('office:')) {
    return {
      type: 'buttons',
      buttons: [
        { id: 'Request Callback', text: 'Request Callback 📞' }
      ]
    };
  }

  // 5. Property Recommendation Buttons
  if (lowerText.includes('schedule site visit') || lowerText.includes('brochure pdf')) {
    const buttons: any[] = [];
    if (lowerText.includes('schedule site visit')) {
      buttons.push({ id: 'Schedule Site Visit', text: 'Schedule Site Visit 📅' });
    }
    if (lowerText.includes('brochure pdf')) {
      buttons.push({ id: 'Brochure PDF', text: 'Brochure PDF 📄' });
    }
    return {
      type: 'buttons',
      buttons
    };
  }

  // 6. Day Selection Buttons
  if (lowerText.includes('works best') && (lowerText.includes('site visit') || lowerText.includes('visit') || lowerText.includes('📅'))) {
    return {
      type: 'buttons',
      buttons: [
        { id: 'Tomorrow', text: 'Tomorrow' },
        { id: 'This Weekend', text: 'This Weekend' },
        { id: 'Next Week', text: 'Next Week' }
      ]
    };
  }

  return null;
}

export function parseBudgetToNumeric(budgetText: string): number {
  if (!budgetText) return 0;
  
  // Remove currency symbols, spaces, and commas
  const cleaned = budgetText.replace(/[₹$,]/g, '').trim().toLowerCase();
  
  // Extract number and unit
  const match = cleaned.match(/^([0-9.]+)\s*(cr|lakh|l|k|mo|monthly)?/);
  if (!match) {
    const fallbackVal = parseFloat(cleaned);
    return isNaN(fallbackVal) ? 0 : fallbackVal;
  }
  
  const num = parseFloat(match[1]);
  const unit = match[2];
  
  if (isNaN(num)) return 0;
  
  if (unit === 'cr') {
    return num * 10000000;
  } else if (unit === 'lakh' || unit === 'l') {
    return num * 100000;
  } else if (unit === 'k') {
    return num * 1000;
  }
  
  // Fallback for raw numbers
  if (num < 1000) {
    // If it's a small number like 1.3, 1.5, 2.5, it's likely Crores
    if (num <= 10) {
      return num * 10000000;
    }
    // If it's a number like 45, 60, 85, it's likely Lakhs
    if (num <= 99) {
      return num * 100000;
    }
  }
  
  return num;
}
