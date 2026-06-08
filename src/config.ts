import dotenv from 'dotenv';
import path from 'path';

// Load env variables
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

export const config = {
  PORT: process.env.PORT || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/realestate_whatsapp',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  WHITELISTED_PHONES: process.env.WHITELISTED_PHONES
    ? process.env.WHITELISTED_PHONES.split(',').map(p => p.trim()).filter(p => p.length > 0)
    : [],
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || '',
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'my_secure_verify_token',
  WHATSAPP_VERSION: process.env.WHATSAPP_VERSION || 'v20.0'
};
