import mongoose from 'mongoose';
import { Property } from './db/models';
import { config } from './config';

/**
 * Seeds the properties collection with 52 mock properties.
 * @param standalone - If true, this function manages its own mongoose connection (for CLI usage).
 *                     If false, it assumes mongoose is already connected (called from index.ts).
 */
export async function seedDatabase(standalone = true) {
  try {
    if (standalone) {
      console.log(`Connecting to MongoDB at ${config.MONGODB_URI}...`);
      await mongoose.connect(config.MONGODB_URI);
      console.log('Connected successfully.');
    }

    console.log('Cleaning properties collection...');
    await Property.deleteMany({});

    const mockProperties = [];
    
    // Define base lists for generating 50+ realistic properties
    const locations = ['Janakpuri', 'Oxford Street', 'Noida', 'Gurgaon'];
    const types = ['Apartment', 'Tower', 'House / Villa'];
    const amenitiesList = [
      ['Children Park Access', 'Swimming Pool', 'Power Backup Generator', 'Excellent Ventilation'],
      ['High-speed Elevators', 'Concierge Service', 'Rooftop Lounge', '24/7 Security'],
      ['Clubhouse', 'Gymnasium', 'Kids Play Area', 'Rooftop Infinity Pool'],
      ['Private Garden', 'Smart Home Automation', 'Home Theatre Room', 'Golf Course Access'],
      ['Rainwater Harvesting', 'Yoga Lawn', 'Multipurpose Hall', 'Solar Lighting']
    ];
    
    let idCounter = 1;

    // Generate Rent properties (26 properties)
    const rentPrices = [
      { text: 'Rs. 15,000/mo', val: 15000 },
      { text: 'Rs. 20,000/mo', val: 20000 },
      { text: 'Rs. 25,000/mo', val: 25000 },
      { text: 'Rs. 30,000/mo', val: 30000 },
      { text: 'Rs. 35,000/mo', val: 35000 },
      { text: 'Rs. 40,000/mo', val: 40000 },
      { text: 'Rs. 45,000/mo', val: 45000 },
      { text: 'Rs. 50,000/mo', val: 50000 },
      { text: 'Rs. 60,000/mo', val: 60000 },
      { text: 'Rs. 75,000/mo', val: 75000 },
      { text: 'Rs. 90,000/mo', val: 90000 },
      { text: 'Rs. 1.2 Lakhs/mo', val: 120000 },
      { text: 'Rs. 1.5 Lakhs/mo', val: 150000 }
    ];

    for (let i = 0; i < 26; i++) {
      const loc = locations[i % locations.length];
      const type = types[i % types.length];
      const priceObj = rentPrices[i % rentPrices.length];
      const amenities = amenitiesList[i % amenitiesList.length];
      
      const img1 = `/images/prop_img_${(i % 7) + 1}.png`;
      const img2 = `/images/prop_img_${((i + 1) % 7) + 1}.png`;
      const img3 = `/images/prop_img_${((i + 2) % 7) + 1}.png`;
      
      mockProperties.push({
        name: `Prime Rental Home ${idCounter++} (${type})`,
        location: `${loc}, Sector ${10 + i}, NCR`,
        price: priceObj.text,
        priceNumeric: priceObj.val,
        type: type,
        isForRent: true,
        amenities: amenities,
        brochureUrl: `https://example.com/brochures/rent_home_${idCounter}.pdf`,
        imageUrl: img1,
        images: [img1, img2, img3],
        mapUrl: `https://maps.google.com/?q=${loc}+NCR`,
        possessionDate: 'Ready to Move',
        reraNumber: `RERA-RENT-${idCounter}-NCR`
      });
    }

    // Generate Buy properties (26 properties)
    const buyPrices = [
      { text: 'Rs. 45 Lakhs', val: 4500000 },
      { text: 'Rs. 60 Lakhs', val: 6000000 },
      { text: 'Rs. 85 Lakhs', val: 8500000 },
      { text: 'Rs. 1.1 Cr', val: 11000000 },
      { text: 'Rs. 1.3 Cr', val: 13000000 },
      { text: 'Rs. 1.4 Cr', val: 14000000 },
      { text: 'Rs. 1.5 Cr', val: 15000000 },
      { text: 'Rs. 1.8 Cr', val: 18000000 },
      { text: 'Rs. 2.2 Cr', val: 22000000 },
      { text: 'Rs. 2.5 Cr', val: 25000000 },
      { text: 'Rs. 3.2 Cr', val: 32000000 },
      { text: 'Rs. 4.5 Cr', val: 45000000 },
      { text: 'Rs. 5.5 Cr', val: 55000000 }
    ];

    for (let i = 0; i < 26; i++) {
      const loc = locations[i % locations.length];
      const type = types[i % types.length];
      const priceObj = buyPrices[i % buyPrices.length];
      const amenities = amenitiesList[(i + 2) % amenitiesList.length];

      const img1 = `/images/prop_img_${((i + 3) % 7) + 1}.png`;
      const img2 = `/images/prop_img_${((i + 4) % 7) + 1}.png`;
      const img3 = `/images/prop_img_${((i + 5) % 7) + 1}.png`;

      mockProperties.push({
        name: `Prime Residency ${idCounter++} (${type})`,
        location: `${loc}, Sector ${20 + i}, NCR`,
        price: priceObj.text,
        priceNumeric: priceObj.val,
        type: type,
        isForRent: false,
        amenities: amenities,
        brochureUrl: `https://example.com/brochures/buy_home_${idCounter}.pdf`,
        imageUrl: img1,
        images: [img1, img2, img3],
        mapUrl: `https://maps.google.com/?q=${loc}+NCR`,
        possessionDate: i % 2 === 0 ? 'Ready to Move' : `Dec ${2026 + (i % 3)}`,
        reraNumber: `DLRERA-BUY-${idCounter}-NCR`
      });
    }

    await Property.insertMany(mockProperties);
    console.log(`Seeded properties collection successfully with ${mockProperties.length} properties!`);
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    if (standalone) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB.');
    }
  }
}

if (require.main === module) {
  seedDatabase(true);
}
