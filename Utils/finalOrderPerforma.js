import PDFDocument from "pdfkit";

/**
 * Generates an Order Performa PDF based on the provided order data.
 * It omits any "remarks" and "pair per cartons" fields.
 *
 * @param {Object} order - The order object containing order details.
 * @param {import("express").Response} res - The Express response object.
 */
const finalOrderPerforma = (order, res) => {

  console.log(order)
      
  // Create a new PDF document with some margins.
  const doc = new PDFDocument({ margin: 50 });

  // Set headers so that the PDF is served as an attachment.
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
  const tableTop = 180;

  // Adjusted column positions & widths for proper alignment
const itemX = 50, itemWidth = 80;
const variantX = 140, variantWidth = 80;
const colourX = 230, colourWidth = 80;
const sizeX = 320, sizeWidth = 70;
const totalCartonsX = 390, totalCartonsWidth = 60;
const rateX = 460, rateWidth = 60; // Shrunk width
const totalX = 520, totalWidth = 70; // Adjusted to prevent overflow

  // Draw the header row using bold font
doc.font("Helvetica-Bold")
  .text("Article Name", itemX, tableTop, { width: itemWidth })
  .text("Variant", variantX, tableTop, { width: variantWidth })
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

order.items.forEach((item, index) => {
  const total = item.totalCartons * item.singlePrice;
  const colorsText = Array.isArray(item.colors) ? item.colors.join(', ') : item.colors;

  doc.text(`${index + 1}.`, itemX - 20, position, { width: 20 })
     .text(item.articleName, itemX, position, { width: itemWidth, ellipsis: true })
     .text(item.variant ? item.variant : "-", variantX, position, { width: variantWidth, ellipsis: true })
     .text(colorsText, colourX, position, { width: colourWidth, ellipsis: true })
     .text(item.sizes, sizeX, position, { width: sizeWidth, ellipsis: true })
     .text(item.totalCartons, totalCartonsX, position, { width: totalCartonsWidth, align: "right" })
     .text(`₹${item.singlePrice}`, rateX, position, { width: rateWidth, align: "right" })
     .text(`₹${total.toFixed(2)}`, totalX, position, { width: totalWidth, align: "right" });

  position += 25;
});
  // --- Order Total ---
  const orderTotal = order.items.reduce((sum, item) => sum + (item.totalCartons * item.singlePrice), 0);
  doc.font("Helvetica-Bold")
      .text("Total:", 300, position + 20, { width: 90, align: "right" })
      .text(`\u20B9${orderTotal.toFixed(2)}`, 400, position + 20, { width: 90, align: "right" });

  // Finalize the PDF and end the stream.
  doc.end();
};

export default finalOrderPerforma;