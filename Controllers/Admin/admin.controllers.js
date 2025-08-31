import AdminModel from "../../Models/Admin.model.js";
import zod from "zod"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import statuscodes from "../../Utils/statuscodes.js";
import userModel from "../../Models/distributor.model.js";
import purchaseProductModel from "../../Models/Purchasedproduct.model.js";
import finalOrderPerforma from "../../Utils/finalOrderPerforma.js";
import Festive from "../../Models/Festivle.model.js";
import { uploadOnCloudinary } from "../../Utils/cloudinary.js";
import QrCode from 'qrcode'
import Inventory from "../../Models/Inventor.model.js";
import QRCodeLib from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { Product, QRCode, QRCode as QRCodeModel} from '../../Models/Product.model.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const validationSchema = zod.object({
    phoneNo: zod
      .string()
      .refine((val) => val.toString().length === 10, {
        message: "Phone number must be 10 digits",
      }),
    password: zod
      .string()
});

const loginValidationSchema = zod.object({
    phoneNo: zod
      .string()
      .refine((val) => val.toString().length === 10, {
        message: "Phone number must be 10 digits",
      }),
    password: zod
    .string()
})

const distributorValidationSchema = zod.object({
  
  partyName: zod.string({
    required_error: "Party name is required",
    invalid_type_error: "Party name must be a Alphabet"
  }).min(1, "Party name cannot be empty"),
  
  transport: zod.string({
    required_error: "Transport is required",
    invalid_type_error: "Transport must be a Alphabet"
  }).min(1, "Transport information cannot be empty"),
  
})

let cookieOption = {
    path: "/",
    httpOnly: true,
    secure: true,
    // sameSite: 'Lax'
    sameSite: 'none'
}

const register = async (req,res) => {
    try {
        let userdata = req?.body

        let checkData = validationSchema.safeParse({phoneNo: userdata.phoneNo, password: userdata.password});

        // if(!checkData.success){
        //     return res.status(statuscodes.badRequest).send({result: false, message: checkData.error.errors[0].message, error: checkData.error})
        // }

        let alreadyInDb = await AdminModel.findOne({phoneNo: userdata.phoneNo})

        if(alreadyInDb){
            return res.status(statuscodes.notFound).send({result: false, message: "Account With This Phone Number Already Exists"})
        }

        await AdminModel.create({
            phoneNo: userdata.phoneNo,
            password: userdata.password,
            role: "admin"
        })

        return res.status(statuscodes.success).send({result: true, message: "Admin Created"})
    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error Creating Admin. Please Try Again Later", error: error})
    }
}

const login = async (req,res) => {
    try {
        let userdata = req?.body

        let checkData = loginValidationSchema.safeParse({phoneNo: userdata.phoneNo, password: userdata.password});

        if(!checkData.success){
            return res.status(statuscodes.badRequest).send({result: false, message: checkData.error.errors[0].message})
        }

        let alreadyInDb = await AdminModel.findOne({phoneNo: userdata.phoneNo}).select("-refreshToken")

        if(!alreadyInDb){
            return res.status(statuscodes.notFound).send({result: false, message: "Account Not Found"})
        }

        let comparePassword = await bcrypt.compare(userdata.password, alreadyInDb.password)

        if(!comparePassword){
            return res.status(statuscodes.unauthorized).send({result:false, message: "Incorrect Password"})
        }

        const accessToken = jwt.sign({
            _id: alreadyInDb._id ,phoneNo: alreadyInDb.phoneNo, role: "admin"}
            ,process.env.ACCESS_JWT_SECRET, 
            {expiresIn: process.env.ACCESS_JWT_EXPIRY
        })

        const refreshToken = jwt.sign({
            _id: alreadyInDb._id,
            phoneNo: alreadyInDb.phoneNo,
            role: "admin"
        },process.env.REFRESH_JWT_SECRET,
        {expiresIn: process.env.REFRESH_JWT_EXPIRY}
        )

        await AdminModel.updateOne(
            { _id: alreadyInDb._id}, 
            { $set: { refreshToken: refreshToken } }
        );

        return res.status(statuscodes.success).cookie("accessToken", accessToken, cookieOption).cookie("refreshToken", refreshToken, cookieOption).send({result: true, message: "Login Success", role: "admin"})

    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error Logging In. Please Try Again Later"})
    }
}



const getAdmin = async (req,res) => {
    try {
        let admin = req.admin

        return res.status(statuscodes.success).send({result: true, message: "Admin Data Found", admin})
    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error in Getting Admin. Please Try Again Later"})
    }
}

const addDistributor = async (req,res) => {
    try {
        let {billNo, partyName,transport, phoneNo, password } = req?.body;

        let numBillNo = Number(billNo);
        partyName = partyName ? partyName.trim() : "";
        transport = transport ? transport.trim() : "";
        password = password ? password.trim() : "";

        let checkData = distributorValidationSchema.safeParse({billNo: numBillNo, partyName, transport, phoneNo, password});

        if(!checkData.success){
            return res.status(statuscodes.badRequest).send({result: false, message: checkData.error.errors[0].message, error: checkData.error})
        }

        let alreadyInDb = await userModel.findOne({phoneNo})

        if(alreadyInDb){
            return res.status(statuscodes.badRequest).send({result: false, message: "Distributor Already Exists"})
        }

        await userModel.create({
            billNo: numBillNo,
            partyName,
            transport,
            phoneNo,
            password,
            role: "distributor"
        })

        return res.status(statuscodes.success).send({result: true, message: "Distributor Created"})

    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error in Adding Distributor. Please Try Again Later"})
    }
}

const addFestivleImage = async (req, res) => {
    try {
        let { startDate, endDate } = req.body;

        startDate = new Date(startDate);
        endDate = new Date(endDate);

        if (!req.file || !req.file.path) {
            return res.status(statuscodes.badRequest).send({ 
                result: false, message: "Please Upload an Image" 
            });
        }

        // ✅ Upload single image to Cloudinary
        let uploadResult;
        try {
            uploadResult = await uploadOnCloudinary(req.file.path);
        } catch (uploadError) {
            return res.status(statuscodes.badRequest).send({ 
                result: false, message: "Image Failed to Upload. Please Try Again Later" 
            });
        }

        await Festive.create({
            startDate,
            endDate,
            image: uploadResult.secure_url // ✅ Save Cloudinary URL in the database
        });

        return res.status(statuscodes.success).send({ 
            result: true, message: "Festival Image Uploaded Successfully",
            imageUrl: uploadResult.secure_url
        });

    } catch (error) {
        return res.status(statuscodes.serverError).send({ 
            result: false, message: "Error in Adding Festival Image. Please Try Again Later" 
        });
    }
};

const getFestivleImages = async (req, res) => {
    try {
        let festiveImages = await Festive.find({}, "image"); // ✅ Select only image field

        if (!festiveImages || festiveImages.length === 0) {
            return res.status(statuscodes.success).send({
                result: false, message: "No Festival Images Added"
            });
        }

        // ✅ Extract image URLs only
        let imageUrls = festiveImages.map((festival) => festival.image);

        return res.status(statuscodes.success).send({
            result: true, message: "Festival Images Retrieved", imageUrls
        });
    } catch (error) {
        return res.status(statuscodes.serverError).send({
            result: false, message: "Error in Getting Festival Images. Please Try Again Later"
        });
    }
};

const deleteDistributor = async (req,res) => {
    try {
        let distributorid = req?.params.id

        let distributorInTable = await userModel.findById(distributorid)

        if(!distributorInTable){
            return res.status(statuscodes.badRequest).send({result: false, message: "Distributor Not Found"})
        }

        await userModel.findByIdAndDelete(distributorid)

        return res.status(statuscodes.success).send({result: true, message: "Distributor Removed"})
    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error in Adding Distributor. Please Try Again Later"})
    }
}

const getDistributors = async (req,res) => {
    try {
        let distributors = await userModel.find({})

        if(!distributors){
            return res.status(statuscodes.noContent).send({result: false, message: "No Distributors Added"})
        }

        return res.status(statuscodes.success).send({result: true, message: "Distributors Found", data: distributors})

    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error in Getting Distributor. Please Try Again Later"})
    }
}

const updateDistributor = async (req,res) => {
    try {
        let distributorid = req?.params.id
        let newData = req?.body

        let distributorInDb = await userModel.findById(distributorid)

        if(!distributorInDb){
            return res.status(statuscodes.badRequest).send({result: false, message: "Distributor Not Found"})
        }

        let validateData = distributorValidationSchema.safeParse(newData)

        if(!validateData.success){
            return res.status(statuscodes.badRequest).send({result: false, message: validateData.error.errors[0].message, error: validateData.error})
        }

        await userModel.findByIdAndUpdate(distributorid, newData, {new: true})

        return res.status(statuscodes.success).send({result: true, message: "Distributor Updated"})
    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error in Updating Distributor. Please Try Again Later"})
    }
}

let generateOrderPerforma = async (req, res) => {
try {
    const { orderId } = req.params;
    // Find the order in the database.
    const order = await purchaseProductModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    // Generate and stream the PDF.
    finalOrderPerforma(order, res);
  } catch (error) {
    res.status(500).json({
      message: "Error generating order performa. Please try again.",
      error: error.message
    });
  }
}

const generateQRCodes = async (req, res) => {
  try {
    const { productId, articleName, segment, numberOfQRs, purpose = 'inventory' } = req.body;
    const userId = req.user?.id;

    // Validate input
    if (!productId || !articleName || !numberOfQRs) {
      return res.status(400).json({
        result: false,
        message: "Product ID, article name and number of QR codes are required"
      });
    }

    if (numberOfQRs < 1 || numberOfQRs > 1000) {
      return res.status(400).json({
        result: false,
        message: "Number of QR codes must be between 1 and 1000"
      });
    }

    // Find product by productId or by article ID within variants
    const product = await Product.findOne({
      $or: [
        { _id: productId },
        { 'variants.articles._id': productId }
      ]
    });

    if (!product) {
      return res.status(404).json({
        result: false,
        message: "Product not found"
      });
    }

    // Find the specific article within variants
    let foundArticle = null;
    let variantName = null;

    if (product.variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        const article = variant.articles.find(a => 
          a._id.toString() === productId.toString() || 
          a.name === articleName
        );
        if (article) {
          foundArticle = article;
          variantName = variant.name;
          break;
        }
      }

      // If no article found by ID, search by article name across all variants
      if (!foundArticle) {
        for (const variant of product.variants) {
          const article = variant.articles.find(a => a.name === articleName);
          if (article) {
            foundArticle = article;
            variantName = variant.name;
            break;
          }
        }
      }
    }

    if (!foundArticle) {
      return res.status(404).json({
        result: false,
        message: "Article not found in product variants"
      });
    }

    const qrCodes = [];
    const batchId = uuidv4();

    // Create temporary directory for QR code images
    const tempDir = path.join(process.cwd(), 'temp', 'qr-codes', batchId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate QR codes loop
    for (let i = 0; i < numberOfQRs; i++) {
      const uniqueId = uuidv4();

      const qrDataObj = {
        productId: product._id.toString(),
        articleId: foundArticle._id.toString(),
        productName: foundArticle.name, // Use article name, not articleName
        segment: segment || product.segment,
        variant: variantName,
        uniqueId,
        batchId,
        generatedAt: new Date().toISOString(),
        serialNumber: i + 1,
        totalCount: numberOfQRs,
        index: i + 1,
        purpose,
        lifecycle: {
          stage: 'generated',
          nextStage: 'manufacturing'
        },
        verifyUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify/${uniqueId}`,
        scanUrls: {
          manufacturing: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/scan/manufacturing/${uniqueId}`,
          warehouse: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/scan/warehouse/${uniqueId}`,
          distributor: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/scan/distributor/${uniqueId}`
        }
      };

      const qrString = JSON.stringify(qrDataObj);

      // Generate base64 QR code image
      const qrCodeDataURL = await QRCodeLib.toDataURL(qrString, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
      });

      // Save QR code image file
      const fileName = `QR_${foundArticle.name.replace(/[^a-zA-Z0-9]/g, '_')}_${String(i + 1).padStart(4, '0')}_${uniqueId.slice(0, 8)}.png`;
      const filePath = path.join(tempDir, fileName);
      const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');

      fs.writeFileSync(filePath, base64Data, 'base64');

      // Save QR code document in DB
      let qrDoc = new QRCode({
        uniqueId,
        productId: product._id,
        variantName: variantName,
        articleName: foundArticle.name, // Use article.name
        batchId,
        qrData: qrString,
        qrImagePath: filePath,
        status: 'generated',
        generatedBy: userId,
        generatedAt: new Date()
      });

      await qrDoc.save();

      qrCodes.push({
        id: `qr_${uniqueId}`,
        uniqueId,
        dataURL: qrCodeDataURL,
        qrCodeImage: qrCodeDataURL,
        fileName,
        filePath,
        qrData: qrDataObj,
        serialNumber: i + 1
      });
    }

    // Update article's QR tracking stats
    try {
      await Product.findOneAndUpdate(
        { 
          _id: product._id,
          'variants.name': variantName,
          'variants.articles._id': foundArticle._id
        },
        {
          $inc: {
            'variants.$[variant].articles.$[article].qrTracking.totalQRsGenerated': numberOfQRs,
            'variants.$[variant].articles.$[article].qrTracking.activeQRs': numberOfQRs
          },
          $set: {
            'variants.$[variant].articles.$[article].qrTracking.lastQRGenerated': new Date()
          }
        },
        {
          arrayFilters: [
            { 'variant.name': variantName },
            { 'article._id': foundArticle._id }
          ]
        }
      );
    } catch (updateError) {
      console.log('QR tracking update failed (non-critical):', updateError.message);
      // Continue execution as this is not critical
    }

    res.status(200).json({
      result: true,
      message: `Successfully generated ${numberOfQRs} QR codes`,
      qrCodes,
      batchId,
      batchDetails: {
        batchId,
        articleName: foundArticle.name,
        segment: segment || product.segment,
        variant: variantName,
        numberOfQRs,
        generatedAt: new Date(),
        lifecycle: {
          currentStage: 'generated',
          nextStage: 'manufacturing'
        }
      }
    });

  } catch (error) {
    console.error('Error generating QR codes:', error);
    res.status(500).json({
      result: false,
      message: "Failed to generate QR codes",
      error: error.message
    });
  }
};


const downloadQRCodes = async (req, res) => {
  try {
    const { qrCodes, batchId } = req.body;

    if (!qrCodes || !Array.isArray(qrCodes) || qrCodes.length === 0) {
      return res.status(400).json({
        result: false,
        message: "QR codes data is required"
      });
    }

    const tempDir = path.join(process.cwd(), 'temp', 'qr-codes');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const zipFileName = `QR_Codes_${batchId || 'Batch'}_${Date.now()}.zip`;
    const zipFilePath = path.join(tempDir, zipFileName);

    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`Archive created: ${archive.pointer()} total bytes`);

      // Send the ZIP file for download
      res.download(zipFilePath, zipFileName, (err) => {
        if (err) {
          console.error('Error sending file:', err);
          res.status(500).end();
          return;
        }
        // Cleanup after download
        setTimeout(() => {
          try {
            if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
            qrCodes.forEach(qr => {
              if (qr.filePath && fs.existsSync(qr.filePath)) {
                fs.unlinkSync(qr.filePath);
              }
              const qrDirectory = path.dirname(qr.filePath);
              if (fs.existsSync(qrDirectory)) {
                fs.rmdirSync(qrDirectory, { recursive: true });
              }
            });
          } catch (cleanupErr) {
            console.error('Cleanup error:', cleanupErr);
          }
        }, 5000);
      });
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({
        result: false,
        message: "Failed to create zip archive",
        error: err.message
      });
    });

    archive.pipe(output);

    // Add QR code images to archive
    qrCodes.forEach(qr => {
      if (qr.filePath && fs.existsSync(qr.filePath)) {
        archive.file(qr.filePath, { name: qr.fileName });
      } else if (qr.qrCodeImage) {
        const base64Data = qr.qrCodeImage.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        archive.append(buffer, { name: qr.fileName });
      }
    });

    // Enhanced informational text file with lifecycle stages
    const infoContent = `QR Code Batch Information
========================
Batch ID: ${batchId || 'N/A'}
Total QR Codes: ${qrCodes.length}
Generated On: ${new Date().toISOString()}

Lifecycle Stages:
================
1. MANUFACTURING - Scan when product is manufactured
2. WAREHOUSE - Scan when received at warehouse
3. DISTRIBUTOR - Scan when shipped to distributor

QR Code Details:
================
${qrCodes.map((qr, idx) => {
  let scanUrls = {};
  try {
    const data = JSON.parse(qr.qrData);
    scanUrls = data.scanUrls || {};
  } catch { }
  return `QR Code #${qr.serialNumber || idx + 1}:
  File: ${qr.fileName}
  Unique ID: ${qr.uniqueId || 'N/A'}
  Manufacturing URL: ${scanUrls.manufacturing || 'N/A'}
  Warehouse URL: ${scanUrls.warehouse || 'N/A'}
  Distributor URL: ${scanUrls.distributor || 'N/A'}
${'='.repeat(60)}`;
}).join('\n\n')}

Instructions:
=============
1. Manufacturing Stage: Scan QR codes when products are manufactured
2. Warehouse Stage: Scan QR codes when received at warehouse
3. Distributor Stage: Scan QR codes when shipping to distributors
4. Each scan is tracked with timestamp and location
5. Use the Unique ID for manual verification if needed

Scan URLs:
==========
Manufacturing: Use the manufacturing URL for first scan
Warehouse: Use the warehouse URL for second scan  
Distributor: Use the distributor URL for final scan
`;

    archive.append(infoContent, { name: 'QR_Batch_Information.txt' });

    // Enhanced CSV file with lifecycle URLs
    const csvLines = [
      'Serial Number,Unique ID,File Name,Product Name,Variant,Generated At,Manufacturing URL,Warehouse URL,Distributor URL',
      ...qrCodes.map(qr => {
        let data = {};
        try {
          data = JSON.parse(qr.qrData);
        } catch { }
        return [
          qr.serialNumber || '',
          qr.uniqueId || '',
          `"${qr.fileName}"`,
          `"${data.productName || ''}"`,
          `"${data.variant || ''}"`,
          `"${data.generatedAt || ''}"`,
          `"${data.scanUrls?.manufacturing || ''}"`,
          `"${data.scanUrls?.warehouse || ''}"`,
          `"${data.scanUrls?.distributor || ''}"`
        ].join(',');
      })
    ];
    archive.append(csvLines.join('\n'), { name: 'QR_Codes_Data.csv' });

    await archive.finalize();

  } catch (error) {
    console.error('Error downloading QR codes:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to download QR codes',
      error: error.message
    });
  }
};


const scanQRCode = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const {
      scannedBy,
      location,
      event,
      userAgent,
      ipAddress,
      notes,
      qualityCheck,
      distributorDetails,
      trackingNumber
    } = req.body;

    const qrCode = await QRCode.findOne({ uniqueId }).populate('productId');

    if (!qrCode) {
      return res.status(404).json({ 
        result: false, 
        message: "QR code not found or invalid QR" 
      });
    }

    const scans = qrCode.scans || [];

    // Validate scan sequence - must follow manufacturing → warehouse → distributor
    const hasManufactured = scans.some(s => s.event === 'manufactured');
    const hasReceived = scans.some(s => s.event === 'received');
    const hasShipped = scans.some(s => s.event === 'shipped');

    // Manufacturing stage validation
    if (event === 'manufactured') {
      if (hasManufactured) {
        return res.status(400).json({
          result: false,
          message: "This QR code has already been scanned for manufacturing"
        });
      }
    }

    // Warehouse receipt validation
    if (event === 'received') {
      if (!hasManufactured) {
        return res.status(400).json({
          result: false,
          message: "Cannot receive a product that hasn't been manufactured yet"
        });
      }
      if (hasReceived) {
        return res.status(400).json({
          result: false,
          message: "This QR code has already been received at warehouse"
        });
      }
    }

    // Distributor shipment validation
    if (event === 'shipped') {
      if (!hasManufactured || !hasReceived) {
        return res.status(400).json({
          result: false,
          message: "Cannot ship a product that hasn't been manufactured and received at warehouse"
        });
      }
      if (hasShipped) {
        return res.status(400).json({
          result: false,
          message: "This QR code has already been shipped to distributor"
        });
      }
    }

    const scanRecord = {
      scannedAt: new Date(),
      scannedBy: {
        userId: scannedBy?.userId || 'anonymous',
        userType: scannedBy?.userType || 'customer',
        name: scannedBy?.name
      },
      location,
      event,
      notes,
      metadata: {
        userAgent,
        ipAddress,
        qualityCheck,
        distributorDetails,
        trackingNumber
      }
    };

    qrCode.scans.push(scanRecord);
    qrCode.totalScans += 1;
    if (!qrCode.firstScannedAt) qrCode.firstScannedAt = new Date();
    qrCode.lastScannedAt = new Date();

    // Handle Manufacturing Stage
    if (event === 'manufactured') {
      qrCode.status = 'manufactured';
      qrCode.manufacturingDetails = {
        manufacturedAt: new Date(),
        manufacturedBy: {
          userId: scannedBy?.userId,
          userType: scannedBy?.userType,
          name: scannedBy?.name
        },
        manufacturingLocation: location,
        qualityCheck: qualityCheck || { passed: true, notes: '' }
      };

      // Get article details from the product
      const product = qrCode.productId;
      let articleDetails = null;
      
      for (const variant of product.variants || []) {
        const article = variant.articles?.find(art => art.name === qrCode.articleName);
        if (article) {
          articleDetails = article;
          break;
        }
      }

      if (!articleDetails) {
        return res.status(400).json({
          result: false,
          message: "Article details not found in product variants"
        });
      }

      // Add to inventory at manufactured stage
      let inventory = await Inventory.findOne({ productId: qrCode.productId });
      
      if (!inventory) {
        inventory = new Inventory({
          productId: qrCode.productId,
          items: []
        });
      }

      inventory.items.push({
        qrCodeId: qrCode._id,
        uniqueId: qrCode.uniqueId,
        articleName: qrCode.articleName,
        articleDetails: articleDetails,
        manufacturedAt: new Date(),
        manufacturedBy: {
          userId: scannedBy?.userId,
          userType: scannedBy?.userType,
          name: scannedBy?.name
        },
        manufacturingLocation: location,
        status: 'manufactured',
        lifecycle: [{
          stage: 'manufactured',
          timestamp: new Date(),
          location: location?.address,
          performedBy: scannedBy?.name,
          notes
        }],
        notes
      });

      await inventory.save();

      // Update Product tracking
      await Product.findOneAndUpdate(
        { _id: qrCode.productId, 'variants.articles.name': qrCode.articleName },
        {
          $push: {
            'variants.$[variant].articles.$[article].scannedHistory': {
              qrCodeId: qrCode._id,
              scannedAt: new Date(),
              scannedBy: scannedBy?.name,
              event,
              location: location?.address,
              notes
            }
          },
          $inc: {
            'variants.$[variant].articles.$[article].qrTracking.manufacturedQRs': 1
          }
        },
        {
          arrayFilters: [
            { 'variant.articles.name': qrCode.articleName },
            { 'article.name': qrCode.articleName }
          ]
        }
      );

      await qrCode.save();

      return res.status(200).json({
        result: true,
        message: "QR code scanned for manufacturing successfully",
        data: {
          qrCode: {
            uniqueId: qrCode.uniqueId,
            status: qrCode.status,
            totalScans: qrCode.totalScans,
            currentStage: 'manufactured',
            nextStage: 'warehouse_receipt'
          },
          inventory: {
            totalQuantity: inventory.totalQuantity,
            quantityByStage: inventory.quantityByStage
          },
          scanDetails: scanRecord
        }
      });
    }

    // Handle Warehouse Receipt Stage
    if (event === 'received') {
      qrCode.status = 'received';
      qrCode.warehouseDetails = {
        receivedAt: new Date(),
        receivedBy: {
          userId: scannedBy?.userId,
          userType: scannedBy?.userType,
          name: scannedBy?.name
        },
        warehouseLocation: location,
        conditionOnReceipt: 'good' // Could be passed in request
      };

      // Update inventory item status
      const inventory = await Inventory.findOne({ productId: qrCode.productId });
      
      if (!inventory) {
        return res.status(400).json({
          result: false,
          message: "No inventory found for this product"
        });
      }

      const itemIndex = inventory.items.findIndex(item => 
        item.qrCodeId.toString() === qrCode._id.toString()
      );

      if (itemIndex === -1) {
        return res.status(400).json({
          result: false,
          message: "Item not found in inventory"
        });
      }

      // Update inventory item
      inventory.items[itemIndex].receivedAt = new Date();
      inventory.items[itemIndex].receivedBy = {
        userId: scannedBy?.userId,
        userType: scannedBy?.userType,
        name: scannedBy?.name
      };
      inventory.items[itemIndex].receivedLocation = location;
      inventory.items[itemIndex].status = 'in_warehouse';
      inventory.items[itemIndex].lifecycle.push({
        stage: 'received_warehouse',
        timestamp: new Date(),
        location: location?.address,
        performedBy: scannedBy?.name,
        notes
      });

      await inventory.save();

      // Update Product tracking
      await Product.findOneAndUpdate(
        { _id: qrCode.productId, 'variants.articles.name': qrCode.articleName },
        {
          $inc: {
            'variants.$[variant].articles.$[article].qrTracking.receivedQRs': 1
          }
        },
        {
          arrayFilters: [
            { 'variant.articles.name': qrCode.articleName },
            { 'article.name': qrCode.articleName }
          ]
        }
      );

      await qrCode.save();

      return res.status(200).json({
        result: true,
        message: "QR code scanned for warehouse receipt successfully",
        data: {
          qrCode: {
            uniqueId: qrCode.uniqueId,
            status: qrCode.status,
            totalScans: qrCode.totalScans,
            currentStage: 'in_warehouse',
            nextStage: 'distributor_shipment'
          },
          inventory: {
            totalQuantity: inventory.totalQuantity,
            quantityByStage: inventory.quantityByStage,
            availableQuantity: inventory.availableQuantity
          },
          scanDetails: scanRecord
        }
      });
    }

    // Handle Distributor Shipment Stage
    if (event === 'shipped') {
      qrCode.status = 'shipped';
      qrCode.distributorDetails = {
        shippedAt: new Date(),
        shippedBy: {
          userId: scannedBy?.userId,
          userType: scannedBy?.userType,
          name: scannedBy?.name
        },
        distributorId: distributorDetails?.distributorId,
        distributorName: distributorDetails?.distributorName,
        trackingNumber: trackingNumber
      };

      // Update inventory item
      const inventory = await Inventory.findOne({ productId: qrCode.productId });
      
      if (!inventory) {
        return res.status(400).json({
          result: false,
          message: "No inventory found for this product"
        });
      }

      const itemIndex = inventory.items.findIndex(item => 
        item.qrCodeId.toString() === qrCode._id.toString()
      );

      if (itemIndex === -1) {
        return res.status(400).json({
          result: false,
          message: "Item not found in inventory"
        });
      }

      // Update inventory item
      inventory.items[itemIndex].shippedAt = new Date();
      inventory.items[itemIndex].shippedBy = {
        userId: scannedBy?.userId,
        userType: scannedBy?.userType,
        name: scannedBy?.name
      };
      inventory.items[itemIndex].distributorDetails = {
        distributorId: distributorDetails?.distributorId,
        distributorName: distributorDetails?.distributorName,
        trackingNumber: trackingNumber
      };
      inventory.items[itemIndex].status = 'shipped_to_distributor';
      inventory.items[itemIndex].lifecycle.push({
        stage: 'shipped_distributor',
        timestamp: new Date(),
        location: distributorDetails?.distributorName,
        performedBy: scannedBy?.name,
        notes
      });

      await inventory.save();

      // Update Product tracking
      await Product.findOneAndUpdate(
        { _id: qrCode.productId, 'variants.articles.name': qrCode.articleName },
        {
          $inc: {
            'variants.$[variant].articles.$[article].qrTracking.shippedQRs': 1,
            'variants.$[variant].articles.$[article].qrTracking.activeQRs': -1
          }
        },
        {
          arrayFilters: [
            { 'variant.articles.name': qrCode.articleName },
            { 'article.name': qrCode.articleName }
          ]
        }
      );

      await qrCode.save();

      return res.status(200).json({
        result: true,
        message: "QR code scanned for distributor shipment successfully",
        data: {
          qrCode: {
            uniqueId: qrCode.uniqueId,
            status: qrCode.status,
            totalScans: qrCode.totalScans,
            currentStage: 'shipped_to_distributor',
            nextStage: 'completed'
          },
          inventory: {
            totalQuantity: inventory.totalQuantity,
            quantityByStage: inventory.quantityByStage,
            availableQuantity: inventory.availableQuantity
          },
          distributorDetails: qrCode.distributorDetails,
          scanDetails: scanRecord
        }
      });
    }

    // For other events, just save the qrCode
    await qrCode.save();

    return res.status(200).json({
      result: true,
      message: "QR code scanned successfully",
      data: {
        qrCode: {
          uniqueId: qrCode.uniqueId,
          status: qrCode.status,
          totalScans: qrCode.totalScans,
          firstScannedAt: qrCode.firstScannedAt,
          lastScannedAt: qrCode.lastScannedAt
        },
        scanDetails: scanRecord
      }
    });

  } catch (error) {
    console.error('Error scanning QR code:', error);
    res.status(500).json({
      result: false,
      message: "Failed to process QR code scan",
      error: error.message
    });
  }
};

const getInventoryData = async (req, res) => {
  try {
    const productId = req.params.productId || req.query.productId;
    if (!productId) {
      return res.status(400).json({
        result: false,
        message: 'Product ID is required'
      });
    }

    // Get inventory for product with populated QR codes
    const inventory = await Inventory.findOne({ productId })
      .populate({
        path: 'items.qrCodeId',
        select: 'uniqueId status totalScans scans createdAt batchId',
        populate: {
          path: 'batchId',
          select: 'batchId articleName'
        }
      })
      .lean();

    // Get full product data
    const product = await Product.findById(productId).lean();
    
    if (!product) {
      return res.status(404).json({
        result: false,
        message: 'Product not found'
      });
    }

    // Calculate additional metrics
    const itemsWithQRDetails = inventory?.items?.map(item => ({
      ...item,
      qrCodeDetails: item.qrCodeId ? {
        uniqueId: item.qrCodeId.uniqueId,
        status: item.qrCodeId.status,
        totalScans: item.qrCodeId.totalScans,
        lastScannedAt: item.qrCodeId.scans?.length > 0 
          ? item.qrCodeId.scans[item.qrCodeId.scans.length - 1].scannedAt 
          : null,
        batchInfo: item.qrCodeId.batchId
      } : null
    })) || [];

    return res.status(200).json({
      result: true,
      message: 'Inventory and product data retrieved',
      data: {
        inventoryCount: inventory ? inventory.totalQuantity : 0,
        availableQuantity: inventory ? inventory.availableQuantity : 0,
        reservedQuantity: inventory ? inventory.reservedQuantity || 0 : 0,
        inventoryItems: itemsWithQRDetails,
        product,
        lastUpdated: inventory ? inventory.lastUpdated : null
      }
    });
  } catch (error) {
    console.error('Error fetching inventory data:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to get inventory data',
      error: error.message
    });
  }
};

const getSingleProductInventory = async (req, res) => {
  try {
    const { productId } = req.params;
    
    if (!productId) {
      return res.status(400).json({
        result: false,
        message: 'Product ID is required'
      });
    }

    // Get inventory with detailed QR code information
    const inventory = await Inventory.findOne({ productId })
      .populate({
        path: 'items.qrCodeId',
        select: 'uniqueId status totalScans scans createdAt batchId',
        populate: {
          path: 'batchId',
          select: 'batchId articleName generatedBy createdAt'
        }
      })
      .lean();

    // Get full product data
    const product = await Product.findById(productId).lean();
    
    if (!product) {
      return res.status(404).json({
        result: false,
        message: 'Product not found'
      });
    }

    // Enhanced items processing with QR details
    const itemsByArticle = {};
    const qrStatsByArticle = {};
    
    if (inventory && inventory.items) {
      inventory.items.forEach(item => {
        const articleName = item.articleName;
        
        // Group items by article
        if (!itemsByArticle[articleName]) {
          itemsByArticle[articleName] = [];
          qrStatsByArticle[articleName] = {
            totalQRs: 0,
            scannedQRs: 0,
            totalScans: 0,
            lastScanned: null
          };
        }
        
        // Enhanced item data with QR details
        const itemWithQRDetails = {
          ...item,
          qrCodeDetails: item.qrCodeId ? {
            uniqueId: item.qrCodeId.uniqueId,
            status: item.qrCodeId.status,
            totalScans: item.qrCodeId.totalScans,
            createdAt: item.qrCodeId.createdAt,
            lastScannedAt: item.qrCodeId.scans?.length > 0 
              ? item.qrCodeId.scans[item.qrCodeId.scans.length - 1].scannedAt 
              : null,
            batchInfo: item.qrCodeId.batchId,
            scanHistory: item.qrCodeId.scans || []
          } : null
        };
        
        itemsByArticle[articleName].push(itemWithQRDetails);
        
        // Update QR statistics for this article
        if (item.qrCodeId) {
          qrStatsByArticle[articleName].totalQRs++;
          qrStatsByArticle[articleName].totalScans += item.qrCodeId.totalScans || 0;
          
          if (item.qrCodeId.totalScans > 0) {
            qrStatsByArticle[articleName].scannedQRs++;
          }
          
          // Track last scanned date
          const lastScanned = itemWithQRDetails.qrCodeDetails.lastScannedAt;
          if (lastScanned && (!qrStatsByArticle[articleName].lastScanned || 
              new Date(lastScanned) > new Date(qrStatsByArticle[articleName].lastScanned))) {
            qrStatsByArticle[articleName].lastScanned = lastScanned;
          }
        }
      });
    }

    return res.status(200).json({
      result: true,
      message: 'Product inventory data retrieved successfully',
      data: {
        inventoryCount: inventory ? inventory.totalQuantity : 0,
        availableQuantity: inventory ? inventory.availableQuantity : 0,
        reservedQuantity: inventory ? inventory.reservedQuantity || 0 : 0,
        inventoryItems: inventory ? inventory.items : [],
        itemsByArticle,
        qrStatsByArticle,
        product: product,
        lastUpdated: inventory ? inventory.lastUpdated : null
      }
    });
  } catch (error) {
    console.error('Error fetching single product inventory:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to get product inventory data',
      error: error.message
    });
  }
};

const getAllInventory = async (req, res) => {
  try {
    // Get all inventory records with populated product and QR data
    const inventories = await Inventory.find({})
      .populate('productId', 'segment title category brand')
      .populate({
        path: 'items.qrCodeId',
        select: 'status totalScans batchId',
        populate: {
          path: 'batchId',
          select: 'articleName'
        }
      })
      .lean();

    const inventoryData = inventories.map(inventory => {
      // Calculate QR statistics
      const qrStats = inventory.items.reduce((acc, item) => {
        if (item.qrCodeId) {
          acc.totalQRs++;
          acc.totalScans += item.qrCodeId.totalScans || 0;
          if (item.qrCodeId.totalScans > 0) {
            acc.scannedQRs++;
          }
        }
        return acc;
      }, { totalQRs: 0, totalScans: 0, scannedQRs: 0 });

      return {
        productId: inventory.productId._id,
        product: inventory.productId,
        inventoryCount: inventory.totalQuantity,
        availableQuantity: inventory.availableQuantity,
        reservedQuantity: inventory.reservedQuantity || 0,
        totalItems: inventory.items.length,
        lastUpdated: inventory.lastUpdated,
        
        // Enhanced QR statistics
        qrCodeStats: qrStats,
        
        // Status breakdown
        statusBreakdown: inventory.items.reduce((acc, item) => {
          acc[item.status] = (acc[item.status] || 0) + 1;
          return acc;
        }, {}),
        
        // Article breakdown with QR info
        articleBreakdown: inventory.items.reduce((acc, item) => {
          const key = item.articleName;
          if (!acc[key]) {
            acc[key] = { count: 0, qrsGenerated: 0, qrsScanned: 0 };
          }
          acc[key].count++;
          if (item.qrCodeId) {
            acc[key].qrsGenerated++;
            if (item.qrCodeId.totalScans > 0) {
              acc[key].qrsScanned++;
            }
          }
          return acc;
        }, {})
      };
    });

    return res.status(200).json({
      result: true,
      message: 'All inventory data retrieved successfully',
      data: inventoryData
    });
  } catch (error) {
    console.error('Error fetching all inventory data:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to get all inventory data',
      error: error.message
    });
  }
};

const getQRStatistics = async (req, res) => {
  try {
    const { productId, articleName, dateFrom, dateTo } = req.query;
    
    // Build match filter
    let matchFilter = {};
    if (productId) matchFilter.productId = mongoose.Types.ObjectId(productId);
    if (articleName) matchFilter.articleName = articleName;
    
    // Date range filter
    let dateFilter = {};
    if (dateFrom || dateTo) {
      dateFilter.createdAt = {};
      if (dateFrom) dateFilter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) dateFilter.createdAt.$lte = new Date(dateTo);
    }

    // Get QR code statistics by article
    const qrStatsByArticle = await QRCodeModel.aggregate([
      { $match: { ...matchFilter, ...dateFilter } },
      {
        $lookup: {
          from: 'qrbatches',
          localField: 'batchId',
          foreignField: '_id',
          as: 'batch'
        }
      },
      { $unwind: '$batch' },
      {
        $group: {
          _id: {
            articleName: '$batch.articleName',
            productId: '$productId'
          },
          totalQRsGenerated: { $sum: 1 },
          totalScans: { $sum: '$totalScans' },
          scannedQRs: {
            $sum: { $cond: [{ $gt: ['$totalScans', 0] }, 1, 0] }
          },
          activeQRs: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          firstGenerated: { $min: '$createdAt' },
          lastGenerated: { $max: '$createdAt' },
          avgScansPerQR: { $avg: '$totalScans' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id.productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          articleName: '$_id.articleName',
          productId: '$_id.productId',
          productTitle: '$product.title',
          totalQRsGenerated: 1,
          totalScans: 1,
          scannedQRs: 1,
          activeQRs: 1,
          unusedQRs: { $subtract: ['$totalQRsGenerated', '$scannedQRs'] },
          scanRate: {
            $cond: [
              { $gt: ['$totalQRsGenerated', 0] },
              { $multiply: [{ $divide: ['$scannedQRs', '$totalQRsGenerated'] }, 100] },
              0
            ]
          },
          firstGenerated: 1,
          lastGenerated: 1,
          avgScansPerQR: { $round: ['$avgScansPerQR', 2] }
        }
      },
      { $sort: { totalScans: -1 } }
    ]);

    // Get scan trends over time (last 30 days or custom range)
    const thirtyDaysAgo = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = dateTo ? new Date(dateTo) : new Date();
    
    const scanTrends = await QRCodeModel.aggregate([
      { $match: matchFilter },
      { $unwind: '$scans' },
      {
        $match: {
          'scans.scannedAt': { 
            $gte: thirtyDaysAgo,
            $lte: endDate
          }
        }
      },
      {
        $lookup: {
          from: 'qrbatches',
          localField: 'batchId',
          foreignField: '_id',
          as: 'batch'
        }
      },
      { $unwind: '$batch' },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$scans.scannedAt'
              }
            },
            articleName: '$batch.articleName'
          },
          scans: { $sum: 1 },
          uniqueQRs: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          date: '$_id.date',
          articleName: '$_id.articleName',
          scans: 1,
          uniqueQRsScanned: { $size: '$uniqueQRs' }
        }
      },
      { $sort: { date: 1, articleName: 1 } }
    ]);

    // Get recent QR batch activity
    const recentBatches = await QRBatch.find(matchFilter)
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('productId', 'segment title')
      .populate('generatedBy', 'name email')
      .lean();

    // Calculate overall statistics
    const overallStats = qrStatsByArticle.reduce((acc, stat) => ({
      totalArticles: acc.totalArticles + 1,
      totalQRsGenerated: acc.totalQRsGenerated + stat.totalQRsGenerated,
      totalScans: acc.totalScans + stat.totalScans,
      totalScannedQRs: acc.totalScannedQRs + stat.scannedQRs,
      totalActiveQRs: acc.totalActiveQRs + stat.activeQRs
    }), {
      totalArticles: 0,
      totalQRsGenerated: 0,
      totalScans: 0,
      totalScannedQRs: 0,
      totalActiveQRs: 0
    });

    // Add calculated fields to overall stats
    overallStats.avgScansPerQR = overallStats.totalQRsGenerated > 0 
      ? Math.round((overallStats.totalScans / overallStats.totalQRsGenerated) * 100) / 100 
      : 0;
    overallStats.overallScanRate = overallStats.totalQRsGenerated > 0 
      ? Math.round((overallStats.totalScannedQRs / overallStats.totalQRsGenerated) * 100 * 100) / 100 
      : 0;

    res.status(200).json({
      result: true,
      message: 'QR statistics retrieved successfully',
      data: {
        overview: overallStats,
        statsByArticle: qrStatsByArticle,
        scanTrends,
        recentBatches,
        filters: {
          productId,
          articleName,
          dateRange: { from: thirtyDaysAgo, to: endDate }
        }
      }
    });
  } catch (error) {
    console.error('Error getting QR statistics:', error);
    res.status(500).json({
      result: false,
      message: "Failed to retrieve QR statistics",
      error: error.message
    });
  }
};



export {register, login, getAdmin, addDistributor, deleteDistributor, getDistributors, updateDistributor, generateOrderPerforma, addFestivleImage, getFestivleImages, generateQRCodes, downloadQRCodes, scanQRCode, getQRStatistics, getInventoryData, getSingleProductInventory, getAllInventory}