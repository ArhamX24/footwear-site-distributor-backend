// orderPerformaGenerator.js
import PDFDocument from "pdfkit"

/**
 * Generates an Order Performa PDF based on the provided order data.
 * It omits any "remarks" and "pair per cartons" fields.
 *
 * @param {Object} order - The order object containing order details.
 * @param {import("express").Response} res - The Express response object.
 */
const generateOrderPerformaPDF = (order, res) => {
      
  // Create a new PDF document with some margins.
  const doc = new PDFDocument({ margin: 50 });

  // Set headers so that the PDF is served as an attachment.
  res.setHeader("Content-Disposition", `attachment; filename="order_performa_${order._id}.pdf"`);
  res.setHeader("Content-Type", "application/pdf");

  // Pipe PDF document to the response.
  doc.pipe(res);

  // --- Header Section ---
  doc
    .fontSize(20)
    .text("Order Performa", 50, 50)
    .moveDown();

  // --- Order Details ---
  doc.fontSize(10);
  doc.text(`Order ID: ${order._id}`, 50, 100);
  doc.text(`Order Date: ${order.orderDate}`, 50, 115);
  doc.text(`Customer Name: ${order.partyName}`, 50, 130);
  doc.moveDown();

  // --- Table Header ---
// Define the starting vertical position of the table
// Define the starting vertical position of the table
const tableTop = 180;

// Adjusted column positions & widths for proper alignment
const itemX = 50, itemWidth = 80;
const colourX = 140, colourWidth = 80;
const sizeX = 230, sizeWidth = 80;
const totalCartonsX = 320, totalCartonsWidth = 70;
const rateX = 400, rateWidth = 70;
const totalX = 480, totalWidth = 70;

// Draw the header row using bold font
doc.font("Helvetica-Bold")
  .text("Item", itemX, tableTop, { width: itemWidth })
  .text("Colour", colourX, tableTop, { width: colourWidth })
  .text("Size", sizeX, tableTop, { width: sizeWidth })
  .text("Total C/s", totalCartonsX, tableTop, { width: totalCartonsWidth, align: "right" })
  .text("Rate per C/s", rateX, tableTop, { width: rateWidth, align: "right" })
  .text("Total", totalX, tableTop, { width: totalWidth, align: "right" });

// Draw a horizontal line under the header
doc.moveTo(itemX, tableTop + 20).lineTo(totalX + totalWidth, tableTop + 20).stroke();

// --- Table Rows ---
doc.font("Helvetica");
let position = tableTop + 30;

order.items.forEach((item) => {
  const total = item.totalCartons * item.price;
  
  // Convert arrays to comma-separated strings
  const colorsText = Array.isArray(item.colors) ? item.colors.join(', ') : item.colors;

  // Write each field with updated widths to prevent overflow
  doc.text(item.articleName, itemX, position, { width: itemWidth, ellipsis: true })
     .text(colorsText, colourX, position, { width: colourWidth, ellipsis: true })
     .text(item.sizes, sizeX, position, { width: sizeWidth, ellipsis: true })
     .text(item.totalCartons, totalCartonsX, position, { width: totalCartonsWidth, align: "right" })
     .text(`$${item.price.toFixed(2)}`, rateX, position, { width: rateWidth, align: "right" })
     .text(`$${total.toFixed(2)}`, totalX, position, { width: totalWidth, align: "right" });

  position += 25;
});

// Ensure document is properly finalized
// doc.end();


  // --- Order Total ---
  const orderTotal = order.items.reduce((sum, item) => sum + (item.totalCartons * item.price), 0);
  doc.font("Helvetica-Bold")
    .text("Total:", 300, position + 20, { width: 90, align: "right" })
    .text(`$${orderTotal.toFixed(2)}`, 400, position + 20, { width: 90, align: "right" });

  // --- Footer ---
  doc
    .fontSize(10)
    .font("Helvetica")
    .text("Thank you for your order!", 50, 700, {
      align: "center",
      width: 500,
    });

  // Finalize the PDF and end the stream.
  doc.end();
};

export default generateOrderPerformaPDF