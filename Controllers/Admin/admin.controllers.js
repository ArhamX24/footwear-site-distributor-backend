import AdminModel from "../../Models/Admin.model.js";
import zod from "zod"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import userModel from "../../Models/user.model.js";
import purchaseProductModel from "../../Models/Purchasedproduct.model.js";
import finalOrderPerforma from "../../Utils/finalOrderPerforma.js";
import Festive from "../../Models/Festivle.model.js";
import { uploadOnImgBB } from "../../Utils/imgbb.js";
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
import stream from "stream"
import { promisify } from "util";
import QRTracker from "../../Models/QRTracker.model.js";
import ExcelJS from 'exceljs';
import { Parser } from 'json2csv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pipeline = promisify(stream.pipeline);

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
    sameSite: 'none'
  }




// ✅ Helper function to format sizes as range (add this at the top of your file)
const formatSizeRange = (sizes) => {
  if (!sizes) return 'N/A';
  
  // Handle different input formats
  let sizesArray = [];
  if (Array.isArray(sizes)) {
    sizesArray = sizes.map(s => parseInt(s)).filter(s => !isNaN(s));
  } else if (typeof sizes === 'string') {
    sizesArray = sizes.split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
  } else if (typeof sizes === 'number') {
    sizesArray = [sizes];
  }
  
  if (sizesArray.length === 0) return 'N/A';
  if (sizesArray.length === 1) return sizesArray[0].toString();
  
  const sortedSizes = [...sizesArray].sort((a, b) => a - b);
  return `${sortedSizes[0]}X${sortedSizes[sortedSizes.length - 1]}`;
};



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


    res.cookie("accessToken", accessToken, cookieOption);
    res.cookie("refreshToken", refreshToken, cookieOption);

    res.status(statusCodes.success).json({
      result: true,
      message: "Admin registered and logged in successfully",
      data: {
        admin: adminResponse,
        redirectTo: '/admin/dashboard'
      }
    });

  } catch (error) {
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
        result: false,
        message: 'Please Upload an Image'
      });
    }

    // ✅ Upload single image to ImgBB
    let uploadResult;
    try {
      uploadResult = await uploadOnImgBB(req.file.path);
    } catch (uploadError) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Image Failed to Upload. Please Try Again Later'
      });
    }

    if (!uploadResult?.secure_url) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Image upload failed'
      });
    }

    await Festive.create({
      startDate,
      endDate,
      image: uploadResult.secure_url // ✅ ImgBB URL
    });

    return res.status(statusCodes.success).send({
      result: true,
      message: 'Festival Image Uploaded Successfully',
      imageUrl: uploadResult.secure_url
    });

  } catch (error) {
    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error in Adding Festival Image. Please Try Again Later',
      error: error.message
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
        // ✅ DON'T exclude password - we need plainPassword field
        const distributors = await userModel.find({ 
            role: 'distributor',
            isActive: true 
        })
        .select('-refreshToken') // Only exclude refreshToken, keep plainPassword
        .sort({ createdAt: -1 });

        const formattedDistributors = distributors.map(distributor => ({
            _id: distributor._id,
            name: distributor.name,
            phoneNo: distributor.phoneNo,
            // ✅ Include plainPassword for card list (optional)
            password: distributor.plainPassword, // This is the plain text password
            role: distributor.role,
            salesmanName: distributor.distributorDetails?.salesmanName,
            partyName: distributor.distributorDetails?.partyName,
            transport: distributor.distributorDetails?.transport,
            city: distributor.distributorDetails?.city,
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
            message: "Failed to retrieve distributors",
            error: error.message
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



const getContractorMonthlyReport = async (req, res) => {
  try {
    const { contractorId, year, month } = req.query;

    if (!contractorId || !year || !month) {
      return res.status(400).json({
        result: false,
        message: 'Missing contractorId, year, or month'
      });
    }

    const report = await QRTracker.getMonthlyReport(
      contractorId,
      parseInt(year),
      parseInt(month)
    );

    res.status(200).json({
      result: true,
      message: 'Monthly report fetched',
      data: report
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to fetch report',
      error: error.message
    });
  }
};


const downloadContractorMonthlyReport = async (req, res) => {
  try {
    const { contractorId } = req.params;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const report = await QRTracker.getMonthlyReport(contractorId, year, month);

    if (!report || report.length === 0) {
      return res.status(404).json({
        result: false,
        message: 'No QR generation data found for this month'
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('QR Generation Report');

    // ✅ UPDATED: Add 3 new columns
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Article Name', key: 'articleName', width: 20 },
      { header: 'Segment', key: 'segment', width: 12 },
      { header: 'QR Generated', key: 'qrGeneratedCount', width: 12 },
      { header: 'Bharra', key: 'bharra', width: 12 },
      { header: 'Printing', key: 'printing', width: 12 },
      { header: 'Packing', key: 'packing', width: 12 }
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'center' };

    // Add data rows
    let totalQRs = 0;
    report.forEach((item) => {
      worksheet.addRow({
        date: new Date(item.date).toLocaleDateString('en-IN'),
        articleName: item.articleName,
        segment: item.segment || 'N/A',
        qrGeneratedCount: item.qrGeneratedCount,
        bharra: item.bharra || 'N/A',
        printing: item.printing || 'N/A',
        packing: item.packing || 'N/A'
      });
      totalQRs += item.qrGeneratedCount;
    });

    // Add total row
    const totalRow = worksheet.addRow({
      date: 'TOTAL',
      articleName: '',
      segment: '',
      qrGeneratedCount: totalQRs,
      bharra: '',
      printing: '',
      packing: ''
    });
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="QR-Report-${year}-${month.toString().padStart(2, '0')}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating Excel:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
};
;


const getAllContractorsMonthlyReport = async (req, res) => {
  try {
    const report = await QRTracker.getCurrentMonthReport();

    res.status(200).json({
      result: true,
      message: 'All contractors monthly report fetched',
      data: report
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to fetch all contractors report',
      error: error.message
    });
  }
};


const downloadAllContractorsReport = async (req, res) => {
  try {
    const report = await QRTracker.getCurrentMonthReport();

    if (!report || report.length === 0) {
      return res.status(404).json({
        result: false,
        message: 'No QR generation data found for this month'
      });
    }

    const workbook = new ExcelJS.Workbook();

    report.forEach((contractorData) => {
      const worksheet = workbook.addWorksheet(
        contractorData.contractorName.substring(0, 31)
      );

      // ✅ UPDATED: Add 3 new columns
      worksheet.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Article Name', key: 'articleName', width: 20 },
        { header: 'Segment', key: 'segment', width: 12 },
        { header: 'QR Generated', key: 'qrGeneratedCount', width: 12 },
        { header: 'Bharra', key: 'bharra', width: 12 },
        { header: 'Printing', key: 'printing', width: 12 },
        { header: 'Packing', key: 'packing', width: 12 }
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } };
      headerRow.alignment = { horizontal: 'center', vertical: 'center' };

      // Add contractor info
      const infoRow = worksheet.addRow({});
      worksheet.mergeCells(`A${infoRow.number}:G${infoRow.number}`);
      infoRow.getCell('A').value = `Contractor: ${contractorData.contractorName}`;
      infoRow.font = { bold: true, size: 12 };
      infoRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };

      // Add data rows
      contractorData.records.forEach((record) => {
        worksheet.addRow({
          date: new Date(record.date).toLocaleDateString('en-IN'),
          articleName: record.articleName,
          segment: record.segment || 'N/A',
          qrGeneratedCount: record.qrGeneratedCount,
          bharra: record.bharra || 'N/A',
          printing: record.printing || 'N/A',
          packing: record.packing || 'N/A'
        });
      });

      // Add total row
      const totalRow = worksheet.addRow({
        date: 'TOTAL',
        articleName: '',
        segment: '',
        qrGeneratedCount: contractorData.totalQRs,
        bharra: '',
        printing: '',
        packing: ''
      });
      totalRow.font = { bold: true };
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };

      worksheet.addRow({});
    });

    const now = new Date();
    const fileName = `QR-Report-All-${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating Excel:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
};


const scanQRCode = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const { event, notes, qualityCheck, distributorDetails, trackingNumber } = req.body;
    

    
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        result: false,
        message: "User authentication required"
      });
    }

    // ✅ Find QR by uniqueId or MongoDB _id
    let qrCode = await QRCode.findOne({ uniqueId });
    
    if (!qrCode && mongoose.Types.ObjectId.isValid(uniqueId)) {
      qrCode = await QRCode.findById(uniqueId);
    }

    if (!qrCode) {

      return res.status(404).json({
        result: false,
        message: `QR code not found: ${uniqueId}`
      });
    }



    const articleId = qrCode.contractorInput?.articleId || 
                     qrCode.productReference?.articleId?.toString() || null;
    const articleName = qrCode.contractorInput?.articleName || 
                       qrCode.articleName || null;


    if (!articleId || !articleName) {
      return res.status(400).json({
        result: false,
        message: "QR code missing article information"
      });
    }

    const allowedEvents = new Set(['received', 'shipped']);
    if (!allowedEvents.has(event)) {
      return res.status(400).json({
        result: false,
        message: "Invalid event. Only 'received' and 'shipped' allowed"
      });
    }

    // Get product info
    const productId = qrCode.productReference?.productId;
    let segment = 'Unknown';
    let variantName = 'Unknown';
    let articleImage = null;

    if (productId && articleId) {
      try {
        const objectId = mongoose.Types.ObjectId.isValid(articleId) 
          ? new mongoose.Types.ObjectId(articleId) 
          : articleId;

        const productData = await Product.aggregate([
          { $match: { _id: productId } },
          { $unwind: '$variants' },
          { $unwind: '$variants.articles' },
          { $match: { 'variants.articles._id': objectId } },
          {
            $project: {
              segment: '$segment',
              variantName: '$variants.name',
              articleImage: '$variants.articles.image'
            }
          },
          { $limit: 1 }
        ]);

        if (productData && productData.length > 0) {
          segment = productData[0].segment || 'Unknown';
          variantName = productData[0].variantName || 'Unknown';
          articleImage = productData[0].articleImage || null;
          

        }
      } catch (err) {

      }
    }

    // ========== EVENT: RECEIVED (Warehouse Scan) ==========
    if (event === 'received') {


      if (qrCode.status === 'received') {

        return res.status(400).json({
          result: false,
          message: "This QR has already been received"
        });
      }

      // Find or create inventory
      let inventory = await Inventory.findOne({ articleId: articleId.toString() });

      if (!inventory) {

        inventory = new Inventory({
          articleId: articleId.toString(),
          articleName,
          segment,
          articleImage,
          receivedQuantity: 0,
          shippedQuantity: 0,
          availableQuantity: 0,
          qrCodes: []
        });
      } else {

      }


      
      qrCode.scans.push({
        scannedAt: new Date(),
        scannedBy: req.user.id,
        event,
        notes: notes || '',
        location: 'Main Warehouse',
        qualityCheck: qualityCheck || { passed: true }
      });

      qrCode.totalScans = (qrCode.totalScans || 0) + 1;
      if (!qrCode.firstScannedAt) qrCode.firstScannedAt = new Date();
      qrCode.lastScannedAt = new Date();
      qrCode.status = 'received';

      qrCode.warehouseDetails = {
        receivedAt: new Date(),
        receivedBy: {
          userId: req.user.id,
          userType: 'warehouse_inspector',
          name: req.user.name || 'Warehouse Inspector'
        },
        conditionOnReceipt: qualityCheck?.passed ? 'good' : 'damaged',
        location: 'Main Warehouse',
        notes: notes || ''
      };

      await qrCode.save();

      await inventory.syncWithQRCode(qrCode._id);
      

      return res.status(200).json({
        result: true,
        message: "Warehouse receipt scan completed",
        data: {
          qrCode: {
            uniqueId: qrCode.uniqueId,
            articleName: qrCode.articleName,
            status: qrCode.status
          },
          inventory: {
            articleId: inventory.articleId,
            articleName: inventory.articleName,
            receivedQuantity: inventory.receivedQuantity,
            availableQuantity: inventory.availableQuantity
          }
        }
      });
    }

    // ========== EVENT: SHIPPED (Shipment Scan) ==========
    if (event === 'shipped') {

      if (qrCode.status === 'shipped') {

        return res.status(400).json({
          result: false,
          message: "This QR has already been shipped"
        });
      }

      if (qrCode.status !== 'received') {

        return res.status(400).json({
          result: false,
          message: "QR must be received at warehouse before shipping"
        });
      }

      if (!distributorDetails || !distributorDetails.distributorId) {
        return res.status(400).json({
          result: false,
          message: "Distributor details required"
        });
      }

      // Get distributor
      const distributor = await userModel.findById(distributorDetails.distributorId);
      
      if (!distributor) {
        return res.status(404).json({
          result: false,
          message: "Distributor not found"
        });
      }


      
      qrCode.scans.push({
        scannedAt: new Date(),
        scannedBy: req.user.id,
        event,
        notes: notes || '',
        location: 'Shipping Dock',
        distributorId: distributorDetails.distributorId
      });

      qrCode.totalScans = (qrCode.totalScans || 0) + 1;
      qrCode.lastScannedAt = new Date();
      qrCode.status = 'shipped';  // ✅ Change status FIRST

      await qrCode.save();

      
      let shipment = await Shipment.findOne({
        distributorId: distributor._id,
        status: { $in: ['pending', 'in_transit'] }
      });

      const shipmentItemData = {
        qrCodeId: qrCode._id,
        uniqueId: qrCode.uniqueId,
        articleName: qrCode.articleName || articleName,
        articleImage: articleImage,
        articleDetails: {
          colors: qrCode.contractorInput?.colors || [],
          sizes: qrCode.contractorInput?.sizes || [],
          cartonNumber: qrCode.contractorInput?.cartonNumber || 0,
          totalCartons: qrCode.contractorInput?.totalCartons || 0
        },
        productReference: {
          productId: productId,
          variantId: qrCode.productReference?.variantId,
          articleId: articleId,
          segment: segment,
          variantName: variantName
        },
        scannedAt: new Date()
      };

      if (!shipment) {
        const shipmentId = `SHIP_${Date.now()}_${distributor._id.toString().slice(-6)}`;
        
        shipment = new Shipment({
          shipmentId: shipmentId,
          distributorId: distributor._id,
          distributorName: distributor.distributorDetails?.partyName || distributor.name,
          distributorPhoneNo: distributor.phoneNo,
          distributorCity: distributor.distributorDetails?.cityName || distributor.distributorDetails?.city,
          distributorTransport: distributor.distributorDetails?.transport,
          distributorPartyName: distributor.distributorDetails?.partyName,
          items: [shipmentItemData],
          shippedBy: {
            userId: req.user.id,
            userType: 'shipment_manager',
            name: req.user.name || 'Shipment Manager',
            phoneNo: req.user.phoneNo
          },
          shippedAt: new Date(),
          totalCartons: 1,
          status: 'in_transit',
          trackingNumber: trackingNumber || `TRACK_${Date.now()}`,
          notes: notes || `Shipment to ${distributor.distributorDetails?.partyName || distributor.name}`
        });


      } else {
        shipment.items.push(shipmentItemData);
        shipment.totalCartons = shipment.items.length;
        shipment.notes = `${shipment.notes || ''} | Added ${articleName}`.trim();

      }

      await shipment.save();
   
      
      qrCode.shipmentDetails = {
        shippedAt: new Date(),
        shippedBy: {
          userId: req.user.id,
          userType: 'shipment_manager',
          name: req.user.name || 'Shipment Manager'
        },
        distributorId: distributor._id,
        distributorName: distributor.distributorDetails?.partyName || distributor.name,
        shipmentId: shipment._id,
        trackingNumber: shipment.trackingNumber,
        notes: notes || ''
      };

      await qrCode.save();
  
      
      const inventory = await Inventory.findOne({ articleId: articleId.toString() });
      
      if (inventory) {

        
        // Since QR status is already "shipped", this will only deduct
        await inventory.syncWithQRCode(qrCode._id);

      } else {
        console.log('[SHIPPED] ⚠️ No inventory found for article');
      }



      return res.status(200).json({
        result: true,
        message: "Shipment scan completed",
        data: {
          qrCode: {
            uniqueId: qrCode.uniqueId,
            articleName: qrCode.articleName,
            status: qrCode.status,
            articleDetails: {
              colors: qrCode.contractorInput?.colors || [],
              sizes: qrCode.contractorInput?.sizes || []
            }
          },
          shipment: {
            shipmentId: shipment.shipmentId,
            distributorName: distributor.distributorDetails?.partyName || distributor.name,
            trackingNumber: shipment.trackingNumber,
            totalCartons: shipment.totalCartons,
            shippedAt: shipment.shippedAt
          }
        }
      });
    }

  } catch (error) {
    res.status(500).json({
      result: false,
      message: "Scan failed",
      error: error.message
    });
  }
};



const updateInventoryFromQRScan = async (qrCode, user, qualityCheck = null, notes = '') => {
    const productId = qrCode.productReference?.productId;
    
    if (!productId) {
        throw new Error('QR code not linked to a product');
    }

    let inventory = await Inventory.findOne({ productId });

    if (!inventory) {
        inventory = new Inventory({
            productId,
            items: [],
            quantityByStage: { received: 0, shipped: 0 },
            availableQuantity: 0
        });
    }

    // Sync this specific QR code with inventory
    await inventory.syncWithQRCode(qrCode._id);

    return inventory;
};


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
    throw error;
  }
};

const getInventoryData = async (req, res) => {
  try {
    const { productId } = req.params;
    
    let query = {};
    if (productId && productId !== 'all') {
      query.productId = productId;  // ✅ Now matches schema
    }

    const inventories = await Inventory.find(query)
      // ✅ FIXED: Safe population with strictPopulate: false
      .populate({
        path: 'productId',
        select: 'segment variants',
        strictPopulate: false  // ✅ Allows missing fields
      })
      .populate('items.manufacturedBy', 'name phoneNo')
      .populate('items.receivedBy', 'name phoneNo') 
      .populate('items.shippedBy', 'name phoneNo')
      .populate('items.distributorId', 'name phoneNo distributorDetails')
      .sort({ lastUpdated: -1 });

    // ✅ SAFE data formatting (handle missing productId)
    const inventoryData = inventories.map(inventory => ({
      productId: inventory.productId?._id || null,
      product: inventory.productId || null,
      summary: {
        totalQuantity: inventory.totalQuantity || 0,
        availableQuantity: inventory.availableQuantity || 0,
        stages: inventory.quantityByStage || {}
      },
      items: inventory.items?.map(item => ({
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
          manufacturedBy: item.manufacturedBy || null,
          receivedBy: item.receivedBy || null,
          shippedBy: item.shippedBy || null
        },
        distributor: item.distributorId || null,
        notes: item.notes
      })) || [],
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
    console.error('❌ Inventory fetch error:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to fetch inventory data',
      error: error.message
    });
  }
};


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

const generateShipmentReceipt = async (req, res) => {
  try {
    const { shipmentId, distributorName, distributorPhoneNo, totalCartons, shippedAt, items } = req.body;


    if (!shipmentId || !items || items.length === 0) {
      return res.status(400).json({
        result: false,
        message: 'Shipment ID and items are required'
      });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({
      size: 'A4',
      margin: 30,
      bufferPages: true
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Shipment_${shipmentId}_Receipt.pdf"`);

    // Pipe to response
    doc.pipe(res);

    // ========== HEADER SECTION ==========
    doc.fontSize(20).font('Helvetica-Bold').text('SHIPMENT RECEIPT', { align: 'center' });
    doc.fontSize(9).font('Helvetica').text('Official Shipment Document', { align: 'center' });
    doc.moveTo(30, doc.y + 3).lineTo(565, doc.y + 3).stroke();
    doc.moveDown(0.5);

    // ========== SHIPMENT & DISTRIBUTOR INFO ==========
    const infoStartY = doc.y;
    
    // LEFT COLUMN - Shipment Details
    doc.fontSize(10).font('Helvetica-Bold').text('SHIPMENT INFO', 30, infoStartY, { underline: true });
    doc.fontSize(8).font('Helvetica');
    
    let leftY = infoStartY + 15;
    doc.text(`Shipment ID: ${shipmentId}`, 30, leftY);
    leftY += 12;
    doc.text(`Status: IN TRANSIT`, 30, leftY);
    leftY += 12;
    doc.text(`Shipped: ${new Date(shippedAt).toLocaleDateString('en-GB')}`, 30, leftY);
    leftY += 12;
    doc.text(`Total Cartons: ${totalCartons}`, 30, leftY);

    // RIGHT COLUMN - Distributor Details
    doc.fontSize(10).font('Helvetica-Bold').text('DISTRIBUTOR INFO', 320, infoStartY, { underline: true });
    doc.fontSize(8).font('Helvetica');
    
    let rightY = infoStartY + 15;
    doc.text(`Name: ${distributorName || 'Unknown'}`, 320, rightY);
    rightY += 12;
    doc.text(`Contact: ${distributorPhoneNo || 'N/A'}`, 320, rightY);

    // Set Y position after both columns
    doc.y = Math.max(leftY, rightY) + 10;
    doc.moveTo(30, doc.y).lineTo(565, doc.y).stroke();
    doc.moveDown(0.5);

    // ========== ARTICLE DETAILS TABLE ==========
    doc.fontSize(10).font('Helvetica-Bold').text('ARTICLE DETAILS', { align: 'center', underline: true });
    doc.moveDown(0.5);

    // Table Header
    const tableTop = doc.y;
    const col1X = 30;   // Article Name
    const col2X = 150;  // Colors
    const col3X = 280;  // Sizes
    const col4X = 360;  // Carton
    const col5X = 440;  // Unique ID
    const rowHeight = 20;

    // Header Background
    doc.rect(col1X - 5, tableTop, 540, rowHeight).fill('#e8e8e8');
    doc.fill('#000000');

    doc.fontSize(7).font('Helvetica-Bold');
    doc.text('Article', col1X, tableTop + 6, { width: 110, lineBreak: false });
    doc.text('Colors', col2X, tableTop + 6, { width: 120, lineBreak: false });
    doc.text('Sizes', col3X, tableTop + 6, { width: 70, lineBreak: false });
    doc.text('Carton', col4X, tableTop + 6, { width: 70, lineBreak: false });
    doc.text('Unique ID', col5X, tableTop + 6, { width: 120, lineBreak: false });

    let currentY = tableTop + rowHeight;
    doc.font('Helvetica').fontSize(7);

    // Table Rows
    items.forEach((item, index) => {
      const rowY = currentY;

      // Alternate row colors
      if (index % 2 === 0) {
        doc.rect(col1X - 5, rowY, 540, rowHeight).fill('#ffffff');
      } else {
        doc.rect(col1X - 5, rowY, 540, rowHeight).fill('#f5f5f5');
      }
      doc.fill('#000000');

      // Article Name
      const articleName = String(item.articleName || 'N/A');
      doc.text(articleName, col1X, rowY + 6, { width: 110, lineBreak: false });

      // Colors
      let colors = 'N/A';
      if (item.colors && Array.isArray(item.colors)) {
        colors = item.colors.join(', ');
      } else if (item.colors && typeof item.colors === 'string') {
        colors = item.colors;
      } else if (item.articleDetails?.colors) {
        colors = Array.isArray(item.articleDetails.colors) 
          ? item.articleDetails.colors.join(', ') 
          : item.articleDetails.colors;
      }
      doc.text(colors, col2X, rowY + 6, { width: 120, lineBreak: false });

      // Sizes - Format as range
      let sizes = 'N/A';
      if (item.sizesFormatted) {
        sizes = item.sizesFormatted;
      } else if (item.sizes && Array.isArray(item.sizes) && item.sizes.length > 0) {
        if (item.sizes.length === 1) {
          sizes = item.sizes[0].toString();
        } else {
          const sorted = [...item.sizes].sort((a, b) => a - b);
          sizes = `${sorted[0]}X${sorted[sorted.length - 1]}`;
        }
      } else if (item.articleDetails?.sizes && Array.isArray(item.articleDetails.sizes)) {
        if (item.articleDetails.sizes.length > 0) {
          if (item.articleDetails.sizes.length === 1) {
            sizes = item.articleDetails.sizes[0].toString();
          } else {
            const sorted = [...item.articleDetails.sizes].sort((a, b) => a - b);
            sizes = `${sorted[0]}X${sorted[sorted.length - 1]}`;
          }
        }
      }
      doc.text(sizes, col3X, rowY + 6, { width: 70, lineBreak: false });

      // Carton number
      const cartonNum = item.cartonNumber || 
                       item.articleDetails?.cartonNumber || 
                       (index + 1);
      doc.text(cartonNum.toString(), col4X, rowY + 6, { width: 70, lineBreak: false });

      // Unique ID (shortened)
      const uniqueId = item.uniqueId || 'N/A';
      const shortUniqueId = uniqueId.length > 18 ? uniqueId.substring(0, 18) + '...' : uniqueId;
      doc.text(shortUniqueId, col5X, rowY + 6, { width: 120, lineBreak: false });

      currentY += rowHeight;

      // Add new page if needed
      if (currentY > 700 && index < items.length - 1) {
        doc.addPage();
        currentY = 50;
        
        // Re-add table header on new page
        doc.rect(col1X - 5, currentY, 540, rowHeight).fill('#e8e8e8');
        doc.fill('#000000');
        doc.fontSize(7).font('Helvetica-Bold');
        doc.text('Article', col1X, currentY + 6, { width: 110, lineBreak: false });
        doc.text('Colors', col2X, currentY + 6, { width: 120, lineBreak: false });
        doc.text('Sizes', col3X, currentY + 6, { width: 70, lineBreak: false });
        doc.text('Carton', col4X, currentY + 6, { width: 70, lineBreak: false });
        doc.text('Unique ID', col5X, currentY + 6, { width: 120, lineBreak: false });
        
        currentY += rowHeight;
      }
    });

    // Total Cartons Row
    doc.moveTo(30, currentY).lineTo(570, currentY).stroke();
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text(`Total Cartons: ${totalCartons || 0}`, 450, currentY + 8);

    // ========== FOOTER ==========
    doc.moveDown(2);
    doc.fontSize(7).font('Helvetica').fill('#888888');
    doc.text(`Generated on: ${new Date().toLocaleString('en-GB')}`, 30);

    // ========== END DOCUMENT ==========
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
    // ✅ FIXED: Remove .populate() since Inventory schema doesn't have productId
    const inventoryRecords = await Inventory.find()
      .sort({ updatedAt: -1 });

    if (!inventoryRecords || inventoryRecords.length === 0) {
      return res.status(statusCodes.success).send({
        result: true,
        message: 'No inventory data found',
        data: { inventoryData: [], totalProducts: 0 }
      });
    }

    // ✅ FIXED: Format inventory based on actual schema (articleId, not productId)
    const formattedInventory = inventoryRecords.map(record => {
      const receivedCount = record.receivedQuantity || 0;
      const shippedCount = record.shippedQuantity || 0;
      const availableCount = record.availableQuantity || 0;
      const totalQRs = record.qrCodes?.length || 0;

      return {
        // Article-based inventory (not product-based)
        articleId: record.articleId,
        articleName: record.articleName,
        segment: record.segment || 'Unknown',
        articleImage: record.articleImage || null,
        
        // Inventory metrics
        inventoryMetrics: {
          availableQuantity: availableCount,
          receivedQuantity: receivedCount,
          shippedQuantity: shippedCount,
          totalQRCodes: totalQRs
        },
        
        // Summary
        summary: {
          totalInStock: availableCount,
          totalReceived: receivedCount,
          totalShipped: shippedCount
        },
        
        lastUpdated: record.updatedAt || record.createdAt
      };
    });

    return res.status(statusCodes.success).send({
      result: true,
      message: 'Inventory data retrieved successfully',
      data: {
        inventoryData: formattedInventory,
        totalProducts: formattedInventory.length
      }
    });

  } catch (error) {

    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error fetching inventory data',
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

    // Create contractor - main password will be hashed by schema
    // But contractorDetails.password stays plain text
    const newContractor = new userModel({
      name: fullName,
      phoneNo: cleanPhoneNo,
      password: password, // This will be hashed by pre-save hook
      role: 'contractor',
      isActive: true,
      contractorDetails: {
        fullName,
        phoneNo: cleanPhoneNo,
        password: password, // ✅ PLAIN TEXT - NOT HASHED
        totalItemsProduced: 0,
        activeProductions: []
      },
      createdBy: req.user?.id
    });

    await newContractor.save();

    const contractorResponse = {
      id: newContractor._id,
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

    const newWarehouseManager = new userModel({
      name: fullName,
      phoneNo: cleanPhoneNo,
      password: password, // This will be hashed
      role: 'warehouse_inspector',
      isActive: true,
      warehouseInspectorDetails: {
        fullName,
        phoneNo: cleanPhoneNo,
        password: password, // ✅ PLAIN TEXT - NOT HASHED
        totalItemsInspected: 0,
        itemsProcessedToday: 0
      },
      createdBy: req.user?.id
    });

    await newWarehouseManager.save();

    const warehouseManagerResponse = {
      id: newWarehouseManager._id,
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

    const newShipmentManager = new userModel({
      name: fullName,
      phoneNo: cleanPhoneNo,
      password: password, // This will be hashed
      role: 'shipment_manager',
      isActive: true,
      shipmentManagerDetails: {
        fullName,
        phoneNo: cleanPhoneNo,
        password: password, // ✅ PLAIN TEXT - NOT HASHED
        totalShipmentsHandled: 0,
        activeShipments: []
      },
      createdBy: req.user?.id
    });

    await newShipmentManager.save();

    const shipmentManagerResponse = {
      id: newShipmentManager._id,
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

const addDistributor = async (req, res) => {
  try {
    let { salesmanName, partyName, city, transport, phoneNo, password } = req.body;



    partyName = partyName ? partyName.trim() : "";
    transport = transport ? transport.trim() : "";
    password = password ? password.trim() : "";

    let checkData = distributorValidationSchema.safeParse({ partyName, transport, phoneNo, password });
    
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

    // Create distributor - main password hashed, but we don't store in distributorDetails
    await userModel.create({
      name: partyName,
      phoneNo,
      password: password, // This will be hashed
      role: 'distributor',
      isActive: true,
      distributorDetails: {
        salesmanName,
        partyName,
        cityName: city,
        transport,
        purchases: [],
        receivedShipments: []
      },
      // Store plain password at root level for admin viewing
      plainPassword: password, // ✅ ADD THIS FIELD
      createdBy: req.user?.id || null
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

const createOrUpdateShipment = async (qrCode, user, distributorDetails) => {
    const Shipment = mongoose.model('Shipment');

    // Find existing shipment for this distributor that's still "pending" or "in_transit"
    let shipment = await Shipment.findOne({
        distributorId: distributorDetails.distributorId,
        status: { $in: ['pending', 'in_transit'] }
    });

    const itemData = {
        qrCodeId: qrCode._id,
        uniqueId: qrCode.uniqueId,
        articleName: qrCode.articleName,
        colors: qrCode.contractorInput?.colors || [],
        sizes: qrCode.contractorInput?.sizes || [],
        cartonNumber: qrCode.contractorInput?.cartonNumber,
        scannedAt: new Date()
    };

    if (!shipment) {
        // Create new shipment
        shipment = new Shipment({
            distributorId: distributorDetails.distributorId,
            distributorName: distributorDetails.distributorName,
            items: [itemData],
            totalCartons: 1,
            status: 'pending',
            createdBy: user._id,
            trackingNumber: `SHIP_${Date.now()}_${distributorDetails.distributorId.toString().slice(-6)}`
        });
    } else {
        // Add to existing shipment
        shipment.items.push(itemData);
        shipment.totalCartons = shipment.items.length;
    }

    await shipment.save();

    // Update QRCode with shipmentId
    qrCode.shipmentDetails.shipmentId = shipment._id;
    await qrCode.save();

    return shipment;
};

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
    throw error;
  }
}

const completeShipment = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({
        result: false,
        message: 'Shipment not found'
      });
    }
    
    // Update all items to shipped and shipment to completed
    shipment.items.forEach(item => {
      if (item.status !== 'shipped') {
        item.status = 'shipped';
        item.shippedAt = new Date();
      }
    });
    
    shipment.status = 'completed';
    await shipment.save();
    
    res.status(200).json({
      result: true,
      message: 'Shipment completed successfully',
      data: shipment
    });
    
  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to complete shipment',
      error: error.message
    });
  }
};

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
        }
      }
    }

    res.status(200).json({
      result: true,
      message: 'Shipment details retrieved successfully',
      data: shipmentObj
    });

  } catch (error) {
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
    if (status) {
      // ✅ FIXED: Handle status filtering correctly
      if (status === 'pending') {
        query.status = 'active';
      } else if (status === 'shipped') {
        query.status = 'completed';
      } else {
        query.status = status; // 'active' or 'completed'
      }
    }
    if (distributorId) query.distributorId = distributorId;

    const shipments = await Shipment.find(query)
      .populate('distributorId', 'name phoneNo email')
      .populate('shippedBy', 'name phoneNo')
      .sort({ shippedAt: -1 });

    // ✅ FIXED: Add status summary for frontend
    const statusSummary = {
      active: await Shipment.countDocuments({ status: 'active' }),
      completed: await Shipment.countDocuments({ status: 'completed' })
    };

    res.status(200).json({
      result: true,
      message: 'Shipments retrieved successfully',
      data: {
        shipments,
        totalCount: shipments.length,
        statusSummary
      }
    });

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to fetch shipments',
      error: error.message
    });
  }
};

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
    res.status(500).json({
      result: false,
      message: 'Failed to fetch inventory',
      error: error.message
    });
  }
};


const generateShipmentReceiptPDF = async (req, res) => {
  try {
    const { 
      shipmentId, 
      distributorName,
      distributorPhoneNo,
      distributorTransport, 
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
       .text('SHIPMENT RECEIPT', 50, 50, { align: 'center' });

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
       .text('Pinkey Footwear', 50, 130);

    doc.fontSize(10)
       .fillColor('#666666')
       .text('Address: Main Warehouse Facility', 50, 150)
       .text('Phone: +91 XXXXX XXXXX', 50, 165)

    // Shipment Details Box
    doc.rect(50, 220, 245, 140)
       .fillAndStroke('#f9fafb', '#e5e7eb');

    doc.fontSize(14)
       .fillColor('#1f2937')
       .text('Shipment Details', 60, 235);

    doc.fontSize(10)
       .fillColor('#4b5563')
       .text(`Shipment ID: ${shipmentId}`, 60, 255)
       .text(`Date: ${new Date(shippedAt).toLocaleDateString()}`, 60, 270)
       .text(`Time: ${new Date(shippedAt).toLocaleTimeString()}`, 60, 285)
       .text(`Status: SHIPPED`, 60, 300)
       .text(`Total Cartons: ${totalCartons}`, 60, 315)

    // Distributor Details Box
    doc.rect(300, 220, 245, 140)
       .fillAndStroke('#f9fafb', '#e5e7eb');

    doc.fontSize(14)
       .fillColor('#1f2937')
       .text('Distributor Information', 310, 235);

    doc.fontSize(10)
       .fillColor('#4b5563')
       .text(`Company: ${distributorName}`, 310, 255)
       .text(`Contact: ${distributorPhoneNo}`, 310, 270)

    // Items Table Header
    doc.fontSize(16)
       .fillColor('#1f2937')
       .text('Shipped Items', 50, 390);

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

      // ✅ Format colors properly
      const colorsDisplay = Array.isArray(item.colors) ? 
            item.colors.join(', ') : 
            (item.colors || 'N/A');

      // ✅ Format sizes using helper function (3X6 format)
      const sizesDisplay = formatSizeRange(item.sizes);

      doc.fillColor('#1f2937')
         .text((index + 1).toString(), 60, yPosition, { width: 30 })
         .text(item.articleName || 'Unknown', 100, yPosition, { width: 140 })
         .text(colorsDisplay, 250, yPosition, { width: 80 })
         .text(sizesDisplay, 340, yPosition, { width: 60 }) // ✅ Now shows 3X6 format
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
       .text('Shipment Summary', 60, summaryY + 15);

    // Footer
    const footerY = summaryY + 120;
    doc.fontSize(10)
       .fillColor('#6b7280')
       .text(`Receipt generated on ${new Date().toLocaleString()}`, 50, footerY + 35, { align: 'center' })
       .text('This is a computer-generated document and does not require a signature.', 50, footerY + 50, { align: 'center', style: 'italic' });

    // Add QR tracking info footer
    doc.fontSize(8)
       .fillColor('#9ca3af')
       .text(`Tracking: Use shipment ID ${shipmentId} for status updates`, 50, footerY + 70, { align: 'center' });

    // ✅ Finalize the PDF
    doc.end();

  } catch (error) {
    
    // If response headers haven't been sent yet, send JSON error
    if (!res.headersSent) {
      res.status(500).json({
        result: false,
        message: 'Failed to generate PDF receipt',
        error: error.message
      });
    } else {
      // If we're already streaming PDF, we can't send JSON

    }
  }
};

// ✅ Updated QR label generator with proper size formatting


// ✅ Additional helper for warehouse receipt (if you have one)
const generateWarehouseReceiptPDF = async (req, res) => {
  try {
    const { items, warehouseDetails, receivedBy, receivedAt } = req.body;

    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Warehouse_Receipt.pdf"');

    doc.pipe(res);

    // Header
    doc.fontSize(24).text('📦 WAREHOUSE RECEIPT', 50, 50, { align: 'center' });
    doc.moveDown(2);

    // Warehouse Details
    doc.fontSize(16).text('Warehouse Information', 50);
    doc.fontSize(12)
       .text(`Location: ${warehouseDetails?.location || 'Main Warehouse'}`, 50)
       .text(`Received By: ${receivedBy?.name || 'Warehouse Inspector'}`, 50)
       .text(`Date & Time: ${new Date(receivedAt).toLocaleString()}`, 50);
    
    doc.moveDown(2);

    // Items Table
    doc.fontSize(16).text('Received Items', 50);
    doc.moveDown(1);

    // Table Header
    doc.rect(50, doc.y, 495, 25).fillAndStroke('#2563eb', '#2563eb');
    doc.fillColor('white').fontSize(10);
    
    let yPos = doc.y + 8;
    doc.text('#', 60, yPos, { width: 30 })
       .text('Article Name', 100, yPos, { width: 120 })
       .text('Colors', 230, yPos, { width: 80 })
       .text('Sizes', 320, yPos, { width: 60 })
       .text('Carton #', 390, yPos, { width: 50 })
       .text('Quality', 450, yPos, { width: 80 });

    doc.y += 35;
    doc.fillColor('#000000');

    // Table Rows
    items.forEach((item, index) => {
      if (index % 2 === 0) {
        doc.rect(50, doc.y - 5, 495, 20).fillAndStroke('#f9fafb', '#f9fafb');
      }

      // ✅ Format sizes using helper function
      const sizesDisplay = formatSizeRange(item.sizes);
      const colorsDisplay = Array.isArray(item.colors) ? item.colors.join(', ') : (item.colors || 'N/A');

      yPos = doc.y;
      doc.text((index + 1).toString(), 60, yPos, { width: 30 })
         .text(item.articleName || 'Unknown', 100, yPos, { width: 120 })
         .text(colorsDisplay, 230, yPos, { width: 80 })
         .text(sizesDisplay, 320, yPos, { width: 60 }) // ✅ Shows 3X6 format
         .text(`#${item.cartonNumber || index + 1}`, 390, yPos, { width: 50 })
         .text(item.quality || 'Good', 450, yPos, { width: 80 });

      doc.y += 20;
    });

    // Footer
    doc.moveDown(2);
    doc.fontSize(10)
       .text('This receipt confirms the successful warehouse receipt of the above items.', 50, { align: 'center' });

    doc.end();

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to generate warehouse receipt',
      error: error.message
    });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Get user with plainPassword field
    const user = await userModel.findById(id)
      .select('+plainPassword') // Include plainPassword
      .lean();

    if (!user) {
      return res.status(statusCodes.notFound).json({
        result: false,
        message: "User not found"
      });
    }

    let userDetails = {
      id: user._id,
      phoneNo: user.phoneNo,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      loginCredential: user.phoneNo
    };

    // Add role-specific details with PLAIN TEXT PASSWORD
    switch (user.role) {
      case 'contractor':
        userDetails = {
          ...userDetails,
          fullName: user.contractorDetails?.fullName,
          phoneNo: user.contractorDetails?.phoneNo || user.phoneNo,
          loginCredential: user.contractorDetails?.phoneNo || user.phoneNo,
          password: user.contractorDetails?.password || "Not available", // Plain text
          totalItemsProduced: user.contractorDetails?.totalItemsProduced || 0,
          activeProductions: user.contractorDetails?.activeProductions || []
        };
        break;

      case 'warehouse_inspector':
        userDetails = {
          ...userDetails,
          fullName: user.warehouseInspectorDetails?.fullName,
          phoneNo: user.warehouseInspectorDetails?.phoneNo || user.phoneNo,
          loginCredential: user.warehouseInspectorDetails?.phoneNo || user.phoneNo,
          password: user.warehouseInspectorDetails?.password || "Not available", // Plain text
          totalItemsInspected: user.warehouseInspectorDetails?.totalItemsInspected || 0,
          itemsProcessedToday: user.warehouseInspectorDetails?.itemsProcessedToday || 0
        };
        break;

      case 'shipment_manager':
        userDetails = {
          ...userDetails,
          fullName: user.shipmentManagerDetails?.fullName,
          phoneNo: user.shipmentManagerDetails?.phoneNo || user.phoneNo,
          loginCredential: user.shipmentManagerDetails?.phoneNo || user.phoneNo,
          password: user.shipmentManagerDetails?.password || "Not available", // Plain text
          totalShipmentsHandled: user.shipmentManagerDetails?.totalShipmentsHandled || 0,
          activeShipments: user.shipmentManagerDetails?.activeShipments || []
        };
        break;

      case 'distributor':
        userDetails = {
          ...userDetails,
          name: user.name,
          partyName: user.distributorDetails?.partyName,
          salesmanName: user.distributorDetails?.salesmanName,
          cityName: user.distributorDetails?.cityName, // ✅ Use 'city' field
          transport: user.distributorDetails?.transport,
          password: user.plainPassword || "Not available", // ✅ Plain text password
          totalPurchases: user.distributorDetails?.purchases?.length || 0,
          totalShipments: user.distributorDetails?.receivedShipments?.length || 0
        };
        break;

      case 'admin':
        userDetails = {
          ...userDetails,
          fullName: user.adminDetails?.fullName,
          phoneNo: user.adminDetails?.phoneNo || user.phoneNo,
          loginCredential: user.adminDetails?.phoneNo || user.phoneNo,
          password: user.adminDetails?.password || "Not available",
          permissions: user.adminDetails?.permissions || [],
          lastAdminAction: user.adminDetails?.lastAdminAction
        };
        break;
    }

    res.status(statusCodes.success).json({
      result: true,
      message: "User details retrieved successfully",
      data: userDetails
    });

  } catch (error) {

    res.status(statusCodes.serverError).json({
      result: false,
      message: "Failed to retrieve user details",
      error: error.message
    });
  }
};


// Add this controller for past orders with auto-cleanup
// Add this to your warehouse controller
const getQRCodeById = async (req, res) => {
  try {
    const { qrId } = req.params;


    // Find QR code by MongoDB _id
    const qrCode = await QRCode.findById(qrId);

    if (!qrCode) {
      return res.status(404).json({
        result: false,
        message: `QR code not found with ID: ${qrId}`
      });
    }


    // Return the QR data in the same format as the QR scanner expects
    const qrData = {
      uniqueId: qrCode.uniqueId,
      articleName: qrCode.articleName,
      contractorInput: qrCode.contractorInput,
      productReference: qrCode.productReference,
      status: qrCode.status,
      batchInfo: qrCode.batchInfo
    };

    return res.status(200).json({
      result: true,
      message: "QR code fetched successfully",
      data: qrData
    });

  } catch (error) {

    res.status(500).json({
      result: false,
      message: "Failed to fetch QR code",
      error: error.message
    });
  }
};

const getPastOrders = async (req, res) => {
  try {
    const { 
      search = '', 
      distributor = '', 
      startDate, 
      endDate,
      page = 1,
      limit = 20
    } = req.query;

    // ✅ AUTO-DELETE orders older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const deleteResult = await purchaseProductModel.deleteMany({
      createdAt: { $lt: thirtyDaysAgo }
    });
    
    if (deleteResult.deletedCount > 0) {
      console.log(`[CLEANUP] Deleted ${deleteResult.deletedCount} orders older than 30 days`);
    }

    // Build query
    const query = {};

    if (distributor) {
      query.distributorId = distributor;
    }

    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'distributorDetails.partyName': { $regex: search, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const orders = await purchaseProductModel.find(query)
      .populate('distributorId', 'name phoneNo distributorDetails')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalOrders = await purchaseProductModel.countDocuments(query);

    // Get unique distributors for filter
    const distributors = await purchaseProductModel.distinct('distributorId');
    const distributorsList = await userModel.find({
      _id: { $in: distributors },
      role: 'distributor'
    }).select('_id name distributorDetails.partyName');

    res.status(200).json({
      result: true,
      message: 'Past orders retrieved',
      data: {
        orders: orders.map(order => ({
          _id: order._id,
          orderId: order.orderId || `ORD_${order._id}`,
          distributorName: order.distributorId?.distributorDetails?.partyName || 
                          order.distributorId?.name || 'Unknown',
          distributorPhone: order.distributorId?.phoneNo || 'N/A',
          totalAmount: order.totalAmount || 0,
          totalItems: order.items?.length || 0,
          createdAt: order.createdAt,
          // Remove status field as requested
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalOrders / parseInt(limit)),
          totalOrders,
          limit: parseInt(limit)
        },
        filters: {
          distributors: distributorsList.map(d => ({
            _id: d._id,
            name: d.distributorDetails?.partyName || d.name
          }))
        }
      }
    });

  } catch (error) {

    res.status(500).json({
      result: false,
      message: 'Failed to fetch past orders',
      error: error.message
    });
  }
};


export { getQRCodeById };




export {register, login, getAdmin, addDistributor, deleteDistributor, getDistributors, updateDistributor, generateOrderPerforma, addFestivleImage, getFestivleImages, scanQRCode, getQRStatistics, getInventoryData, getSingleProductInventory, getAllInventory, addContractor, addWarehouseManager, addShipmentManager,
getContractors,
  getWarehouseManagers,
  getShipmentManagers,
  updateUserStats,
  deleteUser,
  getUsersByRole,
  generateShipmentReceiptPDF,
  getInventoryStats,
  createOrUpdateShipment,
  getShipmentDetails,
  getAllShipments,
  generateShipmentReceipt,
  getInventoryByArticleId,
  generateWarehouseReceiptPDF,
  getUserDetails,
  getContractorMonthlyReport,
  downloadContractorMonthlyReport,
  getAllContractorsMonthlyReport,
  downloadAllContractorsReport}