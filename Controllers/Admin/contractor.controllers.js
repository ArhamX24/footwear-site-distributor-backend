import QRCodeLib from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import Product from '../../Models/Product.model.js';
import QRCode from "../../Models/QrCode.model.js";
import { createCanvas, loadImage } from 'canvas';
import PDFDocument from 'pdfkit';
import mongoose from "mongoose";
import stream from "stream"
import QRTracker from "../../Models/QRTracker.model.js";


const generateQRWithLabel = async (qrString, labelData) => {
  try {
    // ── Canvas dimensions at 300 DPI for 50mm × 35mm sticker ─────────────
    // 1mm = 11.811px at 300dpi
    const W = 591;  // 50mm
    const H = 413;  // 35mm
 
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');
 
    // ── White background ──────────────────────────────────────────────────
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
 
    // ── Format sizes as lowestXhighest ───────────────────────────────────
    let sizesText = '';
    if (labelData.sizes) {
      if (Array.isArray(labelData.sizes) && labelData.sizes.length > 0) {
        const nums   = labelData.sizes.map(Number).filter((n) => !isNaN(n));
        const sorted = [...nums].sort((a, b) => a - b);
        sizesText    = sorted.length === 1
          ? sorted[0].toString()
          : `${sorted[0]}X${sorted[sorted.length - 1]}`;
      } else if (typeof labelData.sizes === 'string' && labelData.sizes.trim()) {
        sizesText = labelData.sizes.trim();
      }
    }
 
    // ── Header text ───────────────────────────────────────────────────────
    // Font size: ~11px on 591px-wide canvas ≈ readable at 50mm physical
    const FONT_SIZE  = 22;   // px on canvas (≈ 1.86mm at 300dpi — legible)
    const LINE_H     = FONT_SIZE + 6;
    const PADDING    = 10;
 
    ctx.fillStyle  = '#000000';
    ctx.font       = `bold ${FONT_SIZE}px Arial`;
    ctx.textAlign  = 'left';
    ctx.textBaseline = 'top';
 
    let yPos = PADDING;
 
    // Article name
    const articleLabel = `Art: ${labelData.articleName || ''}`;
    ctx.fillText(articleLabel, PADDING, yPos);
    yPos += LINE_H;
 
    // Size range
    if (sizesText) {
      const sizeLabel = `Size: ${sizesText}`;
      ctx.fillText(sizeLabel, PADDING, yPos);
      yPos += LINE_H;
    }
 
    // ── Thin separator line ───────────────────────────────────────────────
    yPos += 4;
    ctx.strokeStyle = '#bbbbbb';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(PADDING, yPos);
    ctx.lineTo(W - PADDING, yPos);
    ctx.stroke();
    yPos += 6;
 
    // ── QR code — fills remaining canvas space ────────────────────────────
    const qrAreaH = H - yPos - PADDING;   // remaining height
    const qrSize  = Math.min(W - PADDING * 2, qrAreaH);  // square, fits width
 
    // Generate QR at exact pixel size needed — HIGH error correction for small print
    const qrDataURL = await QRCodeLib.toDataURL(qrString, {
      width:                qrSize,
      margin:               1,          // minimal quiet zone (scanners need ~4 modules)
      color:                { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',        // highest — survives small print size
    });
 
    const qrImage = await loadImage(qrDataURL);
 
    // Centre QR horizontally in remaining space
    const qrX = Math.floor((W - qrSize) / 2);
    ctx.drawImage(qrImage, qrX, yPos, qrSize, qrSize);
 
    return canvas.toDataURL('image/png');
 
  } catch (error) {
    console.error('QR label generation error:', error);
    // ── Fallback: pure QR, no canvas ─────────────────────────────────────
    return await QRCodeLib.toDataURL(qrString, {
      width:                400,
      margin:               2,
      color:                { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'H',
    });
  }
};
const trackQRGeneration = async (req, res) => {
  try {
    const { 
      contractorId, 
      contractorName, 
      articleId, 
      articleName, 
      segment, 
      batchId,
      // ✅ NEW: Production details
      bharra,
      printing,
      packing
    } = req.body;

    const tracking = await QRTracker.trackQRGeneration(
      contractorId,
      contractorName,
      articleId,
      articleName,
      segment,
      batchId,
      { bharra, printing, packing }  // ✅ Pass production details
    );

    res.status(200).json({
      result: true,
      message: 'QR generation tracked',
      data: tracking
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to track QR generation',
      error: error.message
    });
  }
};

const generateQRCodes = async (req, res) => {
  try {
    const {
    articleId,
    articleName,
    colors,
    sizes,
    numberOfQRs,
    bharra,
    printing,
    packing,
    cartonPair,    
    colorPrinting, 
    imbozing,     
  } = req.body;
    
    const userId = req.user?.id;
    const contractorName = req.user?.name || 'Unknown Contractor';

    if (!articleName || !colors || !sizes || !numberOfQRs) {
      return res.status(400).json({
        result: false,
        message: 'Article name, colors, sizes, and numberOfQRs required'
      });
    }

    // ✅ Get article data (unchanged)
    let article = null;
    if (articleId) {
      const objectId = new mongoose.Types.ObjectId(articleId);
      const articleData = await Product.aggregate([
        { $unwind: '$variants' },
        { $unwind: '$variants.articles' },
        { $match: { 'variants.articles._id': objectId } },
        {
          $project: {
            articleId: '$variants.articles._id',
            articleName: '$variants.articles.name',
            articleImage: '$variants.articles.image',
            productId: '$_id',
            variantId: '$variants._id',
            variantName: '$variants.name',
            segment: '$segment'
          }
        },
        { $limit: 1 }
      ]);
      article = articleData[0] || null;
    }

    const colorsArray = Array.isArray(colors) ? colors : [colors];
    const sizesArray = Array.isArray(sizes) ? sizes.map(s => parseInt(s)) : [parseInt(sizes)];
    const batchId = `BATCH_${Date.now()}`;
    const qrCodes = [];

    // ✅ Generate ALL QR codes (loop unchanged)
    for (let i = 1; i <= numberOfQRs; i++) {
       const uniqueId = uuidv4();
      
            const qrData = {
              uniqueId,
              articleName,
              contractorInput: {
                articleName,
                articleId: article?.articleId?.toString() || '',
                colors: colorsArray,
                sizes: sizesArray,
                cartonNumber: i,
                totalCartons: numberOfQRs
              },
              batchId,
              status: 'generated'
            };
      
            const qrString = JSON.stringify(qrData);
            const qrCodeImage = await generateQRWithLabel(qrString, {
              articleName,
              colors: colorsArray.join(', '),
              sizes: sizesArray
            });
      
            const qrDoc = new QRCode({
              uniqueId,
              articleName,
              qrData: qrString,
              qrImagePath: qrCodeImage,
              status: 'generated',
              productReference: {
                productId: article?.productId || null,
                variantId: article?.variantId || null,
                articleId: article?.articleId || null,
                variantName: article?.variantName || null,
                articleName: article?.articleName || articleName,
                isMatched: !!article,
                matchedBy: userId ? new mongoose.Types.ObjectId(userId) : null,
                matchedAt: new Date()
              },
              batchInfo: {
                contractorId: userId ? new mongoose.Types.ObjectId(userId) : null,
                batchId
              },
              contractorInput: {
                articleName,
                articleId: article?.articleId?.toString() || '',
                colors: colorsArray,
                sizes: sizesArray,
                cartonNumber: i,
                totalCartons: numberOfQRs
              },
              manufacturingDetails: {
                manufacturedAt: new Date(),
                manufacturedBy: {
                  userId: userId ? new mongoose.Types.ObjectId(userId) : null,
                  userType: 'contractor',
                  name: contractorName
                }
              }
            });
      
      await qrDoc.save();

       qrCodes.push({
        uniqueId,
        qrCodeImage,
        cartonNumber: i,
        labelInfo: {
          articleName,
          colors: colorsArray.join(', '),
          sizes: sizesArray.length === 1 ? sizesArray[0] : `${Math.min(...sizesArray)}X${Math.max(...sizesArray)}`
        }
      });
    }

    // ✅ FIXED: Call tracker ONCE with TOTAL count (AFTER loop)
    const segment = article?.segment || 'Custom';
    const contractorId = userId;

    await QRTracker.trackQRGeneration(
      contractorId,
      contractorName,
      article?.articleId?.toString() || null,
      articleName,
      segment,
      batchId,
      {
        bharra:        bharra        || null,
        printing:      printing      || null,
        packing:       packing       || null,
        cartonPair:    cartonPair    || null,   
        colorPrinting: colorPrinting || null,   
        imbozing:      imbozing      || null,  
      },
      numberOfQRs
    );

    res.json({
      result: true,
      message: `Generated ${numberOfQRs} QR codes`,
      data: { batchId, qrCodes, articleInfo: {
          articleId: article?.articleId || null,
          articleName: article?.articleName || articleName,
          articleImage: article?.articleImage || null,
          productId: article?.productId || null,
          variantId: article?.variantId || null,
          variantName: article?.variantName || null,
          segment: article?.segment || 'Custom',
          colors: colorsArray,
          sizes: sizesArray,
          numberOfQRs
        }}
    });

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'QR generation failed',
      error: error.message
    });
  }
};



const downloadQRCodes = async (req, res) => {
  try {
    const { batchId, articleName } = req.body;

    if (!batchId) {
      return res.status(400).json({ result: false, message: 'batchId is required' });
    }

    // ✅ Query nested field
    const qrCodes = await QRCode.find({ 'batchInfo.batchId': batchId }).lean();

    if (!qrCodes.length) {
      return res.status(404).json({ result: false, message: 'No QR codes found for this batch' });
    }

    const safeName = (articleName || 'Article').replace(/[^a-zA-Z0-9]/g, '_');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="QR_${safeName}_${Date.now()}.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { if (!res.headersSent) res.status(500).end(); });
    archive.pipe(res);

    for (let i = 0; i < qrCodes.length; i++) {
      const qr = qrCodes[i];
      if (!qr.qrImagePath) continue;  // ✅ correct field name

      const base64Data = qr.qrImagePath.replace(/^data:image\/png;base64,/, ''); 
      const buffer = Buffer.from(base64Data, 'base64');
      const cartonNum = qr.contractorInput?.cartonNumber || i + 1;  // ✅
      const fileName = `QR_${safeName}_Carton_${String(cartonNum).padStart(3, '0')}.png`;

      archive.append(buffer, { name: fileName });
    }

    await archive.finalize();

  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ result: false, message: error.message });
    }
  }
};

const generateReceiptPdf = async (req, res) => {
  try {
    const { qrCodes, articleInfo } = req.body;
    const contractorInfo = req.user; // ✅ Get contractor info from authenticated user
    
    if (!qrCodes || qrCodes.length === 0) {
      return res.status(400).json({
        result: false,
        message: 'No QR codes provided for receipt'
      });
    }

    if (!articleInfo) {
      return res.status(400).json({
        result: false,
        message: 'Article info is required'
      });
    }

    // Create PDF document
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition', 
      `attachment; filename=QR_Receipt_${articleInfo.savedAsArticleName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`
    );

    // Pipe PDF to response
    doc.pipe(res);

    // ✅ Header
    doc.fontSize(22).text('QR Code Generation Receipt', { align: 'center' });
    doc.moveDown(1.5);

    // ✅ Contractor Details Section (Fixed positioning)
    const contractorBoxY = doc.y;
    doc.rect(50, contractorBoxY, 500, 60).stroke();
    doc.fontSize(16).text('Contractor Details', 60, contractorBoxY + 10);
    doc.fontSize(12)
       .text(`Name: ${contractorInfo.name || 'N/A'}`, 60, contractorBoxY + 30)
       .text(`Phone No: ${contractorInfo.phoneNo || 'N/A'}`, 60, contractorBoxY + 45);
    
    // Move cursor after contractor box
    doc.y = contractorBoxY + 70;
    doc.moveDown(1);

    // ✅ Article Details Section (Fixed positioning and data access)
    const articleBoxY = doc.y;
    doc.rect(50, articleBoxY, 500, 100).stroke();
    doc.fontSize(16).text('Article Details', 60, articleBoxY + 10);
    
    // ✅ Fixed data access and size formatting
    const articleName = articleInfo.savedAsArticleName || articleInfo.contractorInput || 'N/A';
    const colors = Array.isArray(articleInfo.colors) ? articleInfo.colors.join(', ') : (articleInfo.colors || 'N/A');
    
    // ✅ Use helper function to format sizes as range (3X6 format)
    const sizesDisplay = formatSizeRange(articleInfo.sizes);
    
    doc.fontSize(12)
       .text(`Article Name: ${articleName}`, 60, articleBoxY + 30)
       .text(`Colors: ${colors}`, 60, articleBoxY + 45)
       .text(`Sizes: ${sizesDisplay}`, 60, articleBoxY + 60) // ✅ Now shows 3X6 format
       .text(`Number of Cartons: ${articleInfo.numberOfQRs || qrCodes.length}`, 60, articleBoxY + 75);

    // Move cursor after article box
    doc.y = articleBoxY + 110;
    doc.moveDown(1);

    // ✅ Generation Info
    doc.fontSize(10)
       .text(`Generated on: ${new Date().toLocaleString()}`, 50)
       .text(`Batch ID: ${qrCodes[0]?.batchId || 'N/A'}`, 50);

    doc.moveDown(2);

    // ✅ Footer
    doc.fontSize(10).text(
      'This receipt confirms the generation of QR codes for the specified article batch.',
      50,
      doc.page.height - 100,
      { 
        align: 'center',
        width: 500
      }
    );

    // Finalize PDF
    doc.end();

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to generate receipt PDF',
      error: error.message
    });
  }
};


export {generateQRCodes, downloadQRCodes, generateReceiptPdf, trackQRGeneration}