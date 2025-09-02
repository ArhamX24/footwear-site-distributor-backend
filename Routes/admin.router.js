import express from "express";
import { 
    register, 
    getAdmin, 
    addDistributor, 
    getDistributors, 
    updateDistributor, 
    deleteDistributor, 
    generateOrderPerforma, 
    addFestivleImage, 
    generateQRCodes, 
    downloadQRCodes, 
    getQRStatistics, 
    scanQRCode, 
    getInventoryData, 
    getSingleProductInventory, 
    getAllInventory
} from "../Controllers/Admin/admin.controllers.js";
import adminAuth from "../MIddlewares/adminauth.middleware.js";
import { 
    addProduct,
    importProductsFromExcel,
    deleteProduct, 
    getAllProdcuts, 
    addBestDeals, 
    deleteDeals, 
    getDeals, 
    getPurchases, 
    markPurchaseConfirm, 
    updateDeal, 
    addCategories, 
    getCategories 
} from "../Controllers/Admin/products.controllers.js";
import upload from "../MIddlewares/multer.middleware.js";
import multer from "multer";

const uploadFormDetails = multer();

let adminRouter = express.Router();

// Authentication routes
adminRouter.post("/register", register)
.get("/me", adminAuth, getAdmin)

// Product management routes
.post("/products/addproduct", upload.array('images', 10), addProduct)
.delete("/products/deleteproduct/:productid", deleteProduct)
.get("/products/getproducts", getAllProdcuts)
.post("/products/import-excel", upload.single('excel'), importProductsFromExcel)

// Deal management routes
.post("/deal/add", upload.array('images', 1), addBestDeals)
.delete("/deal/delete/:productid", deleteDeals)
.patch("/deal/update/:id", updateDeal)
.get("/deal/get", getDeals)

// Distributor management routes
.post("/distributor/add", uploadFormDetails.none(), addDistributor)
.get("/distributor/get", getDistributors)
.patch("/distributor/update/:id", updateDistributor)
.delete("/distributor/delete/:id", deleteDistributor)

// Order management routes
.get("/products/orders", getPurchases)
.post("/products/orders/confirm/:id", markPurchaseConfirm)
.get("/orders/view-performa/:orderId", generateOrderPerforma)

// Category management routes
.post("/products/category/add", addCategories)
.get("/products/category/get", getCategories)

// Festival/promotional content routes
.post("/festival/upload", upload.single('images'), addFestivleImage)

// QR Code management routes
.post("/qr/generate", adminAuth, generateQRCodes)
.post("/qr/download", adminAuth, downloadQRCodes)
.post("/qr/scan/:uniqueId", scanQRCode)
.get("/qr/statistics", getQRStatistics)

// Inventory management routes
.get("/inventory/all", getAllInventory)
.get("/inventory/:productId", getSingleProductInventory)
// Fixed: Use separate routes instead of optional parameter syntax
.get("/inventory/data/:productId", getInventoryData) // Route with productId parameter
.get("/inventory/data", getInventoryData) // Route without productId (uses query parameter)

export default adminRouter;
