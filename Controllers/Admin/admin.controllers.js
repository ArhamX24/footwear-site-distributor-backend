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
    const { articleId, articleName, variant, numberOfQRs, purpose = 'inventory' } = req.body;
    const userId = req.user?.id;

    // Validate input
    if (!articleId || !articleName || !numberOfQRs) {
      return res.status(400).json({
        result: false,
        message: "Article ID, article name and number of QR codes are required"
      });
    }

    if (numberOfQRs < 1 || numberOfQRs > 1000) {
      return res.status(400).json({
        result: false,
        message: "Number of QR codes must be between 1 and 1000"
      });
    }

    // Find product containing the article by articleId
    const product = await Product.findOne({
      'variants.articles._id': articleId
    });

    if (!product) {
      return res.status(404).json({
        result: false,
        message: "Product containing the specified article not found"
      });
    }

    // Find the article and variant in the product
    let foundArticle = null;
    let variantName = null;

    for (const v of product.variants) {
      const art = v.articles.find(a => a._id.toString() === articleId.toString());
      if (art) {
        foundArticle = art;
        variantName = v.name;
        break;
      }
    }

    if (!foundArticle) {
      return res.status(404).json({
        result: false,
        message: "Article not found in product"
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
        productName: articleName,
        variant: variantName,
        uniqueId,
        batchId,
        generatedAt: new Date().toISOString(),
        serialNumber: i + 1,
        purpose,
        verifyUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify/${uniqueId}`
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
      const fileName = `QR_${articleName.replace(/[^a-zA-Z0-9]/g, '_')}_${String(i + 1).padStart(4, '0')}_${uniqueId.slice(0, 8)}.png`;
      const filePath = path.join(tempDir, fileName);
      const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');

      fs.writeFileSync(filePath, base64Data, 'base64');

      // Save QR code document in DB
      let qrDoc = new QRCode({
        uniqueId,
        productId: product._id,
        variantName,
        articleName,
        qrData: qrString,
        qrImagePath: filePath,
        status: 'active',
      });

      await qrDoc.save();

      qrCodes.push({
        uniqueId,
        qrCodeImage: qrCodeDataURL,
        fileName,
        filePath,
        qrData: qrDataObj,
        serialNumber: i + 1
      });
    }

    // Update article's QR tracking stats
    await Product.findOneAndUpdate(
      { _id: product._id, 'variants.articles._id': articleId },
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
          { 'variant.articles._id': articleId },
          { 'article._id': articleId }
        ]
      }
    );

    res.status(200).json({
      result: true,
      message: `Successfully generated ${numberOfQRs} QR codes`,
      qrCodes,
      batchId,
      batchDetails: {
        batchId,
        articleName,
        variantName,
        numberOfQRs,
        generatedAt: new Date()
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
        // If no file exists, add image from base64 string
        const base64Data = qr.qrCodeImage.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        archive.append(buffer, { name: qr.fileName });
      }
    });

    // Add informational text file
    const infoContent = `QR Code Batch Information
========================
Batch ID: ${batchId || 'N/A'}
Total QR Codes: ${qrCodes.length}
Generated On: ${new Date().toISOString()}

QR Code Details:
================
${qrCodes.map((qr, idx) => {
  let verifyUrl = 'N/A';
  try {
    verifyUrl = JSON.parse(qr.qrData)?.verifyUrl || 'N/A';
  } catch { }
  return `QR Code #${qr.serialNumber || idx + 1}:
  File: ${qr.fileName}
  Unique ID: ${qr.uniqueId || 'N/A'}
  Verify URL: ${verifyUrl}
${'='.repeat(50)}`;
}).join('\n\n')}

Instructions:
=============
1. Each QR code contains unique product information.
2. Scan QR codes using any QR scanner or camera.
3. Each scan is tracked.
4. Use the Unique ID for manual verification.
`;

    archive.append(infoContent, { name: 'QR_Batch_Information.txt' });

    // Add CSV file for easy import
    const csvLines = [
      'Serial Number,Unique ID,File Name,Product Name,Variant,Generated At',
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
          `"${data.generatedAt || ''}"`
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
      notes
    } = req.body;

    const qrCode = await QRCode.findOne({ uniqueId }).populate('productId');

    if (!qrCode) {
      return res.status(404).json({ 
        result: false, 
        message: "QR code not found or invalid QR" 
      });
    }

    const scans = qrCode.scans || [];

    // Prevent double receive or ship without correct ordering
    if (event === 'received') {
      const receivedBefore = scans.some(s => s.event === 'received');
      if (receivedBefore) {
        return res.status(400).json({
          result: false,
          message: "This QR code has already been received"
        });
      }
    }

    if (event === 'shipped') {
      const receivedBefore = scans.some(s => s.event === 'received');
      const shippedBefore = scans.some(s => s.event === 'shipped');

      if (!receivedBefore) {
        return res.status(400).json({
          result: false,
          message: "Cannot ship a product that has not been received."
        });
      }
      if (shippedBefore) {
        return res.status(400).json({
          result: false,
          message: "This QR code has already been shipped"
        });
      }
    }

    const scanRecord = {
      scannedAt: new Date(),
      scannedBy: {
        userId: scannedBy?.userId || 'anonymous',
        userType: scannedBy?.userType || 'customer'
      },
      location,
      device: { userAgent, ipAddress },
      event,
      notes
    };

    qrCode.scans.push(scanRecord);
    qrCode.totalScans += 1;
    if (!qrCode.firstScannedAt) qrCode.firstScannedAt = new Date();
    qrCode.lastScannedAt = new Date();
    if (qrCode.totalScans === 1) qrCode.status = 'scanned';

    // Handle inventory operations
    if (event === 'received') {
      // Get article details from the product
      const product = qrCode.productId;
      let articleDetails = null;
      
      // Find the specific article details
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

      // Add to inventory
      let inventory = await Inventory.findOne({ productId: qrCode.productId });
      
      if (!inventory) {
        inventory = new Inventory({
          productId: qrCode.productId,
          items: []
        });
      }

      // Add the new item to inventory
      inventory.items.push({
        qrCodeId: qrCode._id,
        uniqueId: qrCode.uniqueId,
        articleName: qrCode.articleName,
        articleDetails: articleDetails,
        receivedAt: new Date(),
        receivedBy: {
          userId: scannedBy?.userId,
          userType: scannedBy?.userType
        },
        receivedLocation: location,
        status: 'received',
        notes
      });

      await inventory.save();

      // Update Product scannedHistory
      await Product.findOneAndUpdate(
        { _id: qrCode.productId, 'variants.articles.name': qrCode.articleName },
        {
          $push: {
            'variants.$[variant].articles.$[article].scannedHistory': {
              qrCodeId: qrCode._id,
              scannedAt: new Date(),
              scannedBy: scannedBy?.userId,
              event,
              location: location?.address,
              notes
            }
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
        message: "QR code received and added to inventory successfully",
        data: {
          qrCode: {
            uniqueId: qrCode.uniqueId,
            status: qrCode.status,
            totalScans: qrCode.totalScans,
            firstScannedAt: qrCode.firstScannedAt,
            lastScannedAt: qrCode.lastScannedAt
          },
          inventory: {
            totalQuantity: inventory.totalQuantity,
            availableQuantity: inventory.availableQuantity
          },
          scanDetails: scanRecord
        }
      });
    }

    if (event === 'shipped') {
      // Find and remove the specific item from inventory
      const inventory = await Inventory.findOne({ productId: qrCode.productId });
      
      if (!inventory) {
        return res.status(400).json({
          result: false,
          message: "No inventory found for this product."
        });
      }

      const itemIndex = inventory.items.findIndex(item => 
        item.qrCodeId.toString() === qrCode._id.toString()
      );

      if (itemIndex === -1) {
        return res.status(400).json({
          result: false,
          message: "Item not found in inventory. Cannot ship."
        });
      }

      // Remove the specific item from inventory
      inventory.items.splice(itemIndex, 1);
      await inventory.save();

      // Remove scannedHistory entry for this qrCode from Product articles
      await Product.findOneAndUpdate(
        { _id: qrCode.productId },
        {
          $pull: {
            'variants.$[].articles.$[].scannedHistory': { qrCodeId: qrCode._id }
          }
        }
      );

      // Delete the QRCode document itself
      await QRCode.deleteOne({ _id: qrCode._id });

      return res.status(200).json({
        result: true,
        message: "QR code scanned and shipped successfully",
        data: {
          inventory: {
            totalQuantity: inventory.totalQuantity,
            availableQuantity: inventory.availableQuantity
          },
          shippedItem: {
            uniqueId: qrCode.uniqueId,
            articleName: qrCode.articleName
          }
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

    // Get inventory for product
    const inventory = await Inventory.findOne({ productId });

    // Get full product data
    const product = await Product.findById(productId).lean();
    if (!product) {
      return res.status(404).json({
        result: false,
        message: 'Product not found'
      });
    }

    return res.status(200).json({
      result: true,
      message: 'Inventory and product data retrieved',
      data: {
        inventoryCount: inventory ? inventory.quantity : 0,
        product
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

    // Get inventory for the specific product
    const inventory = await Inventory.findOne({ productId });

    // Get full product data
    const product = await Product.findById(productId).lean();
    
    if (!product) {
      return res.status(404).json({
        result: false,
        message: 'Product not found'
      });
    }

    return res.status(200).json({
      result: true,
      message: 'Product inventory data retrieved successfully',
      data: {
        inventoryCount: inventory ? inventory.quantity : 0,
        product: product,
        lastUpdated: inventory ? inventory.updatedAt : null
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


const getQRStatistics = async (req, res) => {
  try {
    const { productId, articleName } = req.query;

    let matchFilter = {};
    if (productId) matchFilter.productId = mongoose.Types.ObjectId(productId);
    if (articleName) matchFilter.articleName = articleName;

    // Get overall statistics
    const stats = await QRBatch.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalBatches: { $sum: 1 },
          totalQRs: { $sum: '$numberOfQRs' },
          totalScans: { $sum: '$stats.totalScans' },
          activeQRs: { $sum: '$stats.activeQRs' },
          scannedQRs: { $sum: '$stats.scannedQRs' }
        }
      }
    ]);

    // Get recent batches
    const recentBatches = await QRBatch.find(matchFilter)
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('productId', 'segment')
      .populate('generatedBy', 'name email');

    // Get scanning trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const scanTrends = await QRCodeModel.aggregate([
      {
        $match: {
          ...matchFilter,
          'scans.scannedAt': { $gte: thirtyDaysAgo }
        }
      },
      { $unwind: '$scans' },
      {
        $match: {
          'scans.scannedAt': { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$scans.scannedAt'
            }
          },
          scans: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({
      result: true,
      data: {
        overview: stats[0] || {
          totalBatches: 0,
          totalQRs: 0,
          totalScans: 0,
          activeQRs: 0,
          scannedQRs: 0
        },
        recentBatches,
        scanTrends
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


export {register, login, getAdmin, addDistributor, deleteDistributor, getDistributors, updateDistributor, generateOrderPerforma, addFestivleImage, getFestivleImages, generateQRCodes, downloadQRCodes, scanQRCode, getQRStatistics, getInventoryData, getSingleProductInventory}