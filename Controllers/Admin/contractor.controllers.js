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
import { fileURLToPath } from "url";
import path from "path";


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// const logoPath = path.resolve(__dirname, '../../Public/logo.png') 




const generateQRWithLabel = async (qrString, labelData) => {
  try {
    // ── Standard Landscape 100mm × 50mm ──
    const W = 1181;  // 100mm width
    const H = 591;   // 50mm height

    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // ── White background ──────────────────────────────────────────────────
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // ── Format sizes ──────────────────────────────────────────────────────
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

    // ── 1. LAYOUT DIMENSIONS ──────────────────────────────────────────────
    // Make the QR code MASSIVE (550px out of 591px height)
    const qrSize = 550; 
    const qrX = Math.floor((W - qrSize) / 2); 
    const qrY = Math.floor((H - qrSize) / 2);

    // ── 2. DRAW LOGO (Left Column - Rotated Sideways) ─────────────────────
    try {
      const logoPath = path.resolve(__dirname, '../../Public/logo.png') 
      const logoImage = await loadImage(logoPath);
      
      const logoMaxW = 400; // Max width for local sideways space
      const logoMaxH = 260; // Max height for local sideways space
      
      const ratio = Math.min(logoMaxW / logoImage.width, logoMaxH / logoImage.height);
      const logoW = logoImage.width * ratio;
      const logoH = logoImage.height * ratio;
      
      ctx.save();
      // Move to the center of the left blank space
      ctx.translate(qrX / 2, H / 2);
      ctx.rotate(-Math.PI / 2); // Rotate 90 degrees counter-clockwise
      
      // Draw centered in the rotated space
      ctx.drawImage(logoImage, -logoW / 2, -logoH / 2, logoW, logoH);
      ctx.restore();
    } catch (logoErr) {
      console.warn('Could not load logo:', logoErr.message);
    }

    // ── 3. DRAW QR CODE (Center Column) ───────────────────────────────────
    const qrDataURL = await QRCodeLib.toDataURL(qrString, {
      width:                qrSize,
      margin:               0,          
      color:                { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M', 
    });

    const qrImage = await loadImage(qrDataURL);
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    // ── 4. DRAW ROTATED TEXT (Right Column) ───────────────────────────────
    // Find the center of the right blank space
    const rightCenterX = qrX + qrSize + ((W - (qrX + qrSize)) / 2);
    const rightCenterY = H / 2;

    ctx.save();
    ctx.translate(rightCenterX, rightCenterY);
    ctx.rotate(-Math.PI / 2); // Rotate 90 degrees counter-clockwise

    ctx.fillStyle    = '#000000';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const artText = `Art Name - ${labelData.articleName || ''}`;
    const sizeText = sizesText ? `Size - ${sizesText}` : '';

    // Text max width is bounded by sticker height
    const maxTextWidth = H - 60; 

    let fontSize = 48;
    ctx.font = `bold ${fontSize}px Arial`;
    
    let artWidth = ctx.measureText(artText).width;
    if (artWidth > maxTextWidth) {
      fontSize = Math.floor(fontSize * (maxTextWidth / artWidth));
    }

    if (sizeText) {
      ctx.font = `bold ${fontSize}px Arial`;
      // -35 pushes it left (closer to the QR code)
      ctx.fillText(artText, 0, -35); 
      
      let sizeFontSize = 48;
      ctx.font = `bold ${sizeFontSize}px Arial`;
      let sizeWidth = ctx.measureText(sizeText).width;
      
      if (sizeWidth > maxTextWidth) {
        sizeFontSize = Math.floor(sizeFontSize * (maxTextWidth / sizeWidth));
        ctx.font = `bold ${sizeFontSize}px Arial`;
      }
      
      // +35 pushes it right (closer to the outer edge of the sticker)
      ctx.fillText(sizeText, 0, 35); 
    } else {
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.fillText(artText, 0, 0);
    }

    ctx.restore();

    return canvas.toDataURL('image/png', 1.0); 

  } catch (error) {
    console.error('QR label generation error:', error);
    return await QRCodeLib.toDataURL(qrString, {
      width: 600,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
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