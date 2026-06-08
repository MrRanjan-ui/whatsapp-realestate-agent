import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

/**
 * Dynamically builds a beautiful PDF brochure for matching real estate properties at a given location preference.
 * Saves it inside /public/brochures/ and returns the generated filename.
 */
export async function generateBrochurePDF(location: string, properties: any[]): Promise<string> {
  const brochuresDir = path.join(__dirname, '../../public/brochures');
  
  // Ensure brochures directory exists
  if (!fs.existsSync(brochuresDir)) {
    fs.mkdirSync(brochuresDir, { recursive: true });
  }

  const cleanLocationName = location.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `${cleanLocationName}_Brochure.pdf`;
  const filePath = path.join(brochuresDir, fileName);

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Styling Colors
      const primaryColor = '#1e3a8a'; // Deep Navy Blue
      const secondaryColor = '#b45309'; // Warm Gold/Amber
      const textColor = '#334155'; // Slate Gray
      const lightBg = '#f8fafc'; // Light gray-blue background card

      // 1. Header Banner
      doc.rect(0, 0, doc.page.width, 140).fill(primaryColor);
      
      doc.fillColor('#ffffff')
         .fontSize(24)
         .font('Helvetica-Bold')
         .text('PRIME ESTATES', 40, 40)
         .fontSize(12)
         .font('Helvetica')
         .text('Your Trusted Partner in Premium Real Estate', 40, 70);

      doc.fillColor(secondaryColor)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text(`PROPERTY CATALOG - ${location.toUpperCase()}`, 40, 105);

      doc.y = 170;

      if (properties.length === 0) {
        doc.fillColor(textColor)
           .fontSize(12)
           .font('Helvetica')
           .text('No current listings match this criteria at this time. Please contact our main office for surrounding inventory.', 40, doc.y);
      } else {
        // Loop through properties (limit to top 6 to keep brochure size sensible)
        const propsToRender = properties.slice(0, 6);
        
        for (let index = 0; index < propsToRender.length; index++) {
          const prop = propsToRender[index];

          // Draw property boundary card
          const startY = doc.y;
          doc.rect(40, startY, 532, 170).fill(lightBg);
          doc.rect(40, startY, 5, 170).fill(secondaryColor); // Accent border

          // Resolve image path locally and draw it on the left of the card
          let imageDrawn = false;
          if (prop.imageUrl) {
            try {
              let relativePath = prop.imageUrl;
              if (prop.imageUrl.startsWith('http')) {
                try {
                  const urlObj = new URL(prop.imageUrl);
                  relativePath = urlObj.pathname;
                } catch (e) {
                  // ignore
                }
              }
              const resolvedPath = path.join(__dirname, '../../public', relativePath);
              if (fs.existsSync(resolvedPath)) {
                doc.image(resolvedPath, 55, startY + 15, { width: 140, height: 140 });
                imageDrawn = true;
              }
            } catch (err) {
              console.error(`Failed to embed property image in PDF for ${prop.name}:`, err);
            }
          }

          // Write Property details on the right of the card
          const textX = imageDrawn ? 210 : 60;
          
          doc.fillColor(primaryColor)
             .fontSize(14)
             .font('Helvetica-Bold')
             .text(prop.name, textX, startY + 15);

          const displayPrice = prop.price.replace(/₹/g, 'Rs. ');
          doc.fillColor(secondaryColor)
             .fontSize(12)
             .font('Helvetica-Bold')
             .text(`${prop.isForRent ? 'Rent' : 'Price'}: ${displayPrice}`, textX, startY + 35);

          doc.fillColor(textColor)
             .fontSize(10)
             .font('Helvetica')
             .text(`📍 Location: ${prop.location}`, textX, startY + 52)
             .text(`🏢 Type: ${prop.type}`, textX, startY + 67)
             .text(`📅 Possession: ${prop.possessionDate}`, textX, startY + 82)
             .text(`📋 RERA No: ${prop.reraNumber}`, textX, startY + 97);

          // Write Amenities
          if (prop.amenities && prop.amenities.length > 0) {
            doc.fillColor(primaryColor)
               .fontSize(10)
               .font('Helvetica-Bold')
               .text('Amenities:', textX, startY + 117);
               
            doc.fillColor(textColor)
               .fontSize(9)
               .font('Helvetica')
               .text(prop.amenities.slice(0, 4).join('  |  '), textX, startY + 130);
          }

          // Adjust doc y pointer for the next property (leaving spacing)
          doc.y = startY + 185;

          // Page breaks check (A4 height is ~841 points. Margin bottom is 40. Keep cards within boundary.)
          if (doc.y > 620 && index < propsToRender.length - 1) {
            doc.addPage();
            // Draw small branding banner on the next page
            doc.rect(0, 0, doc.page.width, 35).fill(primaryColor);
            doc.y = 55;
          }
        }
      }

      // 3. Footer Banner
      const footerY = doc.page.height - 35;
      doc.rect(0, footerY, doc.page.width, 35).fill(primaryColor);
      doc.fillColor('#ffffff')
         .fontSize(9)
         .font('Helvetica')
         .text('Prime Estates Real Estate Corporation  |  Phone: +91 99999 99999  |  Email: contact@primeestates.com', 40, footerY + 13, { align: 'center' });

      doc.end();

      writeStream.on('finish', () => {
        resolve(fileName);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates an ultra-premium 5-page dark-themed brochure PDF specifically for a single property.
 * Saves it in /public/brochures/ and returns the generated filename.
 */
export async function generatePropertyBrochurePDF(prop: any): Promise<string> {
  const brochuresDir = path.join(__dirname, '../../public/brochures');
  if (!fs.existsSync(brochuresDir)) {
    fs.mkdirSync(brochuresDir, { recursive: true });
  }

  const cleanPropName = prop.name.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `${cleanPropName}_Brochure.pdf`;
  const filePath = path.join(brochuresDir, fileName);

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Dark Theme Colors
      const bgColor = '#0f172a'; // Deep Navy Slate
      const goldColor = '#f59e0b'; // Premium Amber Gold
      const whiteColor = '#ffffff';
      const textMuted = '#cbd5e1'; // Light Slate Muted
      const cardBg = '#1e293b'; // Slate Gray for Cards

      // Helper to paint page background
      const applyBg = () => {
        doc.rect(0, 0, doc.page.width, doc.page.height).fill(bgColor);
      };

      // Helper to draw common header/footer branding
      const drawBranding = (pageNumber: number) => {
        doc.rect(0, 0, doc.page.width, 35).fill('#1e293b');
        doc.fillColor(goldColor)
           .fontSize(10)
           .font('Helvetica-Bold')
           .text('PRIME ESTATES LUXURY COLLECTION', 40, 13);
           
        doc.fillColor(whiteColor)
           .fontSize(9)
           .font('Helvetica')
           .text(`Page ${pageNumber} of 5`, doc.page.width - 100, 13, { align: 'right', width: 60 });
           
        // Footer line
        doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill('#1e293b');
        doc.fillColor(textMuted)
           .fontSize(8)
           .text('Contact us at sales@primeestates.com  |  RERA Verified properties', 40, doc.page.height - 18, { align: 'center', width: doc.page.width - 80 });
      };

      // Calculate dynamic specifications and clean currency symbols for standard PDF Helvetica font compatibility
      const displayPrice = prop.price.replace(/₹/g, 'Rs. ');
      const area = prop.type === 'House / Villa' ? '3,200 Sq.Ft.' : (prop.type === 'Tower' ? '1,850 Sq.Ft.' : '1,450 Sq.Ft.');
      const parking = prop.type === 'House / Villa' ? '3 Covered Spaces' : '2 Reserved Spaces';
      const floors = prop.type === 'House / Villa' ? 'G + 2 Storeys' : '18 Residential Floors';
      const security = '24/7 CCTV & Smart Card Access';

      // ==========================================
      // PAGE 1: COVER PAGE
      // ==========================================
      applyBg();
      
      // Decorative gold borders
      doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke(goldColor);

      doc.fillColor(goldColor)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('P R I M E   E S T A T E S', 40, 60, { align: 'center' });

      doc.fillColor(whiteColor)
         .fontSize(28)
         .font('Helvetica-Bold')
         .text(prop.name.toUpperCase(), 40, 100, { align: 'center' });

      doc.fillColor(textMuted)
         .fontSize(14)
         .font('Helvetica')
         .text(`Exclusive Premium Residence at ${prop.location.split(',')[0]}`, 40, 140, { align: 'center' });

      // Helper to resolve local paths
      const resolveLocalImgPath = (imgUrl: string) => {
        if (!imgUrl) return null;
        let relativePath = imgUrl;
        if (imgUrl.startsWith('http')) {
          try {
            const urlObj = new URL(imgUrl);
            relativePath = urlObj.pathname;
          } catch (e) {
            return null;
          }
        }
        const resolvedPath = path.join(__dirname, '../../public', relativePath);
        if (fs.existsSync(resolvedPath)) {
          return resolvedPath;
        }
        return null;
      };

      const img1Path = resolveLocalImgPath(prop.images?.[0] || prop.imageUrl);
      const img2Path = resolveLocalImgPath(prop.images?.[1] || prop.imageUrl);
      const img3Path = resolveLocalImgPath(prop.images?.[2] || prop.imageUrl);

      // Embed Hero Image on cover with gold frame
      if (img1Path) {
        try {
          doc.rect(68, 208, 464, 284).fill(goldColor);
          doc.image(img1Path, 70, 210, { width: 460, height: 280 });
        } catch (err) {
          console.error('Failed to embed image 1 on cover page:', err);
        }
      }

      doc.fillColor(goldColor)
         .fontSize(18)
         .font('Helvetica-Bold')
         .text(displayPrice, 40, 530, { align: 'center' });

      doc.fillColor(textMuted)
         .fontSize(10)
         .font('Helvetica')
         .text('OFFICIAL PROPERTY BROCHURE', 40, 600, { align: 'center' });

      // ==========================================
      // PAGE 2: PROJECT OVERVIEW
      // ==========================================
      doc.addPage();
      applyBg();
      drawBranding(2);

      doc.fillColor(goldColor)
         .fontSize(18)
         .font('Helvetica-Bold')
         .text('PROJECT OVERVIEW', 40, 70);

      const overviewText = `Welcome to ${prop.name}, where luxury meets architectural innovation. Designed for individuals who appreciate premium living, this estate offers a harmonious blend of style, space, and functionality. Every corner is crafted with high-grade construction standards, showcasing exquisite finishing and meticulous details.\n\nNestled in the prime zone of ${prop.location}, this development represents a prestigious address providing outstanding connectivity to commercial districts and essential family facilities.`;

      doc.fillColor(whiteColor)
         .fontSize(11)
         .font('Helvetica')
         .text(overviewText, 40, 105, { lineGap: 6, width: 512 });

      // Embed Image 2 on Page 2
      if (img2Path) {
        try {
          doc.rect(178, 208, 244, 144).fill(goldColor);
          doc.image(img2Path, 180, 210, { width: 240, height: 140 });
        } catch (err) {
          console.error('Failed to embed image 2 on Page 2:', err);
        }
      }

      // Property specifications Card
      const cardY = img2Path ? 370 : 260;
      doc.rect(40, cardY, 512, 160).fill(cardBg);
      doc.rect(40, cardY, 5, 160).fill(goldColor);

      doc.fillColor(goldColor)
         .fontSize(11)
         .font('Helvetica-Bold')
         .text('KEY SPECIFICATIONS', 60, cardY + 12);

      const specY = cardY + 32;
      doc.fillColor(whiteColor)
         .fontSize(9)
         
         .font('Helvetica-Bold').text('Location Preference:', 60, specY)
         .font('Helvetica').text(prop.location, 180, specY)
         
         .font('Helvetica-Bold').text('Pricing Tier:', 60, specY + 14)
         .font('Helvetica').text(displayPrice, 180, specY + 14)
         
         .font('Helvetica-Bold').text('Property Type:', 60, specY + 28)
         .font('Helvetica').text(`${prop.type} (${area})`, 180, specY + 28)
         
         .font('Helvetica-Bold').text('Parking & Access:', 60, specY + 42)
         .font('Helvetica').text(parking, 180, specY + 42)
         
         .font('Helvetica-Bold').text('Security Level:', 60, specY + 56)
         .font('Helvetica').text(security, 180, specY + 56)
         
         .font('Helvetica-Bold').text('Height/Configuration:', 60, specY + 70)
         .font('Helvetica').text(floors, 180, specY + 70)
         
         .font('Helvetica-Bold').text('Possession Date:', 60, specY + 84)
         .font('Helvetica').text(prop.possessionDate, 180, specY + 84)
         
         .font('Helvetica-Bold').text('RERA Registration:', 60, specY + 98)
         .font('Helvetica').text(prop.reraNumber, 180, specY + 98);

      // ==========================================
      // PAGE 3: AMENITIES & LIFESTYLE
      // ==========================================
      doc.addPage();
      applyBg();
      drawBranding(3);

      doc.fillColor(goldColor)
         .fontSize(18)
         .font('Helvetica-Bold')
         .text('AMENITIES & LIFESTYLE', 40, 70);

      doc.fillColor(whiteColor)
         .fontSize(11)
         .font('Helvetica')
         .text('Every detail of our luxury masterplan is designed to provide residents with an incomparable quality of life, featuring high-quality community amenities:', 40, 105, { lineGap: 4, width: 512 });

      let amenityY = 160;
      const amenityDetails: Record<string, string> = {
        'Children Park Access': 'A safe, beautifully landscaped park built with premium play equipment for children to play and thrive.',
        'Swimming Pool': 'A temperature-controlled luxury pool with sun decks and premium lounge chairs for absolute relaxation.',
        'Power Backup Generator': 'Seamless 24/7 power backup systems ensuring zero disruptions to your comfort and workflow.',
        'Excellent Ventilation': 'State-of-the-art architectural drafting that ensures fresh natural airflow and plenty of sunlight.',
        'High-speed Elevators': 'Ultra-modern, secure, and rapid transit elevators servicing all residential storeys.',
        'Concierge Service': '24/7 dedicated support staff to assist you with housekeeping, parcel deliveries, and bookings.',
        'Rooftop Lounge': 'A modern terrace lounge offering beautiful panoramic views of the skyline for social gatherings.',
        'Clubhouse': 'A multi-utility community centre for meetings, birthday parties, and recreational board games.',
        'Gymnasium': 'A well-equipped fitness hub with international cardiovascular and weightlifting machines.'
      };

      const amenitiesToRender = prop.amenities.slice(0, 4);
      for (const amenity of amenitiesToRender) {
        doc.rect(40, amenityY, 512, 55).fill(cardBg);
        doc.rect(40, amenityY, 3, 55).fill(goldColor);

        doc.fillColor(goldColor)
           .fontSize(11)
           .font('Helvetica-Bold')
           .text(amenity, 60, amenityY + 12);

        const desc = amenityDetails[amenity] || 'State-of-the-art facilities engineered to match premium residency standards and security.';
        doc.fillColor(whiteColor)
           .fontSize(9)
           .font('Helvetica')
           .text(desc, 60, amenityY + 28, { width: 472 });

        amenityY += 65;
      }

      // Embed Image 3 at the bottom of Page 3
      if (img3Path) {
        try {
          doc.rect(178, 438, 244, 144).fill(goldColor);
          doc.image(img3Path, 180, 440, { width: 240, height: 140 });
        } catch (err) {
          console.error('Failed to embed image 3 on Page 3:', err);
        }
      }

      // ==========================================
      // PAGE 4: FLOOR PLAN & SPECIFICATIONS
      // ==========================================
      doc.addPage();
      applyBg();
      drawBranding(4);

      doc.fillColor(goldColor)
         .fontSize(18)
         .font('Helvetica-Bold')
         .text('FLOOR PLANS & SPECIFICATIONS', 40, 70);

      // Section: Structure & Design
      doc.fillColor(goldColor).fontSize(12).font('Helvetica-Bold').text('STRUCTURE & CONCRETE', 40, 105);
      doc.fillColor(whiteColor).fontSize(10).font('Helvetica')
         .text('• Seismic Zone compliant RCC Framed Structure with high-strength monolithic columns.\n• Premium concrete walls offering thermal protection and superior acoustic insulation.', 40, 125, { lineGap: 4 });

      // Section: Flooring & Finishing
      doc.fillColor(goldColor).fontSize(12).font('Helvetica-Bold').text('PREMIUM FINISHES & FITTINGS', 40, 185);
      doc.fillColor(whiteColor).fontSize(10).font('Helvetica')
         .text('• Living and Dining areas adorned with Italian Vitrified Tiles.\n• Master Bedrooms featuring European laminated wooden floorboards.\n• Anti-skid ceramic tiles inside modular washrooms and open balconies.\n• Kitchen equipped with modular quartz countertops, utility sinks, and built-in exhaust chimney.', 40, 205, { lineGap: 4 });

      // Section: Electrical & HVAC
      doc.fillColor(goldColor).fontSize(12).font('Helvetica-Bold').text('ELECTRICAL & AUTOMATION', 40, 305);
      doc.fillColor(whiteColor).fontSize(10).font('Helvetica')
         .text('• Heavy-duty concealed copper wiring with modular switches (Schneider or Legrand).\n• Optical fiber connection for smart TV, inter-com networks, and high-speed Wi-Fi.\n• Pre-installed split AC piping and designated outdoor units placements.', 40, 325, { lineGap: 4 });

      // Mock layout measurements card
      doc.rect(40, 410, 512, 110).fill(cardBg);
      doc.rect(40, 410, 5, 110).fill(goldColor);
      
      doc.fillColor(goldColor).fontSize(11).font('Helvetica-Bold').text('DETAILED CONFIGURATION LAYOUT', 60, 425);
      doc.fillColor(whiteColor).fontSize(9).font('Helvetica')
         .text('• Master Bedroom: 14\'0" x 12\'0"  |  Attached Washroom: 8\'0" x 6\'0"\n• Guest Bedroom: 11\'0" x 12\'0"  |  Common Washroom: 5\'0" x 8\'0"\n• Living / Dining Hall: 18\'0" x 16\'0"  |  Kitchen Layout: 10\'0" x 8\'0"\n• Covered Balconies: 5\'0" wide with premium glass railings.', 60, 445, { lineGap: 5 });

      // ==========================================
      // PAGE 5: LOCATION CONNECTIVITY
      // ==========================================
      doc.addPage();
      applyBg();
      drawBranding(5);

      doc.fillColor(goldColor)
         .fontSize(18)
         .font('Helvetica-Bold')
         .text('CONNECTIVITY & LOCATION', 40, 70);

      const locationDetails = `This luxury project is situated in a prime residential belt of NCR. This region is well-integrated with commercial corridors, high-speed expressways, and premium lifestyle centers, offering residents smooth daily commuting and premium access.`;
      doc.fillColor(whiteColor)
         .fontSize(11)
         .font('Helvetica')
         .text(locationDetails, 40, 105, { lineGap: 5, width: 512 });

      // Connectivity Matrix Card
      doc.rect(40, 190, 512, 160).fill(cardBg);
      doc.rect(40, 190, 5, 160).fill(goldColor);

      doc.fillColor(goldColor).fontSize(12).font('Helvetica-Bold').text('TRANSIT CONNECTIVITY MATRIX', 60, 210);
      
      const connY = 240;
      doc.fillColor(whiteColor).fontSize(10)
         .font('Helvetica-Bold').text('Metro Station / Transit Hub:', 60, connY)
         .font('Helvetica').text('5 mins walk (400 meters)', 250, connY)
         
         .font('Helvetica-Bold').text('Commercial IT District:', 60, connY + 20)
         .font('Helvetica').text('10 mins drive (4.2 Kms)', 250, connY + 20)
         
         .font('Helvetica-Bold').text('International Airport:', 60, connY + 40)
         .font('Helvetica').text('45 mins drive (32 Kms)', 250, connY + 40)
         
         .font('Helvetica-Bold').text('Super Specialty Hospital:', 60, connY + 60)
         .font('Helvetica').text('8 mins drive (2.5 Kms)', 250, connY + 60)
         
         .font('Helvetica-Bold').text('Elite International School:', 60, connY + 80)
         .font('Helvetica').text('6 mins drive (1.8 Kms)', 250, connY + 80);

      // Call To Action Box
      doc.rect(40, 390, 512, 140).fill('#1e3a8a'); // Luxury Blue Card
      doc.rect(40, 390, 5, 140).fill(goldColor);

      doc.fillColor(whiteColor)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('SCHEDULE A PERSONALIZED SITE VISIT', 60, 410);

      doc.fillColor(textMuted)
         .fontSize(10)
         .font('Helvetica')
         .text('Request a private tour of the sample flat and project site. Our dedicated relationship manager will escort you and outline exclusive booking offers.', 60, 430, { width: 472, lineGap: 3 });

      doc.fillColor(goldColor)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text('📞 Hotline: +91 99999 99999  |  ✉️ sales@primeestates.com', 60, 490);

      doc.end();

      writeStream.on('finish', () => {
        resolve(fileName);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}
