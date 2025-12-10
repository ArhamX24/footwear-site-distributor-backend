import PDFDocument from "pdfkit";
import axios from "axios";

/**
 * Format date and time in AM/PM format
 */
const formatDateTime = (dateString) => {
  const date = new Date(dateString);
  
  // Format date
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  // Format time in AM/PM
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  
  return {
    date: `${day}/${month}/${year}`,
    time: `${hours}:${minutes} ${ampm}`
  };
};

/**
 * Download image from URL and convert to buffer
 */
const getImageBuffer = async (imageUrl) => {
  try {
    if (!imageUrl) return null;
    
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 5000
    });
    
    return response.data;
  } catch (error) {
    console.error(`Error downloading image: ${imageUrl}`, error.message);
    return null;
  }
};

/**
 * Generates an Order Performa PDF based on the provided order data.
 */
const finalOrderPerforma = async (order, res) => {
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader("Content-Type", "application/pdf");

  doc.pipe(res);

  // --- Header Section ---
  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .text("Order Performa", 50, 50)
    .moveDown();

  // --- Order Details ---
  const { date, time } = formatDateTime(order.orderDate);
  
  doc.fontSize(10).font("Helvetica");
  doc.text(`Order ID: ${order._id}`, 50, 100);
  doc.text(`Order Date: ${date} at ${time}`, 50, 115);
  
  // Transport Source in Bold
  doc.font("Helvetica-Bold")
     .text(`Transport: ${order.transportSource || 'N/A'}`, 50, 130)
     .font("Helvetica");
  
  doc.text(`Customer Name: ${order.partyName}`, 50, 145);
  doc.moveDown();

  // --- Table Header ---
  const tableTop = 190;

  const imgX = 50, imgWidth = 70;
  const segmentX = 130, segmentWidth = 70;
  const variantX = 210, variantWidth = 70;
  const articleX = 290, articleWidth = 70;
  const colourX = 370, colourWidth = 60;
  const sizeX = 440, sizeWidth = 50;
  const totalX = 500, totalWidth = 60;

  doc.font("Helvetica-Bold")
    .text("Image", imgX, tableTop, { width: imgWidth, align: "center" })
    .text("Segment", segmentX, tableTop, { width: segmentWidth })
    .text("Type", variantX, tableTop, { width: variantWidth })
    .text("Article", articleX, tableTop, { width: articleWidth })
    .text("Colour", colourX, tableTop, { width: colourWidth })
    .text("Size", sizeX, tableTop, { width: sizeWidth })
    .text("Total C/s", totalX, tableTop, { width: totalWidth, align: "right" });

  doc.moveTo(50, tableTop + 20).lineTo(560, tableTop + 20).stroke();

  // --- Table Rows ---
  doc.font("Helvetica");
  let position = tableTop + 30;

  // Process items sequentially to handle async image downloads
  for (let index = 0; index < order.items.length; index++) {
    const item = order.items[index];
    const colorsText = Array.isArray(item.colors) ? item.colors.join(', ') : item.colors;

    // Add row number
    doc.text(`${index + 1}.`, imgX - 20, position, { width: 20 });

    // Try to load and display image
    if (item.articleImg) {
      try {
        const imageBuffer = await getImageBuffer(item.articleImg);
        
        if (imageBuffer) {
          // Add image to PDF (60x60px)
          doc.image(imageBuffer, imgX + 5, position, { 
            width: 60, 
            height: 60,
            fit: [60, 60]
          });
        } else {
          // Fallback: show placeholder text
          doc.fontSize(8)
            .text("No Image", imgX + 5, position + 25, { 
              width: 60, 
              align: "center" 
            })
            .fontSize(10);
        }
      } catch (error) {
        console.error("Error inserting image:", error.message);
        // Fallback if image insertion fails
        doc.fontSize(8)
          .text("Error", imgX + 5, position + 25, { 
              width: 60, 
              align: "center" 
            })
          .fontSize(10);
      }
    }

    // Add text data
    doc
     .text(item.segment || "-", segmentX, position, { width: segmentWidth, ellipsis: true })
     .text(item.variant || "-", variantX, position, { width: variantWidth, ellipsis: true })
     .text(item.articleName || "-", articleX, position, { width: articleWidth, ellipsis: true })
     .text(colorsText || "-", colourX, position, { width: colourWidth, ellipsis: true })
     .text(item.sizes || "-", sizeX, position, { width: sizeWidth, ellipsis: true })
     .text(item.totalCartons || "-", totalX, position, { width: totalWidth, align: "right" });

    position += 70; // Increased spacing for image height

    // Add deal reward if applicable
    if (item.claimedDeal) {
      doc
        .fontSize(9)
        .fillColor("green")
        .text(`🎁 Reward: ${item.dealReward}`, segmentX, position, {
          width: 400
        })
        .fillColor("black")
        .fontSize(10);

      position += 15;
    }

    position += 10; // Extra spacing between rows
  }

  doc.end();
};

export default finalOrderPerforma;
