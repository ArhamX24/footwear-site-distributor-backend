import PDFDocument from "pdfkit";

/**
 * Generates an Order Performa PDF based on the provided order data.
 * It omits any "remarks" and "pair per cartons" fields.
 *
 * @param {Object} order - The order object containing order details.
 * @param {import("express").Response} res - The Express response object.
 */
const finalOrderPerforma = (order, res) => {

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
const segmentX = 50, segmentWidth = 80;
const variantX = 140, variantWidth = 80;
const articleX = 230, articleWidth = 80;
const colourX = 320, colourWidth = 70;
const sizeX = 390, sizeWidth = 60;
const rateX = 460, rateWidth = 60;
const totalX = 520, totalWidth = 70;

  // Draw the header row using bold font
doc.font("Helvetica-Bold")
  .text("Segment", segmentX, tableTop, { width: segmentWidth })
  .text("Type", variantX, tableTop, { width: variantWidth })
  .text("Article Name", articleX, tableTop, { width: articleWidth })
  .text("Colour", colourX, tableTop, { width: colourWidth })
  .text("Size", sizeX, tableTop, { width: sizeWidth })
  .text("Rate per C/s", rateX, tableTop, { width: rateWidth, align: "right" })
  .text("Total C/s", totalX, tableTop, { width: totalWidth, align: "right" });

// Draw a horizontal line under the header
doc.moveTo(segmentX, tableTop + 20).lineTo(totalX + totalWidth, tableTop + 20).stroke();

  // --- Table Rows ---
  doc.font("Helvetica");
  let position = tableTop + 30;

order.items.forEach((item, index) => {
  // const total = item.totalCartons * item.singlePrice;
  const colorsText = Array.isArray(item.colors) ? item.colors.join(', ') : item.colors;

  doc.text(`${index + 1}.`, segmentX - 20, position, { width: 20 })
   .text(item.segment || "-", segmentX, position, { width: segmentWidth, ellipsis: true })
   .text(item.variant || "-", variantX, position, { width: variantWidth, ellipsis: true })
   .text(item.articleName || "-", articleX, position, { width: articleWidth, ellipsis: true })
   .text(colorsText || "-", colourX, position, { width: colourWidth, ellipsis: true })
   .text(item.sizes || "-", sizeX, position, { width: sizeWidth, ellipsis: true })
   .text(item.price ? `Rs. ${item.singlePrice}` : "-", rateX, position, { width: rateWidth, align: "right" })
   .text(item.totalCartons || "-", totalX, position, { width: totalWidth, align: "right" });

  position += 25;

  if (item.claimedDeal) {
    doc
      .fontSize(9)
      .fillColor("green")
      .text(`Reward Claimed: ${item.dealReward}`, itemX, position, {
        width: 400
      })
      .fillColor("black");

    position += 15;
  }
});
  // // --- Order Total ---
  // const orderTotal = order.items.reduce((sum, item) => sum + (item.totalCartons * item.singlePrice), 0);
  // doc.font("Helvetica-Bold")
  //     .text("Total:", 300, position + 20, { width: 90, align: "right" })
  //     .text(`Rs. ${orderTotal.toFixed(2)}`, 400, position + 20, { width: 90, align: "right" });

  // Finalize the PDF and end the stream.
  doc.end();
};

export default finalOrderPerforma;