import mongoose from 'mongoose';
import { Lead, Message } from './src/db/models';
import { config } from './src/config';

async function check() {
  try {
    await mongoose.connect(config.MONGODB_URI);
    console.log('Connected to DB.');
    const count = await Message.countDocuments({});
    console.log(`Total messages in DB: ${count}`);
    
    // Get last 5 messages
    const messages = await Message.find({}).sort({ timestamp: -1 }).limit(5);
    console.log('Last 5 messages:');
    for (const msg of messages) {
      const lead = await Lead.findById(msg.leadId);
      console.log(`- [${msg.sender}] ${lead?.phone || 'unknown'}: "${msg.text}" at ${msg.timestamp.toISOString()}`);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

check();
