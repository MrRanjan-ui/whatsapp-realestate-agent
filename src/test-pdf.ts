import mongoose from 'mongoose';
import { Property } from './db/models';
import { generatePropertyBrochurePDF } from './services/pdfGenerator';
import { config } from './config';

async function test() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.MONGODB_URI);
    console.log('Database connected.');

    const prop = await Property.findOne({ name: /Prime Residency 45/ });
    if (!prop) {
      console.error('No property found in database matching Prime Residency 45.');
      return;
    }

    console.log(`Generating brochure for: ${prop.name}`);
    console.log(`Image URL in DB: ${prop.imageUrl}`);
    console.log(`Images array in DB:`, prop.images);

    const fileName = await generatePropertyBrochurePDF(prop);
    console.log(`Brochure generated successfully: ${fileName}`);
  } catch (error) {
    console.error('Error in PDF generation test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

test();