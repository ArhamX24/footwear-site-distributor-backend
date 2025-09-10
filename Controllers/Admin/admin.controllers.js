import AdminModel from "../../Models/Admin.model.js";
import zod from "zod"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import userModel from "../../Models/user.model.js";
import purchaseProductModel from "../../Models/Purchasedproduct.model.js";
import finalOrderPerforma from "../../Utils/finalOrderPerforma.js";
import Festive from "../../Models/Festivle.model.js";
import { uploadOnCloudinary } from "../../Utils/cloudinary.js";
import QrCode from 'qrcode'
import Inventory from "../../Models/Inventory.model.js";
import QRCodeLib from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import Product from '../../Models/Product.model.js';
import QRCode from "../../Models/QrCode.model.js";
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import {ArticleMatcher, createNewArticle, updateArticleStats} from "../../Utils/articleHelper.js";
import Shipment from "../../Models/shipment.model.js";
import { addToInventory, removeFromInventoryAndCreateShipment } from "../../Utils/inventoryHelpers.js";
import { createCanvas, loadImage } from 'canvas';
import PDFDocument from 'pdfkit';
import mongoose from "mongoose";

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

let statusCodes = {
    success: 200,
    noContent:204,
    badRequest: 400,
    unauthorized: 403,
    notFound: 404,
    conflict: 409,
    serverError: 500,
}


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
    sameSite: 'Lax'
    // sameSite: 'none'
}

const register = async (req,res) => {
    try {
    const { fullName, phoneNo, password, permissions } = req.body;

    // Validation
    if (!fullName || !phoneNo || !password) {
      return res.status(statusCodes.badRequest).json({
        result: false,
        message: "Full name, phone number, and password are required"
      });
    }

    // Password strength validation
    if (password.length < 6) {
      return res.status(statusCodes.badRequest).json({
        result: false,
        message: "Password must be at least 6 characters long"
      });
    }

    // Check if phone number already exists
    const existingUser = await userModel.findOne({ phoneNo });
    if (existingUser) {
      return res.status(statusCodes.badRequest).json({
        result: false,
        message: "Phone number already registered"
      });
    }


    // Create new admin
    const newAdmin = new userModel({
      name: fullName,
      phoneNo,
      password,
      role: 'admin',
      isActive: true,
      adminDetails: {
        fullName,
        phoneNo: Number(phoneNo),
        password,
        permissions: permissions || ['all'],
        lastAdminAction: new Date()
      },
      createdBy: req.user?._id || null, // null for first admin
      lastLogin: null
    });

    await newAdmin.save();

    // Generate JWT tokens for immediate login
    const accessToken = jwt.sign(
      { 
        _id: newAdmin._id, 
        phoneNo: newAdmin.phoneNo, 
        role: newAdmin.role,
        name: newAdmin.name 
      },
      process.env.ACCESS_JWT_SECRET,
      { expiresIn: process.env.ACCESS_JWT_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { 
        _id: newAdmin._id, 
        role: newAdmin.role 
      },
      process.env.REFRESH_JWT_SECRET,
      { expiresIn: process.env.REFRESH_JWT_EXPIRY }
    );

    // Update admin with refresh token
    await userModel.updateOne(
      { _id: newAdmin._id },
      { $set: { refreshToken } }
    );

    // Return response without sensitive data
    const adminResponse = {
      _id: newAdmin._id,
      name: newAdmin.name,
      phoneNo: newAdmin.phoneNo,
      role: newAdmin.role,
      fullName: newAdmin.adminDetails.fullName,
      permissions: newAdmin.adminDetails.permissions,
      isActive: newAdmin.isActive,
      createdAt: newAdmin.createdAt
    };

    // Set cookies
    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    };

    res.cookie("accessToken", accessToken, cookieOptions);
    res.cookie("refreshToken", refreshToken, cookieOptions);

    res.status(statusCodes.success).json({
      result: true,
      message: "Admin registered and logged in successfully",
      data: {
        admin: adminResponse,
        redirectTo: '/admin/dashboard'
      }
    });

  } catch (error) {
    console.error('Error registering admin:', error);
    res.status(statusCodes.serverError).json({
      result: false,
      message: "Failed to register admin",
      error: error.message
    });
  }
}

const login = async (req,res) => {
    try {
        let userdata = req?.body

        let checkData = loginValidationSchema.safeParse({phoneNo: userdata.phoneNo, password: userdata.password});

        if(!checkData.success){
            return res.status(statusCodes.badRequest).send({result: false, message: checkData.error.errors[0].message})
        }

        let alreadyInDb = await AdminModel.findOne({phoneNo: userdata.phoneNo}).select("-refreshToken")

        if(!alreadyInDb){
            return res.status(statusCodes.notFound).send({result: false, message: "Account Not Found"})
        }

        let comparePassword = await bcrypt.compare(userdata.password, alreadyInDb.password)

        if(!comparePassword){
            return res.status(statusCodes.unauthorized).send({result:false, message: "Incorrect Password"})
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

        return res.status(statusCodes.success).cookie("accessToken", accessToken, cookieOption).cookie("refreshToken", refreshToken, cookieOption).send({result: true, message: "Login Success", role: "admin"})

    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: "Error Logging In. Please Try Again Later"})
    }
}



const getAdmin = async (req,res) => {
    try {
        let admin = req.admin

        return res.status(statusCodes.success).send({result: true, message: "Admin Data Found", admin})
    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: "Error in Getting Admin. Please Try Again Later"})
    }
}

const addFestivleImage = async (req, res) => {
    try {
        let { startDate, endDate } = req.body;

        startDate = new Date(startDate);
        endDate = new Date(endDate);

        if (!req.file || !req.file.path) {
            return res.status(statusCodes.badRequest).send({ 
                result: false, message: "Please Upload an Image" 
            });
        }

        // ✅ Upload single image to Cloudinary
        let uploadResult;
        try {
            uploadResult = await uploadOnCloudinary(req.file.path);
        } catch (uploadError) {
            return res.status(statusCodes.badRequest).send({ 
                result: false, message: "Image Failed to Upload. Please Try Again Later" 
            });
        }

        await Festive.create({
            startDate,
            endDate,
            image: uploadResult.secure_url // ✅ Save Cloudinary URL in the database
        });

        return res.status(statusCodes.success).send({ 
            result: true, message: "Festival Image Uploaded Successfully",
            imageUrl: uploadResult.secure_url
        });

    } catch (error) {
        return res.status(statusCodes.serverError).send({ 
            result: false, message: "Error in Adding Festival Image. Please Try Again Later" 
        });
    }
};

const getFestivleImages = async (req, res) => {
    try {
        let festiveImages = await Festive.find({}, "image"); // ✅ Select only image field

        if (!festiveImages || festiveImages.length === 0) {
            return res.status(statusCodes.success).send({
                result: false, message: "No Festival Images Added"
            });
        }

        // ✅ Extract image URLs only
        let imageUrls = festiveImages.map((festival) => festival.image);

        return res.status(statusCodes.success).send({
            result: true, message: "Festival Images Retrieved", imageUrls
        });
    } catch (error) {
        return res.status(statusCodes.serverError).send({
            result: false, message: "Error in Getting Festival Images. Please Try Again Later"
        });
    }
};

const deleteDistributor = async (req,res) => {
    try {
        let distributorid = req?.params.id

        let distributorInTable = await userModel.findById(distributorid)

        if(!distributorInTable){
            return res.status(statusCodes.badRequest).send({result: false, message: "Distributor Not Found"})
        }

        await userModel.findByIdAndDelete(distributorid)

        return res.status(statusCodes.success).send({result: true, message: "Distributor Removed"})
    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: "Error in Adding Distributor. Please Try Again Later"})
    }
}

const getDistributors = async (req, res) => {
    try {
        const distributors = await userModel.find({ 
            role: 'distributor',
            isActive: true 
        }).select('-password -refreshToken').sort({ createdAt: -1 });

        const formattedDistributors = distributors.map(distributor => ({
            _id: distributor._id,
            name: distributor.name,
            phoneNo: distributor.phoneNo,
            role: distributor.role,
            billNo: distributor.distributorDetails?.billNo,
            partyName: distributor.distributorDetails?.partyName,
            transport: distributor.distributorDetails?.transport,
            address: distributor.distributorDetails?.address,
            totalPurchases: distributor.distributorDetails?.purchases?.length || 0,
            totalShipments: distributor.distributorDetails?.receivedShipments?.length || 0,
            isActive: distributor.isActive,
            createdAt: distributor.createdAt,
            lastLogin: distributor.lastLogin
        }));

        res.status(statusCodes.success).json({
            result: true,
            message: "Distributors retrieved successfully",
            data: formattedDistributors
        });

    } catch (error) {
        res.status(statusCodes.serverError).json({
            result: false,
            message: "Failed to retrieve distributors"
        });
    }
};

const updateDistributor = async (req,res) => {
    try {
        let distributorid = req?.params.id
        let newData = req?.body

        let distributorInDb = await userModel.findById(distributorid)

        if(!distributorInDb){
            return res.status(statusCodes.badRequest).send({result: false, message: "Distributor Not Found"})
        }

        let validateData = distributorValidationSchema.safeParse(newData)

        if(!validateData.success){
            return res.status(statusCodes.badRequest).send({result: false, message: validateData.error.errors[0].message, error: validateData.error})
        }

        await userModel.findByIdAndUpdate(distributorid, newData, {new: true})

        return res.status(statusCodes.success).send({result: true, message: "Distributor Updated"})
    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: "Error in Updating Distributor. Please Try Again Later"})
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
    const { articleId, articleName, colors, sizes, numberOfQRs } = req.body;
    const userId = req.user?._id;

    // Validate inputs
    if (!articleId || !articleName || !colors || !sizes || !numberOfQRs) {
      return res.status(400).json({
        result: false,
        message: 'All fields are required: articleId, articleName, colors, sizes, numberOfQRs'
      });
    }

    if (numberOfQRs < 1 || numberOfQRs > 1000) {
      return res.status(400).json({
        result: false,
        message: 'Number of QR codes must be between 1 and 1000'
      });
    }

    // ✅ FIX: Use 'new' keyword with mongoose.Types.ObjectId
    const objectId = new mongoose.Types.ObjectId(articleId);

    // ✅ Fetch article details from Product using articleId
    const articleData = await Product.aggregate([
      { $unwind: "$variants" },
      { $unwind: "$variants.articles" },
      { $match: { "variants.articles._id": objectId } }, // ✅ Use the created objectId
      {
        $project: {
          articleId: "$variants.articles._id",
          articleName: "$variants.articles.name",
          articleColors: "$variants.articles.colors",
          articleSizes: "$variants.articles.sizes",
          variantId: "$variants._id",
          variantName: "$variants.name",
          productId: "$_id",
          segment: "$segment"
        }
      },
      { $limit: 1 }
    ]);

    if (!articleData || articleData.length === 0) {
      return res.status(404).json({
        result: false,
        message: 'Article not found'
      });
    }

    const article = articleData[0];
    
    // Convert arrays if strings
    const colorsArray = Array.isArray(colors) ? colors : [colors];
    const sizesArray = Array.isArray(sizes) ? sizes : [sizes];
    const sizesDisplay = sizesArray.join('X');

    // Generate batch ID
    const batchId = `BATCH_${Date.now()}_${userId}`;
    const qrCodes = [];

    // Generate individual QR codes for each carton
    for (let i = 1; i <= numberOfQRs; i++) {
      const uniqueId = uuidv4();

      // ✅ Enhanced QR payload with article context
      const qrPayload = {
        uniqueId,
        
        // ✅ Add article reference with IDs
        productReference: {
          productId: article.productId.toString(),
          variantId: article.variantId.toString(),
          articleId: article.articleId.toString(),
          variantName: article.variantName,
          articleName: article.articleName,
          segment: article.segment
        },
        
        articleName: article.articleName,
        
        contractorInput: {
          articleName,
          articleId: article.articleId.toString(), // ✅ Include in contractor input
          colors: colorsArray,
          sizes: sizesArray,
          cartonNumber: i,
          totalCartons: numberOfQRs
        },
        
        batchId,
        generatedAt: new Date().toISOString(),
        status: 'generated',
        
        // Enhanced label data for display
        labelData: {
          articleName,
          colors: colorsArray.join(', '),
          sizes: sizesDisplay,
          cartonNo: i
        }
      };

      const qrString = JSON.stringify(qrPayload);

      // Generate QR code with label information
      const qrCodeDataURL = await generateQRWithLabel(qrString, {
        articleName,
        colors: colorsArray.join(', '),
        sizes: sizesDisplay,
        cartonNo: i
      });

      // ✅ Save to database with article context
      const qrDoc = new QRCode({
        uniqueId,
        articleName: article.articleName,
        qrData: qrString,
        qrImagePath: qrCodeDataURL,
        status: 'generated',

        productReference: {
          productId: article.productId,
          variantId: article.variantId,
          articleId: article.articleId, // ✅ Store article ID
          variantName: article.variantName,
          articleName: article.articleName,
          isMatched: true,
          matchedBy: req.user?._id,
          matchedAt: new Date()
        },

        batchInfo: {
          contractorId: userId,
          batchId
        },

        contractorInput: {
          articleName,
          articleId: article.articleId, // ✅ Store article ID here too
          color: colorsArray.join(', '),
          size: sizesDisplay,
          cartonNumber: i,
          totalCartons: numberOfQRs
        },

        manufacturingDetails: {
          manufacturedAt: new Date(),
          manufacturedBy: { userId, userType: 'contractor', name: req.user.name }
        }
      });

      await qrDoc.save();

      qrCodes.push({
        uniqueId,
        qrCodeImage: qrCodeDataURL,
        cartonNumber: i,
        batchId,
        labelData: qrPayload.labelData
      });
    }

    res.status(200).json({
      result: true,
      message: `Successfully generated ${numberOfQRs} QR code labels for ${article.articleName}`,
      data: {
        batchId,
        qrCodes,
        articleInfo: {
          articleId: article.articleId,
          articleName: article.articleName,
          productId: article.productId,
          variantId: article.variantId,
          variantName: article.variantName,
          segment: article.segment,
          colors: colorsArray,
          sizes: sizesArray,
          sizesDisplay: sizesDisplay,
          numberOfQRs
        }
      }
    });

  } catch (error) {
    console.error('Error generating QR codes:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to generate QR codes',
      error: error.message
    });
  }
};

const downloadQRCodes = async (req, res) => {
  try {
    const { qrCodes, batchId, articleInfo } = req.body;

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
          } catch (cleanupErr) {
            console.error('Cleanup error:', cleanupErr);
          }
        }, 5000);
      });
    });

    archive.on('error', (err) => {
      res.status(500).json({
        result: false,
        message: "Failed to create zip archive",
        error: err.message
      });
    });

    archive.pipe(output);

    // Add QR code images to archive
    qrCodes.forEach((qr, idx) => {
      if (qr.qrCodeImage) {
        // QR code image stored as base64 data URL
        const base64Data = qr.qrCodeImage.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Generate filename based on carton number and uniqueId
        const fileName = `QR_${articleInfo?.savedAsArticleName || 'Article'}_Carton_${String(qr.cartonNumber).padStart(3, '0')}_${qr.uniqueId.slice(0, 8)}.png`;
        archive.append(buffer, { name: fileName });
      }
    });

    // Enhanced informational text file
    const infoContent = `QR Code Batch Information
========================
Batch ID: ${batchId || 'N/A'}
Article Name: ${articleInfo?.savedAsArticleName || 'N/A'}
Contractor Input: ${articleInfo?.contractorInput || 'N/A'}
Match Type: ${articleInfo?.matchType || 'N/A'}
Match Confidence: ${articleInfo?.confidence || 'N/A'}%
Is New Article: ${articleInfo?.isNewArticle ? 'Yes' : 'No'}
Total Cartons: ${qrCodes.length}
Generated On: ${new Date().toISOString()}
${articleInfo?.needsAdminValidation ? 'REQUIRES ADMIN VALIDATION' : 'VALIDATED'}

Product Details:
===============
Product ID: ${articleInfo?.productId || 'N/A'}
Variant: ${articleInfo?.variantName || 'N/A'}
Segment: ${articleInfo?.segment || 'N/A'}
Colors: ${Array.isArray(articleInfo?.colors) ? articleInfo.colors.join(', ') : 'N/A'}
Sizes: ${Array.isArray(articleInfo?.sizes) ? articleInfo.sizes.join(', ') : 'N/A'}

Lifecycle Stages:
================
1. GENERATED - QR codes created by contractor ✅
2. MANUFACTURED - Scan when product manufacturing is complete
3. RECEIVED - Scan when received at warehouse
4. SHIPPED - Scan when shipped to distributor

QR Code Details:
================
${qrCodes.map((qr, idx) => {
      let qrData = {};
      try {
        qrData = JSON.parse(qr.qrData);
      } catch (e) { 
        console.log('Error parsing QR data:', e);
      }
      
      return `Carton #${qr.cartonNumber || idx + 1}:
  Unique ID: ${qr.uniqueId}
  Carton: ${qr.cartonNumber} of ${qrData.contractorInput?.totalCartons || qrCodes.length}
  Status: ${qrData.status || 'generated'}
  Generated At: ${qrData.generatedAt || 'N/A'}
  Scan URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/scan/${qr.uniqueId}
${'='.repeat(60)}`;
    }).join('\n\n')}

Scanning Instructions:
=====================
1. Use QR scanner app or camera to scan codes
2. Each scan updates the carton status in real-time
3. Track cartons through: Generated → Manufactured → Received → Shipped
4. Use Unique ID for manual lookup if needed

Quality Control:
===============
- Each carton has individual tracking
- Batch grouping for easy management
- Real-time status updates
- Full audit trail maintained

Support Information:
===================
For technical support, contact system administrator.
Batch ID: ${batchId}
Generated: ${new Date().toLocaleString()}
`;

    archive.append(infoContent, { name: 'QR_Batch_Information.txt' });

    // Add a PDF receipt-style summary
    const receiptContent = `
===============================================
        QR CODE BATCH RECEIPT
===============================================

Batch ID: ${batchId}
Date: ${new Date().toLocaleString()}

Article: ${articleInfo?.savedAsArticleName || 'N/A'}
Input: ${articleInfo?.contractorInput || 'N/A'}
${articleInfo?.matchType === 'fuzzy' ? `(Auto-corrected from "${articleInfo.contractorInput}")` : ''}
${articleInfo?.isNewArticle ? '⚠️  NEW ARTICLE CREATED' : ''}

Cartons Generated: ${qrCodes.length}
Colors: ${Array.isArray(articleInfo?.colors) ? articleInfo.colors.join(', ') : 'N/A'}
Sizes: ${Array.isArray(articleInfo?.sizes) ? articleInfo.sizes.join(', ') : 'N/A'}

Status: ${articleInfo?.needsAdminValidation ? '⏳ PENDING VALIDATION' : '✅ VALIDATED'}

Next Steps:
- Print and attach QR codes to cartons
- Scan during manufacturing process
- Track through warehouse and shipment

===============================================
    For support: Contact System Administrator
===============================================
`;

    archive.append(receiptContent, { name: 'Batch_Receipt.txt' });

    await archive.finalize();

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to download QR codes',
      error: error.message
    });
  }
};

// Unified scan controller: uses only 'manufactured' | 'received' | 'shipped'
const scanQRCode = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const {
      scannedBy,
      location,
      event,
      notes,
      qualityCheck,
      distributorDetails, // { distributorId, distributorName }
      trackingNumber
    } = req.body;

    const qrCode = await QRCode.findOne({ uniqueId });

    if (!qrCode) {
      return res.status(404).json({
        result: false,
        message: "QR code not found or invalid QR"
      });
    }

    // Ensure articleName is set
    if (!qrCode.articleName && qrCode.contractorInput?.articleName) {
      qrCode.articleName = qrCode.contractorInput.articleName;
    }

    // ✅ ONLY accept 'received' and 'shipped' events
    const allowedEvents = new Set(['received', 'shipped']);
    if (!allowedEvents.has(event)) {
      return res.status(400).json({
        result: false,
        message: "Invalid event. Only 'received' and 'shipped' are allowed"
      });
    }

    const scans = qrCode.scans || [];
    const hasReceived = scans.some(s => s.event === 'received') || qrCode.status === 'received';
    const hasShipped = scans.some(s => s.event === 'shipped') || qrCode.status === 'shipped';

    // Validation logic
    if (event === 'received' && hasReceived) {
      return res.status(400).json({
        result: false,
        message: "This carton has already been received at warehouse"
      });
    }

    if (event === 'shipped') {
      if (!hasReceived) {
        return res.status(400).json({
          result: false,
          message: "Cannot ship a carton that hasn't been received at warehouse yet"
        });
      }
      if (hasShipped) {
        return res.status(400).json({
          result: false,
          message: "This carton has already been shipped"
        });
      }
    }

    // Create scan record
    const scanRecord = {
      scannedAt: new Date(),
      scannedBy: req.user?._id,
      event,
      notes: notes || '',
      location: location || 'Main Warehouse',
      qualityCheck: qualityCheck || { passed: true, notes: '' }
    };

    qrCode.scans.push(scanRecord);
    qrCode.totalScans = (qrCode.totalScans || 0) + 1;
    if (!qrCode.firstScannedAt) qrCode.firstScannedAt = new Date();
    qrCode.lastScannedAt = new Date();

    // ✅ Handle Warehouse Receipt (received)
    if (event === 'received') {
      qrCode.status = 'received';
      qrCode.warehouseDetails = {
        receivedAt: new Date(),
        receivedBy: {
          userId: req.user?._id,
          userType: 'warehouse_inspector',
          name: req.user?.name || 'Warehouse Inspector'
        },
        conditionOnReceipt: qualityCheck?.passed ? 'good' : 'damaged',
        location: location || 'Main Warehouse',
        notes: notes || ''
      };

      try {
        await updateInventoryFromQRScan(qrCode, req.user, qualityCheck, notes);
      } catch (inventoryError) {
        console.warn('Inventory update failed on receive:', inventoryError.message);
      }

      await qrCode.save();

      return res.status(200).json({
        result: true,
        message: "Warehouse receipt scan completed successfully",
        data: {
          qrCode: {
            uniqueId: qrCode.uniqueId,
            articleName: qrCode.articleName,
            status: qrCode.status,
            currentStage: 'in_warehouse',
            nextStage: 'shipment'
          },
          scanDetails: scanRecord
        }
      });
    }

    // ✅ Handle Shipment (shipped)
    if (event === 'shipped') {
      qrCode.status = 'shipped';
      qrCode.shipmentDetails = {
        shippedAt: new Date(),
        shippedBy: {
          userId: req.user?._id,
          userType: 'shipment_manager',
          name: req.user?.name || 'Shipment Manager'
        },
        distributorId: distributorDetails?.distributorId,
        distributorName: distributorDetails?.distributorName,
        trackingNumber,
        notes: notes || ''
      };

      try {
        const shipment = await updateInventoryOnShipment(qrCode, req.user, distributorDetails);
        await qrCode.save();

        return res.status(200).json({
          result: true,
          message: "Shipment scan completed successfully",
          data: {
            qrCode: {
              uniqueId: qrCode.uniqueId,
              articleName: qrCode.articleName,
              status: qrCode.status,
              currentStage: 'shipped',
              nextStage: 'delivered'
            },
            shipmentDetails: {
              shipmentId: shipment?.shipmentId,
              distributorName: qrCode.shipmentDetails.distributorName,
              trackingNumber,
              shippedAt: qrCode.shipmentDetails.shippedAt
            },
            scanDetails: scanRecord
          }
        });
      } catch (shipmentError) {
        return res.status(500).json({
          result: false,
          message: "Failed to process shipment",
          error: shipmentError.message
        });
      }
    }

    // Fallback (should not reach here)
    await qrCode.save();
    return res.status(200).json({
      result: true,
      message: "QR code scanned successfully",
      data: {
        qrCode: {
          uniqueId: qrCode.uniqueId,
          articleName: qrCode.articleName,
          status: qrCode.status
        },
        scanDetails: scanRecord
      }
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: "Failed to process QR code scan",
      error: error.message
    });
  }
};




// ✅ Updated inventory function for your workflow
// ✅ Updated inventory function for your workflow
const updateInventoryFromQRScan = async (qrCode, user, qualityCheck, notes) => {
  try {
    // Get article name from QR code
    const articleName = qrCode.contractorInput?.articleName || qrCode.articleName;
    
    if (!articleName) {
      throw new Error('Article name not found in QR code data');
    }
    // ✅ Search using MongoDB aggregation for nested articles
    const productWithArticle = await Product.aggregate([
      { $unwind: '$variants' },
      { $unwind: '$variants.articles' },
      { 
        $match: { 
          'variants.articles.name': { $regex: new RegExp('^' + articleName + '$', 'i') }
        }
      },
      { $limit: 1 }
    ]);

    if (!productWithArticle || productWithArticle.length === 0) {
      throw new Error(`Product not found for article: ${articleName}`);
    }
    
    // Get the original product document
    const foundProduct = await Product.findById(productWithArticle[0]._id);
    if (!foundProduct) {
      throw new Error(`Product document not found for article: ${articleName}`);
    }
    
    // Find or create inventory record
    let inventory = await Inventory.findOne({ productId: foundProduct._id });
    
    if (!inventory) {
      inventory = new Inventory({
        productId: foundProduct._id,
        items: []
      });
    }

    // Sync the QR code data with inventory (will set status to 'received')
    await inventory.syncWithQRCode(qrCode._id);    
    return inventory;

  } catch (error) {
    console.error('Error updating inventory from QR scan:', error);
    throw error;
  }
};

// ✅ Updated shipment function for your workflow
const updateInventoryOnShipment = async (qrCode, user, distributorDetails) => {
  try {
    const articleNameFromQR = qrCode.contractorInput?.articleName || qrCode.articleName || 'Unknown';
    
    // Find the product using aggregation
    const productWithArticle = await Product.aggregate([
      { $unwind: '$variants' },
      { $unwind: '$variants.articles' },
      { 
        $match: { 
          'variants.articles.name': { $regex: new RegExp('^' + articleNameFromQR + '$', 'i') }
        }
      },
      { $limit: 1 }
    ]);

    if (!productWithArticle || productWithArticle.length === 0) {
      throw new Error(`Product not found for article: ${articleNameFromQR}`);
    }

    const product = await Product.findById(productWithArticle[0]._id);
    const inventory = await Inventory.findOne({ productId: product._id });
    
    if (!inventory) {
      throw new Error('Inventory record not found');
    }

    // Sync with updated QR code status (moves from received to shipped)
    await inventory.syncWithQRCode(qrCode._id);
    
    // ✅ CREATE OR UPDATE SHIPMENT RECORD
    await createOrUpdateShipment(qrCode, user, distributorDetails);
    
    return inventory;

  } catch (error) {
    console.error('Error updating inventory on shipment:', error);
    throw error;
  }
};

const getInventoryData = async (req, res) => {
  try {
    const { productId } = req.params;
    
    let query = {};
    if (productId && productId !== 'all') {
      query.productId = productId;
    }

    const inventories = await Inventory.find(query)
      .populate('productId', 'segment variants')
      .populate('items.manufacturedBy', 'name phoneNo')
      .populate('items.receivedBy', 'name phoneNo') 
      .populate('items.shippedBy', 'name phoneNo')
      .populate('items.distributorId', 'name phoneNo distributorDetails')
      .sort({ lastUpdated: -1 });

    // ✅ Format response with detailed breakdown
    const inventoryData = inventories.map(inventory => ({
      productId: inventory.productId._id,
      product: inventory.productId,
      summary: {
        totalQuantity: inventory.totalQuantity,
        availableQuantity: inventory.availableQuantity,
        stages: inventory.quantityByStage
      },
      items: inventory.items.map(item => ({
        qrCodeId: item.qrCodeId,
        uniqueId: item.uniqueId,
        articleName: item.articleName,
        articleDetails: item.articleDetails,
        status: item.status,
        timestamps: {
          manufactured: item.manufacturedAt,
          received: item.receivedAt,
          shipped: item.shippedAt
        },
        users: {
          manufacturedBy: item.manufacturedBy,
          receivedBy: item.receivedBy,
          shippedBy: item.shippedBy
        },
        distributor: item.distributorId,
        notes: item.notes
      })),
      lastUpdated: inventory.lastUpdated
    }));

    res.status(200).json({
      result: true,
      message: 'Inventory data retrieved successfully',
      data: {
        inventories: inventoryData,
        totalRecords: inventories.length
      }
    });

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to fetch inventory data',
      error: error.message
    });
  }
};

// ✅ Controller to get inventory stats for dashboard
const getInventoryStats = async (req, res) => {
  try {
    const inventories = await Inventory.find({});
    
    let totalStats = {
      totalItems: 0,
      availableItems: 0,
      generated: 0,
      manufactured: 0,
      received: 0,
      shipped: 0
    };

    inventories.forEach(inventory => {
      totalStats.totalItems += inventory.totalQuantity;
      totalStats.availableItems += inventory.availableQuantity;
      totalStats.generated += inventory.quantityByStage.generated;
      totalStats.manufactured += inventory.quantityByStage.manufactured;
      totalStats.received += inventory.quantityByStage.received;
      totalStats.shipped += inventory.quantityByStage.shipped;
    });

    res.status(200).json({
      result: true,
      message: 'Inventory stats retrieved successfully',
      data: totalStats
    });

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to fetch inventory stats',
      error: error.message
    });
  }
};

// Generate PDF receipt using PDFKit
// Add this route handler for PDF receipt generation
const generateShipmentReceipt = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    
    // Fetch actual shipment data
    const shipment = await Shipment.findOne({ shipmentId })
      .populate('distributorId', 'distributorDetails phoneNo')
      .populate('shippedBy', 'name')
      .populate({
        path: 'items.qrCodeId',
        select: 'contractorInput articleName'
      });

    if (!shipment) {
      return res.status(404).json({
        result: false,
        message: 'Shipment not found'
      });
    }

    // Create PDF document
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 50 
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Shipment_${shipmentId}_Receipt.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Header Section
    doc.fontSize(24)
       .fillColor('#2563eb')
       .text('📦 SHIPMENT RECEIPT', 50, 50, { align: 'center' });

    doc.fontSize(12)
       .fillColor('#666666')
       .text('Official Shipping Documentation', 50, 80, { align: 'center' });

    // Draw header line
    doc.strokeColor('#2563eb')
       .lineWidth(3)
       .moveTo(50, 100)
       .lineTo(545, 100)
       .stroke();

    // Company Info Section
    doc.fontSize(16)
       .fillColor('#1f2937')
       .text('Warehouse Management System', 50, 130);

    doc.fontSize(10)
       .fillColor('#666666')
       .text('Address: Main Warehouse Facility', 50, 150)
       .text('Phone: +91 XXXXX XXXXX', 50, 165)
       .text('Email: warehouse@company.com', 50, 180);

    // Shipment Details Box
    doc.rect(50, 220, 245, 120)
       .fillAndStroke('#f9fafb', '#e5e7eb');

    doc.fontSize(14)
       .fillColor('#1f2937')
       .text('📋 Shipment Details', 60, 235);

    doc.fontSize(10)
       .fillColor('#4b5563')
       .text(`Shipment ID: ${shipment.shipmentId}`, 60, 255)
       .text(`Date: ${new Date(shipment.shippedAt).toLocaleDateString()}`, 60, 270)
       .text(`Time: ${new Date(shipment.shippedAt).toLocaleTimeString()}`, 60, 285)
       .text(`Status: ${shipment.status.toUpperCase()}`, 60, 300)
       .text(`Total Cartons: ${shipment.totalCartons}`, 60, 315);

    // Distributor Details Box
    doc.rect(300, 220, 245, 120)
       .fillAndStroke('#f9fafb', '#e5e7eb');

    doc.fontSize(14)
       .fillColor('#1f2937')
       .text('🏢 Distributor Information', 310, 235);

    const distributor = shipment.distributorId;
    doc.fontSize(10)
       .fillColor('#4b5563')
       .text(`Company: ${shipment.distributorName}`, 310, 255)
       .text(`Contact: ${distributor?.phoneNo || 'N/A'}`, 310, 270)
       .text(`Party: ${distributor?.distributorDetails?.partyName || 'N/A'}`, 310, 285)
       .text(`Transport: ${distributor?.distributorDetails?.transport || 'N/A'}`, 310, 300);

    // Items Table Header
    doc.fontSize(16)
       .fillColor('#1f2937')
       .text('📦 Shipped Items', 50, 370);

    // Table Header Background
    doc.rect(50, 400, 495, 25)
       .fillAndStroke('#2563eb', '#2563eb');

    doc.fontSize(10)
       .fillColor('white')
       .text('#', 60, 410, { width: 30 })
       .text('Article Name', 100, 410, { width: 140 })
       .text('Colors', 250, 410, { width: 80 })
       .text('Sizes', 340, 410, { width: 60 })
       .text('Status', 410, 410, { width: 60 })
       .text('Unique ID', 480, 410, { width: 65 });

    // Table Rows
    let yPosition = 430;
    shipment.items.forEach((item, index) => {
      // Alternate row colors
      if (index % 2 === 0) {
        doc.rect(50, yPosition - 5, 495, 20)
           .fillAndStroke('#f9fafb', '#f9fafb');
      }

      doc.fillColor('#1f2937')
         .text((index + 1).toString(), 60, yPosition, { width: 30 })
         .text(item.articleName || 'Unknown', 100, yPosition, { width: 140 })
         .text(Array.isArray(item.articleDetails?.colors) ? 
               item.articleDetails.colors.join(', ') : 
               item.articleDetails?.colors || 'N/A', 250, yPosition, { width: 80 })
         .text(Array.isArray(item.articleDetails?.sizes) ? 
               item.articleDetails.sizes.join(', ') : 
               item.articleDetails?.sizes || 'N/A', 340, yPosition, { width: 60 })
         .text('SHIPPED', 410, yPosition, { width: 60 })
         .text(item.uniqueId.substring(0, 8) + '...', 480, yPosition, { width: 65 });

      yPosition += 20;
    });

    // Summary Section
    const summaryY = yPosition + 30;
    doc.rect(50, summaryY, 495, 80)
       .fillAndStroke('#f0f9ff', '#bae6fd');

    doc.fontSize(14)
       .fillColor('#1e40af')
       .text('📊 Shipment Summary', 60, summaryY + 15);

    doc.fontSize(10)
       .fillColor('#1e40af')
       .text(`Total Items: ${shipment.items.length}`, 60, summaryY + 35)
       .text(`Total Cartons: ${shipment.totalCartons}`, 60, summaryY + 50)
       .text(`Shipment Status: ${shipment.status.toUpperCase()}`, 300, summaryY + 35)
       .text(`Generated: ${new Date().toLocaleDateString()}`, 300, summaryY + 50);

    // Footer
    const footerY = summaryY + 100;
    doc.fontSize(10)
       .fillColor('#6b7280')
       .text('Contact: warehouse@company.com | +91 XXXXX XXXXX', 50, footerY, { align: 'center' })
       .text('Warehouse Management System', 50, footerY + 15, { align: 'center' })
       .text(`Receipt generated on ${new Date().toLocaleString()}`, 50, footerY + 35, { align: 'center' })
       .text('This is a computer-generated document.', 50, footerY + 50, { align: 'center', style: 'italic' });

    // Finalize the PDF
    doc.end();

  } catch (error) {
    // If response headers haven't been sent yet, send JSON error
    if (!res.headersSent) {
      res.status(500).json({
        result: false,
        message: 'Failed to generate PDF receipt',
        error: error.message
      });
    }
  }
};




const generateQRWithLabel = async (qrString, labelData) => {
  try {
    // ✅ Generate base QR code with improved settings for scanning reliability
    const qrCodeDataURL = await QRCodeLib.toDataURL(qrString, {
      width: 320,           // ✅ Increased size for better scanning
      margin: 4,            // ✅ CRITICAL: 4+ module quiet zone (was 2)
      color: { 
        dark: '#000000',    // Pure black
        light: '#FFFFFF'    // Pure white
      },
      errorCorrectionLevel: 'Q'  // ✅ CRITICAL: Higher error correction (was 'M')
    });

    // ✅ Create canvas with proper proportions
    const canvas = createCanvas(450, 650); // Slightly taller for better layout
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 450, 650);

    // ✅ Add label information on top with proper spacing from QR quiet zone
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px Arial';  // Slightly smaller for better fit
    ctx.textAlign = 'center';

    let yPos = 30;
    ctx.fillText(`Article: ${labelData.articleName}`, 225, yPos);
    yPos += 25;
    ctx.fillText(`Colors: ${labelData.colors}`, 225, yPos);
    yPos += 25;
    ctx.fillText(`Sizes: ${labelData.sizes}`, 225, yPos);
    yPos += 25;
    ctx.fillText(`Carton No: ${labelData.cartonNo}`, 225, yPos);

    // Add separator line with proper spacing from QR
    yPos += 35;  // ✅ More space before QR code
    ctx.strokeStyle = '#cccccc';  // Lighter line to avoid interfering with QR
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(75, yPos);
    ctx.lineTo(375, yPos);
    ctx.stroke();

    // ✅ Position QR code with adequate spacing (respects quiet zone)
    const qrImage = await loadImage(qrCodeDataURL);
    const qrYPos = yPos + 40;  // ✅ Sufficient space from separator
    
    // ✅ Center QR code and ensure no overlap with labels
    ctx.drawImage(qrImage, 65, qrYPos, 320, 320);  // Matches generated width

    // ✅ Add scanning instructions below QR (outside quiet zone)
    ctx.font = '12px Arial';
    ctx.fillStyle = '#666666';
    const instructionYPos = qrYPos + 340;
    ctx.fillText('Scan to track carton through warehouse', 225, instructionYPos);
    
    // ✅ Add unique ID for manual reference
    ctx.font = '10px monospace';
    ctx.fillStyle = '#999999';
    const uniqueIdText = `ID: ${qrString.includes('uniqueId') ? 
      JSON.parse(qrString).uniqueId.substring(0, 8) + '...' : 
      qrString.substring(0, 12)}`;
    ctx.fillText(uniqueIdText, 225, instructionYPos + 20);

    // Convert canvas to data URL
    return canvas.toDataURL('image/png');

  } catch (error) {
    console.error('Error generating QR with label:', error);
    
    // ✅ Improved fallback with same critical settings
    return await QRCodeLib.toDataURL(qrString, {
      width: 320,
      margin: 4,            // ✅ Keep 4+ module margin in fallback
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'Q'  // ✅ Keep higher error correction
    });
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
    
    // ✅ Fixed size display (only first X last)
    let sizesDisplay = 'N/A';
    if (articleInfo.sizes && Array.isArray(articleInfo.sizes)) {
      if (articleInfo.sizes.length === 1) {
        sizesDisplay = articleInfo.sizes[0];
      } else if (articleInfo.sizes.length > 1) {
        sizesDisplay = `${articleInfo.sizes[0]}X${articleInfo.sizes[articleInfo.sizes.length - 1]}`;
      }
    }
    
    doc.fontSize(12)
       .text(`Article Name: ${articleName}`, 60, articleBoxY + 30)
       .text(`Colors: ${colors}`, 60, articleBoxY + 45)
       .text(`Sizes: ${sizesDisplay}`, 60, articleBoxY + 60)
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

const generateShipmentReceiptPDF = async (req, res) => {
  try {
    const { 
      shipmentId, 
      distributorName, 
      totalCartons, 
      shippedAt, 
      items 
    } = req.body;

    // ✅ Create PDF document
    const doc = new PDFDocument({ 
      size: 'A4',
      margin: 50 
    });

    // ✅ Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Shipment_${shipmentId}_Receipt.pdf"`);

    // ✅ Pipe PDF to response
    doc.pipe(res);

    // Header Section
    doc.fontSize(24)
       .fillColor('#2563eb')
       .text('📦 SHIPMENT RECEIPT', 50, 50, { align: 'center' });

    doc.fontSize(12)
       .fillColor('#666666')
       .text('Official Shipping Documentation', 50, 80, { align: 'center' });

    // Draw header line
    doc.strokeColor('#2563eb')
       .lineWidth(3)
       .moveTo(50, 100)
       .lineTo(545, 100)
       .stroke();

    // Company Info Section
    doc.fontSize(16)
       .fillColor('#1f2937')
       .text('Warehouse Management System', 50, 130);

    doc.fontSize(10)
       .fillColor('#666666')
       .text('Address: Main Warehouse Facility', 50, 150)
       .text('Phone: +91 XXXXX XXXXX', 50, 165)
       .text('Email: warehouse@company.com', 50, 180);

    // Shipment Details Box
    doc.rect(50, 220, 245, 140)
       .fillAndStroke('#f9fafb', '#e5e7eb');

    doc.fontSize(14)
       .fillColor('#1f2937')
       .text('📋 Shipment Details', 60, 235);

    doc.fontSize(10)
       .fillColor('#4b5563')
       .text(`Shipment ID: ${shipmentId}`, 60, 255)
       .text(`Date: ${new Date(shippedAt).toLocaleDateString()}`, 60, 270)
       .text(`Time: ${new Date(shippedAt).toLocaleTimeString()}`, 60, 285)
       .text(`Status: SHIPPED`, 60, 300)
       .text(`Total Cartons: ${totalCartons}`, 60, 315)
       .text(`Shipped By: ${req.user?.name || 'Shipment Manager'}`, 60, 330);

    // Distributor Details Box
    doc.rect(300, 220, 245, 140)
       .fillAndStroke('#f9fafb', '#e5e7eb');

    doc.fontSize(14)
       .fillColor('#1f2937')
       .text('🏢 Distributor Information', 310, 235);

    doc.fontSize(10)
       .fillColor('#4b5563')
       .text(`Company: ${distributorName}`, 310, 255)
       .text('Contact: +91 XXXXX XXXXX', 310, 270)
       .text('Email: distributor@email.com', 310, 285)
       .text('Address: Distributor Address', 310, 300)
       .text('Transport: Road Transport', 310, 315)
       .text('City: Mumbai', 310, 330);

    // Items Table Header
    doc.fontSize(16)
       .fillColor('#1f2937')
       .text('📦 Shipped Items', 50, 390);

    // Table Header Background
    doc.rect(50, 420, 495, 25)
       .fillAndStroke('#2563eb', '#2563eb');

    doc.fontSize(10)
       .fillColor('white')
       .text('#', 60, 430, { width: 30 })
       .text('Article Name', 100, 430, { width: 140 })
       .text('Colors', 250, 430, { width: 80 })
       .text('Sizes', 340, 430, { width: 60 })
       .text('Carton #', 410, 430, { width: 60 })
       .text('Status', 480, 430, { width: 65 });

    // Table Rows
    let yPosition = 450;
    const maxItemsPerPage = 15;
    
    items.slice(0, maxItemsPerPage).forEach((item, index) => {
      // Alternate row colors
      if (index % 2 === 0) {
        doc.rect(50, yPosition - 5, 495, 20)
           .fillAndStroke('#f9fafb', '#f9fafb');
      }

      doc.fillColor('#1f2937')
         .text((index + 1).toString(), 60, yPosition, { width: 30 })
         .text(item.articleName || 'Unknown', 100, yPosition, { width: 140 })
         .text(Array.isArray(item.colors) ? 
               item.colors.join(', ') : 
               item.colors || 'N/A', 250, yPosition, { width: 80 })
         .text(Array.isArray(item.sizes) ? 
               item.sizes.join(', ') : 
               item.sizes || 'N/A', 340, yPosition, { width: 60 })
         .text(`#${item.cartonNumber || index + 1}`, 410, yPosition, { width: 60 })
         .text('SHIPPED', 480, yPosition, { width: 65 });

      yPosition += 20;
    });

    // Add overflow indicator if there are more items
    if (items.length > maxItemsPerPage) {
      doc.fontSize(10)
         .fillColor('#6b7280')
         .text(`... and ${items.length - maxItemsPerPage} more items`, 60, yPosition + 10, { style: 'italic' });
      yPosition += 30;
    }

    // Summary Section
    const summaryY = yPosition + 30;
    doc.rect(50, summaryY, 495, 100)
       .fillAndStroke('#f0f9ff', '#bae6fd');

    doc.fontSize(14)
       .fillColor('#1e40af')
       .text('📊 Shipment Summary', 60, summaryY + 15);

    const uniqueArticles = [...new Set(items.map(item => item.articleName))].filter(Boolean);
    const estimatedWeight = totalCartons * 2; // 2kg per carton estimate

    doc.fontSize(10)
       .fillColor('#1e40af')
       .text(`Total Items Shipped: ${items.length} Items`, 60, summaryY + 35)
       .text(`Total Cartons: ${totalCartons}`, 60, summaryY + 50)
       .text(`Unique Articles: ${uniqueArticles.length}`, 60, summaryY + 65)
       .text(`Estimated Weight: ${estimatedWeight} kg`, 300, summaryY + 35)
       .text(`Shipment Status: SHIPPED`, 300, summaryY + 50)
       .text(`Generated: ${new Date().toLocaleDateString()}`, 300, summaryY + 65);

    // Footer
    const footerY = summaryY + 120;
    doc.fontSize(10)
       .fillColor('#6b7280')
       .text('Contact Information: warehouse@company.com | +91 XXXXX XXXXX', 50, footerY, { align: 'center' })
       .text('Warehouse Management System', 50, footerY + 15, { align: 'center' })
       .text(`Receipt generated on ${new Date().toLocaleString()}`, 50, footerY + 35, { align: 'center' })
       .text('This is a computer-generated document and does not require a signature.', 50, footerY + 50, { align: 'center', style: 'italic' });

    // Add QR tracking info footer
    doc.fontSize(8)
       .fillColor('#9ca3af')
       .text(`Tracking: Use shipment ID ${shipmentId} for status updates`, 50, footerY + 70, { align: 'center' });

    // ✅ Finalize the PDF
    doc.end();

  } catch (error) {
    console.error('Error generating PDF receipt:', error);
    
    // If response headers haven't been sent yet, send JSON error
    if (!res.headersSent) {
      res.status(500).json({
        result: false,
        message: 'Failed to generate PDF receipt',
        error: error.message
      });
    } else {
      // If we're already streaming PDF, we can't send JSON
      console.error('PDF generation failed mid-stream:', error.message);
    }
  }
};

const getSingleProductInventory = async (req, res) => {
  try {
    const { productId } = req.params;
    const { search = '', startDate, endDate, sort = 'dateDesc', status } = req.query;
    
    if (!productId) {
      return res.status(400).json({
        result: false,
        message: 'Product ID is required'
      });
    }

    // Get inventory with detailed QR information
    const inventory = await Inventory.findOne({ productId })
      .populate({
        path: 'items.qrCodeId',
        select: 'uniqueId status totalScans scans createdAt batchId contractorInput',
        populate: {
          path: 'batchId',
          select: 'batchId articleName generatedBy createdAt'
        }
      })
      .lean();

    // Get product data
    const product = await Product.findById(productId).lean();
    
    if (!product) {
      return res.status(404).json({
        result: false,
        message: 'Product not found'
      });
    }

    let items = inventory?.items || [];
    
    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase();
      items = items.filter(item => 
        item.articleName?.toLowerCase().includes(searchLower) ||
        item.uniqueId?.toLowerCase().includes(searchLower) ||
        item.qrCodeId?.uniqueId?.toLowerCase().includes(searchLower)
      );
    }

    if (status) {
      items = items.filter(item => item.status === status);
    }

    if (startDate || endDate) {
      items = items.filter(item => {
        const itemDate = item.manufacturedAt || item.createdAt;
        if (!itemDate) return true;
        
        const date = new Date(itemDate);
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        
        return (!start || date >= start) && (!end || date <= end);
      });
    }

    // Apply sorting
    items.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.manufacturedAt);
      const dateB = new Date(b.createdAt || b.manufacturedAt);
      
      if (sort === 'dateAsc' || sort === 'timeAsc') return dateA - dateB;
      return dateB - dateA;
    });

    // Group by article and calculate statistics
    const itemsByArticle = {};
    const statsByArticle = {};
    const statusBreakdown = {};
    
    items.forEach(item => {
      const articleName = item.articleName;
      
      // Group items
      if (!itemsByArticle[articleName]) {
        itemsByArticle[articleName] = [];
        statsByArticle[articleName] = {
          totalItems: 0,
          scannedItems: 0,
          totalScans: 0,
          lastActivity: null
        };
        statusBreakdown[articleName] = {
          generated: 0,
          manufactured: 0,
          received: 0,
          shipped: 0
        };
      }

      // Enhanced item data
      const enhancedItem = {
        ...item,
        qrDetails: item.qrCodeId ? {
          uniqueId: item.qrCodeId.uniqueId,
          status: item.qrCodeId.status,
          totalScans: item.qrCodeId.totalScans,
          createdAt: item.qrCodeId.createdAt,
          contractorInput: item.qrCodeId.contractorInput,
          lastScanned: item.qrCodeId.scans?.length > 0 
            ? item.qrCodeId.scans[item.qrCodeId.scans.length - 1].scannedAt 
            : null,
          scanHistory: item.qrCodeId.scans || []
        } : null
      };
      
      itemsByArticle[articleName].push(enhancedItem);
      
      // Update statistics
      statsByArticle[articleName].totalItems++;
      if (item.qrCodeId?.totalScans > 0) {
        statsByArticle[articleName].scannedItems++;
        statsByArticle[articleName].totalScans += item.qrCodeId.totalScans;
      }
      
      // Status breakdown
      if (statusBreakdown[articleName][item.status] !== undefined) {
        statusBreakdown[articleName][item.status]++;
      }
      
      // Last activity
      const lastActivity = enhancedItem.qrDetails?.lastScanned;
      if (lastActivity && (!statsByArticle[articleName].lastActivity || 
          new Date(lastActivity) > new Date(statsByArticle[articleName].lastActivity))) {
        statsByArticle[articleName].lastActivity = lastActivity;
      }
    });

    return res.status(200).json({
      result: true,
      message: 'Product inventory data retrieved successfully',
      data: {
        // Summary statistics
        inventoryCount: inventory?.totalQuantity || 0,
        availableQuantity: inventory?.availableQuantity || 0,
        quantityByStage: inventory?.quantityByStage || {
          generated: 0,
          manufactured: 0,
          received: 0,
          shipped: 0
        },
        
        // Filtered and sorted items
        inventoryItems: items,
        
        // Grouped data for frontend display
        itemsByArticle,
        statsByArticle,
        statusBreakdown,
        
        // Product information
        product,
        lastUpdated: inventory?.lastUpdated || null,
        
        // Filter metadata
        appliedFilters: {
          search,
          status,
          startDate,
          endDate,
          sort,
          totalItemsBeforeFilter: inventory?.items?.length || 0,
          totalItemsAfterFilter: items.length
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to get product inventory data',
      error: error.message
    });
  }
};

const getAllInventory = async (req, res) => {
  try {
    const { limit = 50, offset = 0, sortBy = 'lastUpdated' } = req.query;

    // Get all inventory records with product and QR data
    const inventories = await Inventory.find({})
      .populate('productId', 'segment variants')
      .populate({
        path: 'items.qrCodeId',
        select: 'status totalScans batchId createdAt'
      })
      .sort({ [sortBy]: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    // Transform data for frontend consumption
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

      // Status breakdown
      const statusBreakdown = inventory.items.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});

      // Article breakdown
      const articleBreakdown = inventory.items.reduce((acc, item) => {
        const key = item.articleName;
        if (!acc[key]) {
          acc[key] = { 
            count: 0, 
            qrsGenerated: 0, 
            qrsScanned: 0,
            lastActivity: null
          };
        }
        acc[key].count++;
        if (item.qrCodeId) {
          acc[key].qrsGenerated++;
          if (item.qrCodeId.totalScans > 0) {
            acc[key].qrsScanned++;
          }
          // Track last activity
          if (item.qrCodeId.createdAt && (!acc[key].lastActivity || 
              new Date(item.qrCodeId.createdAt) > new Date(acc[key].lastActivity))) {
            acc[key].lastActivity = item.qrCodeId.createdAt;
          }
        }
        return acc;
      }, {});

      return {
        productId: inventory.productId._id,
        productInfo: {
          segment: inventory.productId.segment,
          totalVariants: inventory.productId.variants?.length || 0,
          totalArticles: inventory.productId.variants?.reduce((sum, variant) => 
            sum + (variant.articles?.length || 0), 0) || 0
        },
        inventoryMetrics: {
          totalQuantity: inventory.totalQuantity,
          availableQuantity: inventory.availableQuantity,
          quantityByStage: inventory.quantityByStage
        },
        qrCodeStats: qrStats,
        statusBreakdown,
        articleBreakdown,
        lastUpdated: inventory.lastUpdated
      };
    });

    // Calculate overall statistics
    const overallStats = inventoryData.reduce((acc, data) => ({
      totalProducts: acc.totalProducts + 1,
      totalItems: acc.totalItems + data.inventoryMetrics.totalQuantity,
      totalQRs: acc.totalQRs + data.qrCodeStats.totalQRs,
      totalScans: acc.totalScans + data.qrCodeStats.totalScans
    }), { totalProducts: 0, totalItems: 0, totalQRs: 0, totalScans: 0 });

    return res.status(200).json({
      result: true,
      message: 'All inventory data retrieved successfully',
      data: {
        overallStats,
        inventoryData,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: inventoryData.length === parseInt(limit)
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to get all inventory data',
      error: error.message
    });
  }
};

const getQRStatistics = async (req, res) => {
  try {
    const { 
      sortBy = 'latest', 
      dateRange = '30d',
      articleFilter,
      statusFilter 
    } = req.query;

    // Build match query
    const matchQuery = {};
    
    // Date range filter
    if (dateRange && dateRange !== 'all') {
      const days = parseInt(dateRange.replace('d', ''));
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      matchQuery.createdAt = { $gte: startDate };
    }

    if (articleFilter) {
      matchQuery.articleName = { $regex: articleFilter, $options: 'i' };
    }

    if (statusFilter) {
      matchQuery.status = statusFilter;
    }

    // QR statistics by article
    const qrStatsByArticle = await QRCode.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            articleName: '$articleName',
            productId: '$productId',
            variantName: '$variantName'
          },
          totalQRsGenerated: { $sum: 1 },
          totalScans: { $sum: '$totalScans' },
          scannedQRs: {
            $sum: { $cond: [{ $gt: ['$totalScans', 0] }, 1, 0] }
          },
          generatedQRs: {
            $sum: { $cond: [{ $eq: ['$status', 'generated'] }, 1, 0] }
          },
          manufacturedQRs: {
            $sum: { $cond: [{ $eq: ['$status', 'manufactured'] }, 1, 0] }
          },
          receivedQRs: {
            $sum: { $cond: [{ $eq: ['$status', 'received'] }, 1, 0] }
          },
          shippedQRs: {
            $sum: { $cond: [{ $eq: ['$status', 'shipped'] }, 1, 0] }
          },
          firstGenerated: { $min: '$createdAt' },
          lastGenerated: { $max: '$createdAt' },
          avgScansPerQR: { $avg: '$totalScans' },
          uniqueBatches: { $addToSet: '$batchId' }
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
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          articleName: '$_id.articleName',
          productId: '$_id.productId',
          variantName: '$_id.variantName',
          productSegment: '$product.segment',
          unusedQRs: { $subtract: ['$totalQRsGenerated', '$scannedQRs'] },
          scanRate: {
            $cond: [
              { $gt: ['$totalQRsGenerated', 0] },
              { 
                $round: [
                  { $multiply: [{ $divide: ['$scannedQRs', '$totalQRsGenerated'] }, 100] },
                  2
                ]
              },
              0
            ]
          },
          totalBatches: { $size: '$uniqueBatches' },
          avgScansPerQR: { $round: ['$avgScansPerQR', 2] }
        }
      },
      {
        $sort: sortBy === 'oldest' ? { lastGenerated: 1 } : { lastGenerated: -1 }
      }
    ]);

    // Recent activity (batches created)
    const recentActivity = await QRCode.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            batchId: '$batchId',
            articleName: '$articleName',
            productId: '$productId'
          },
          qrCount: { $sum: 1 },
          createdAt: { $max: '$createdAt' },
          totalScans: { $sum: '$totalScans' },
          status: { $first: '$status' }
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
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          batchId: '$_id.batchId',
          articleName: '$_id.articleName',
          productSegment: '$product.segment'
        }
      },
      { $sort: { createdAt: -1 } },
      { $limit: 20 }
    ]);

    // Overall statistics
    const overallStats = qrStatsByArticle.reduce((acc, stat) => ({
      totalArticles: acc.totalArticles + 1,
      totalQRsGenerated: acc.totalQRsGenerated + stat.totalQRsGenerated,
      totalScans: acc.totalScans + stat.totalScans,
      totalScannedQRs: acc.totalScannedQRs + stat.scannedQRs,
      totalGeneratedQRs: acc.totalGeneratedQRs + stat.generatedQRs,
      totalManufacturedQRs: acc.totalManufacturedQRs + stat.manufacturedQRs,
      totalReceivedQRs: acc.totalReceivedQRs + stat.receivedQRs,
      totalShippedQRs: acc.totalShippedQRs + stat.shippedQRs,
      totalBatches: acc.totalBatches + stat.totalBatches
    }), {
      totalArticles: 0,
      totalQRsGenerated: 0,
      totalScans: 0,
      totalScannedQRs: 0,
      totalGeneratedQRs: 0,
      totalManufacturedQRs: 0,
      totalReceivedQRs: 0,
      totalShippedQRs: 0,
      totalBatches: 0
    });

    // Add calculated fields
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
        recentActivity,
        appliedFilters: {
          sortBy,
          dateRange,
          articleFilter,
          statusFilter
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to retrieve QR statistics',
      error: error.message
    });
  }
};


// ✅ FIXED: addContractor - Let schema handle password hashing
const addContractor = async (req, res) => {
  try {
    const { fullName, phoneNo, password } = req.body;

    if (!fullName || !phoneNo || !password) {
      return res.status(statusCodes.badRequest).json({
        result: false,
        message: "Full name, phone number, and password are required"
      });
    }

    const cleanPhoneNo = String(phoneNo).trim();

    const existingUser = await userModel.findOne({ phoneNo: cleanPhoneNo });
    if (existingUser) {
      return res.status(statusCodes.conflict).json({
        result: false,
        message: "Phone number already registered"
      });
    }

    // ✅ REMOVED manual hashing - let schema handle it
    const newContractor = new userModel({
      name: fullName,
      phoneNo: cleanPhoneNo,
      password: password,  // ✅ Plain text - schema will hash it
      role: 'contractor',
      isActive: true,
      contractorDetails: {
        fullName,
        phoneNo: cleanPhoneNo,
        password: password,  // ✅ Plain text here too
        totalItemsProduced: 0,
        activeProductions: []
      },
      createdBy: req.user?._id
    });

    await newContractor.save(); // Schema pre("save") will hash the password

    const contractorResponse = {
      _id: newContractor._id,
      name: newContractor.name,
      phoneNo: newContractor.phoneNo,
      role: newContractor.role,
      fullName: newContractor.contractorDetails.fullName,
      isActive: newContractor.isActive,
      createdAt: newContractor.createdAt
    };

    res.status(statusCodes.success).json({
      result: true,
      message: "Contractor added successfully",
      data: contractorResponse
    });

  } catch (error) {
    res.status(statusCodes.serverError).json({
      result: false,
      message: "Failed to add contractor",
      error: error.message
    });
  }
};

// ✅ FIXED: addWarehouseManager 
const addWarehouseManager = async (req, res) => {
  try {
    const { fullName, phoneNo, password } = req.body;

    if (!fullName || !phoneNo || !password) {
      return res.status(statusCodes.badRequest).json({
        result: false,
        message: "Full name, phone number, and password are required"
      });
    }

    const cleanPhoneNo = String(phoneNo).trim();

    const existingUser = await userModel.findOne({ phoneNo: cleanPhoneNo });
    if (existingUser) {
      return res.status(statusCodes.conflict).json({
        result: false,
        message: "Phone number already registered"
      });
    }

    // ✅ REMOVED manual hashing
    const newWarehouseManager = new userModel({
      name: fullName,
      phoneNo: cleanPhoneNo,
      password: password,  // ✅ Plain text
      role: 'warehouse_inspector',
      isActive: true,
      warehouseInspectorDetails: {
        fullName,
        phoneNo: cleanPhoneNo,
        password: password,  // ✅ Plain text
        totalItemsInspected: 0,
        itemsProcessedToday: 0
      },
      createdBy: req.user?._id
    });

    await newWarehouseManager.save();

    const warehouseManagerResponse = {
      _id: newWarehouseManager._id,
      name: newWarehouseManager.name,
      phoneNo: newWarehouseManager.phoneNo,
      role: newWarehouseManager.role,
      fullName: newWarehouseManager.warehouseInspectorDetails.fullName,
      isActive: newWarehouseManager.isActive,
      createdAt: newWarehouseManager.createdAt
    };

    res.status(statusCodes.success).json({
      result: true,
      message: "Warehouse manager added successfully",
      data: warehouseManagerResponse
    });

  } catch (error) {
    res.status(statusCodes.serverError).json({
      result: false,
      message: "Failed to add warehouse manager",
      error: error.message
    });
  }
};

// ✅ FIXED: addShipmentManager
const addShipmentManager = async (req, res) => {
  try {
    const { fullName, phoneNo, password } = req.body;

    if (!fullName || !phoneNo || !password) {
      return res.status(statusCodes.badRequest).json({
        result: false,
        message: "Full name, phone number, and password are required"
      });
    }

    const cleanPhoneNo = String(phoneNo).trim();

    const existingUser = await userModel.findOne({ phoneNo: cleanPhoneNo });
    if (existingUser) {
      return res.status(statusCodes.conflict).json({
        result: false,
        message: "Phone number already registered"
      });
    }

    // ✅ REMOVED manual hashing
    const newShipmentManager = new userModel({
      name: fullName,
      phoneNo: cleanPhoneNo,
      password: password,  // ✅ Plain text
      role: 'shipment_manager',
      isActive: true,
      shipmentManagerDetails: {
        fullName,
        phoneNo: cleanPhoneNo,
        password: password,  // ✅ Plain text
        totalShipmentsHandled: 0,
        activeShipments: []
      },
      createdBy: req.user?._id
    });

    await newShipmentManager.save();

    const shipmentManagerResponse = {
      _id: newShipmentManager._id,
      name: newShipmentManager.name,
      phoneNo: newShipmentManager.phoneNo,
      role: newShipmentManager.role,
      fullName: newShipmentManager.shipmentManagerDetails.fullName,
      isActive: newShipmentManager.isActive,
      createdAt: newShipmentManager.createdAt
    };

    res.status(statusCodes.success).json({
      result: true,
      message: "Shipment manager added successfully",
      data: shipmentManagerResponse
    });

  } catch (error) {
    res.status(statusCodes.serverError).json({
      result: false,
      message: "Failed to add shipment manager",
      error: error.message
    });
  }
};

// ✅ FIXED: addDistributor
const addDistributor = async (req, res) => {
    try {
        let { billNo, partyName, transport, phoneNo, password } = req.body;

        let numBillNo = Number(billNo);
        partyName = partyName ? partyName.trim() : "";
        transport = transport ? transport.trim() : "";
        password = password ? password.trim() : "";

        let checkData = distributorValidationSchema.safeParse({
            billNo: numBillNo, 
            partyName, 
            transport, 
            phoneNo, 
            password
        });

        if (!checkData.success) {
            return res.status(statusCodes.badRequest).json({
                result: false, 
                message: checkData.error.errors[0].message, 
                error: checkData.error
            });
        }

        let alreadyInDb = await userModel.findOne({ phoneNo });

        if (alreadyInDb) {
            return res.status(statusCodes.conflict).json({
                result: false, 
                message: "Phone number already registered"
            });
        }

        // ✅ REMOVED manual hashing
        await userModel.create({
            name: partyName,
            phoneNo,
            password: password,  // ✅ Plain text - schema will hash it
            role: "distributor",
            isActive: true,
            distributorDetails: {
                billNo: numBillNo,
                partyName,
                transport,
                purchases: [],
                receivedShipments: []
            },
            createdBy: req.user?._id || null
        });

        return res.status(statusCodes.success).json({
            result: true, 
            message: "Distributor Created Successfully"
        });

    } catch (error) {
        return res.status(statusCodes.serverError).json({
            result: false, 
            message: "Error in Adding Distributor. Please Try Again Later",
            error: error.message
        });
    }
};

// Add this function to your backend
const createOrUpdateShipment = async (qrCode, user, distributorDetails) => {
  try {

    
    const shipmentId = `SHIP_${Date.now()}_${distributorDetails.distributorId.slice(-6)}`;

    // ✅ Create new item for shipment
    const newItem = {
      qrCodeId: qrCode._id,
      uniqueId: qrCode.uniqueId,
      articleName: qrCode.articleName || qrCode.contractorInput?.articleName,
      articleDetails: {
        color: qrCode.contractorInput?.color || 'Unknown',
        size: qrCode.contractorInput?.size || 'Unknown', 
        numberOfCartons: qrCode.contractorInput?.totalCartons || 1
      },
      manufacturedAt: qrCode.manufacturingDetails?.manufacturedAt || null,
      receivedAt: qrCode.warehouseDetails?.receivedAt || new Date(),
      shippedAt: new Date(),
      trackingNumber: `TRACK_${Date.now()}`
    };

    // ✅ FIXED: Use valid enum value for status
    const shipmentData = {
      shipmentId,
      distributorId: distributorDetails.distributorId,
      distributorName: distributorDetails.distributorName,
      shippedBy: user._id,
      shippedAt: new Date(),
      status: 'active', // ✅ Valid enum value
      items: [newItem],
      totalCartons: 1
    };

    // Check if shipment already exists for this distributor today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let existingShipment = await Shipment.findOne({
      distributorId: distributorDetails.distributorId,
      shippedAt: { $gte: today, $lt: tomorrow },
      status: 'active' // ✅ Use valid enum value
    });

    let shipment;
    if (existingShipment) {
      // Add item to existing shipment
      existingShipment.items.push(newItem);
      existingShipment.totalCartons = existingShipment.items.length;
      shipment = await existingShipment.save();
    } else {
      // Create new shipment
      const newShipment = new Shipment(shipmentData);
      shipment = await newShipment.save();
    }

    // ✅ CRITICAL: Manually update inventory after shipment creation
    await updateInventoryAfterShipment(qrCode);

    return shipment;

  } catch (error) {
    console.error('Error creating/updating shipment:', error);
    throw error;
  }
};

// ✅ NEW: Function to manually update inventory after shipment
const updateInventoryAfterShipment = async (qrCode) => {
  try {

    const articleName = qrCode.articleName || qrCode.contractorInput?.articleName || 'Unknown';
    
    // Find the product using aggregation
    const productWithArticle = await Product.aggregate([
      { $unwind: '$variants' },
      { $unwind: '$variants.articles' },
      { 
        $match: { 
          'variants.articles.name': { $regex: new RegExp('^' + articleName + '$', 'i') }
        }
      },
      { $limit: 1 }
    ]);

    if (!productWithArticle || productWithArticle.length === 0) {
      throw new Error(`Product not found for article: ${articleName}`);
    }

    const product = await Product.findById(productWithArticle[0]._id);
    const inventory = await Inventory.findOne({ productId: product._id });
    
    if (!inventory) {
      throw new Error('Inventory record not found');
    }

    // ✅ MANUALLY update the item status in inventory
    const itemIndex = inventory.items.findIndex(item => 
      item.qrCodeId.toString() === qrCode._id.toString()
    );

    if (itemIndex !== -1) {
      // Update the item status from 'received' to 'shipped'
      inventory.items[itemIndex].status = 'shipped';
      inventory.items[itemIndex].shippedAt = new Date();
      
      // ✅ CRITICAL: Manually recalculate the counts
      inventory.quantityByStage.received = inventory.items.filter(i => i.status === 'received').length;
      inventory.quantityByStage.shipped = inventory.items.filter(i => i.status === 'shipped').length;
      inventory.availableQuantity = inventory.quantityByStage.received;
      inventory.lastUpdated = new Date();

      // Save the updated inventory
      await inventory.save();
      
    } else {
      console.warn('Item not found in inventory for QR code:', qrCode.uniqueId);
    }

    return inventory;

  } catch (error) {
    console.error('Error updating inventory after shipment:', error);
    throw error;
  }
};



// Enhanced controller method for getting shipment details with article images
const getShipmentDetails = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    
    const shipment = await Shipment.findById(shipmentId)
      .populate('distributorId', 'name phoneNo email distributorDetails')
      .populate('shippedBy', 'name phoneNo')
      .populate({
        path: 'items.qrCodeId',
        select: 'articleName articleDetails images'
      });

    if (!shipment) {
      return res.status(404).json({
        result: false,
        message: 'Shipment not found'
      });
    }

    // Enhance shipment with article images
    const shipmentObj = shipment.toObject();
    
    // Get article images for each item
    for (let item of shipmentObj.items) {
      if (item.articleName) {
        try {
          const product = await Product.findOne({
            'variants.articles.name': { $regex: new RegExp(item.articleName, 'i') }
          });
          
          if (product) {
            const variant = product.variants.find(v => 
              v.articles.some(a => a.name.toLowerCase().includes(item.articleName.toLowerCase()))
            );
            if (variant) {
              const article = variant.articles.find(a => 
                a.name.toLowerCase().includes(item.articleName.toLowerCase())
              );
              if (article && article.images.length > 0) {
                item.articleImage = `${baseURL}/uploads/${article.images[0]}`;
              }
            }
          }
        } catch (error) {
          console.log('Error fetching article image:', error);
        }
      }
    }

    res.status(200).json({
      result: true,
      message: 'Shipment details retrieved successfully',
      data: shipmentObj
    });

  } catch (error) {
    console.error('Error fetching shipment details:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to fetch shipment details',
      error: error.message
    });
  }
};


const getAllShipments = async (req, res) => {
  try {
    const { status, distributorId } = req.query;
    
    let query = {};
    if (status) query.status = status;
    if (distributorId) query.distributorId = distributorId;

    const shipments = await Shipment.find(query)
      .populate('distributorId', 'name phoneNo email')
      .populate('shippedBy', 'name phoneNo')
      .sort({ shippedAt: -1 });

    res.status(200).json({
      result: true,
      message: 'Shipments retrieved successfully',
      data: {
        shipments,
        totalCount: shipments.length
      }
    });

  } catch (error) {
    console.error('Error fetching shipments:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to fetch shipments',
      error: error.message
    });
  }
};


// Get All Users by Role
const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    
    const validRoles = ['contractor', 'warehouse_inspector', 'shipment_manager', 'distributor'];
    if (!validRoles.includes(role)) {
      return res.status(statusCodes.badRequest).json({
        result: false,
        message: "Invalid role specified"
      });
    }

    const users = await userModel.find({ 
      role,
      isActive: true 
    }).select('-password -refreshToken').sort({ createdAt: -1 });

    // Format response based on role
    const formattedUsers = users.map(user => {
      let userData = {
        _id: user._id,
        phoneNo: user.phoneNo,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt
      };

      switch (role) {
        case 'contractor':
          userData.fullName = user.contractorDetails?.fullName;
          userData.totalItemsProduced = user.contractorDetails?.totalItemsProduced || 0;
          break;
        case 'warehouse_inspector':
          userData.fullName = user.warehouseInspectorDetails?.fullName;
          userData.totalItemsInspected = user.warehouseInspectorDetails?.totalItemsInspected || 0;
          userData.itemsProcessedToday = user.warehouseInspectorDetails?.itemsProcessedToday || 0;
          break;
        case 'shipment_manager':
          userData.fullName = user.shipmentManagerDetails?.fullName;
          userData.totalShipmentsHandled = user.shipmentManagerDetails?.totalShipmentsHandled || 0;
          break;
        case 'distributor':
          userData.name = user.name;
          userData.partyName = user.distributorDetails?.partyName;
          userData.address = user.distributorDetails?.address;
          break;
      }

      return userData;
    });

    res.status(statusCodes.success).json({
      result: true,
      message: `${role}s retrieved successfully`,
      data: formattedUsers
    });

  } catch (error) {
    console.error('Error getting users by role:', error);
    res.status(statusCodes.serverError).json({
      result: false,
      message: "Failed to retrieve users"
    });
  }
};

// Get All Contractors
const getContractors = async (req, res) => {
  req.params.role = 'contractor';
  return getUsersByRole(req, res);
};

// Get All Warehouse Managers
const getWarehouseManagers = async (req, res) => {
  req.params.role = 'warehouse_inspector';
  return getUsersByRole(req, res);
};

// Get All Shipment Managers  
const getShipmentManagers = async (req, res) => {
  req.params.role = 'shipment_manager';
  return getUsersByRole(req, res);
};

// Update User Stats (used by scanners)
const updateUserStats = async (req, res) => {
  try {
    const { userId, action } = req.body;

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(statusCodes.notFound).json({
        result: false,
        message: "User not found"
      });
    }

    // Use the schema method to update stats
    await user.updateStats(action);

    res.status(statusCodes.success).json({
      result: true,
      message: "User stats updated successfully"
    });

  } catch (error) {
    console.error('Error updating user stats:', error);
    res.status(statusCodes.serverError).json({
      result: false,
      message: "Failed to update user stats"
    });
  }
};

// Delete User (soft delete)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await userModel.findByIdAndUpdate(
      id,
      { $set: { isActive: false } },
      { new: true }
    ).select('-password -refreshToken');

    if (!user) {
      return res.status(statusCodes.notFound).json({
        result: false,
        message: "User not found"
      });
    }

    res.status(statusCodes.success).json({
      result: true,
      message: "User deactivated successfully",
      data: user
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(statusCodes.serverError).json({
      result: false,
      message: "Failed to delete user"
    });
  }
};

// Add to admin.controllers.js
const getInventoryByArticleId = async (req, res) => {
  try {
    const { articleId } = req.params;

    if (!articleId) {
      return res.status(400).json({
        result: false,
        message: 'Article ID is required'
      });
    }

    // Get inventory items filtered by articleId
    const inventories = await Inventory.find({
      'items.articleDetails.articleId': mongoose.Types.ObjectId(articleId)
    })
    .populate('productId', 'segment variants')
    .lean();

    if (!inventories || inventories.length === 0) {
      return res.status(404).json({
        result: false,
        message: 'No inventory found for this article'
      });
    }

    // Filter items to only include those matching the articleId
    const filteredInventories = inventories.map(inventory => ({
      ...inventory,
      items: inventory.items.filter(item => 
        item.articleDetails.articleId && 
        item.articleDetails.articleId.toString() === articleId
      )
    }));

    // Get article details from Product collection
    const articleDetails = await Product.aggregate([
      { $unwind: "$variants" },
      { $unwind: "$variants.articles" },
      { $match: { "variants.articles._id": mongoose.Types.ObjectId(articleId) } },
      {
        $project: {
          articleId: "$variants.articles._id",
          articleName: "$variants.articles.name",
          colors: "$variants.articles.colors",
          sizes: "$variants.articles.sizes",
          variantName: "$variants.name",
          segment: "$segment"
        }
      },
      { $limit: 1 }
    ]);

    // Calculate totals for this specific article
    const allItems = filteredInventories.flatMap(inv => inv.items);
    const totalReceived = allItems.filter(item => item.status === 'received').length;
    const totalShipped = allItems.filter(item => item.status === 'shipped').length;

    res.status(200).json({
      result: true,
      message: 'Article inventory retrieved successfully',
      data: {
        articleDetails: articleDetails[0] || null,
        inventories: filteredInventories,
        summary: {
          totalReceived,
          totalShipped,
          availableQuantity: totalReceived,
          totalItems: allItems.length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching inventory by article ID:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to fetch inventory',
      error: error.message
    });
  }
};


export {register, login, getAdmin, addDistributor, deleteDistributor, getDistributors, updateDistributor, generateOrderPerforma, addFestivleImage, getFestivleImages, generateQRCodes, downloadQRCodes, scanQRCode, getQRStatistics, getInventoryData, getSingleProductInventory, getAllInventory, addContractor, addWarehouseManager, addShipmentManager,
getContractors,
  getWarehouseManagers,
  getShipmentManagers,
  updateUserStats,
  deleteUser,
  getUsersByRole,
  generateReceiptPdf,
  generateShipmentReceiptPDF,
  getInventoryStats,
  createOrUpdateShipment,
  getShipmentDetails,
  getAllShipments,
  generateShipmentReceipt,
  getInventoryByArticleId}