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
    getAllInventory,
    addContractor, 
    addWarehouseManager, 
    addShipmentManager,
    getContractors,
    getWarehouseManagers,
    getShipmentManagers,
    deleteUser,
    getUsersByRole,
    updateUserStats,
    getInventoryByArticleId,
    getShipmentDetails,
    getAllShipments,
    
} from "../Controllers/Admin/admin.controllers.js";
import { adminOnly } from "../MIddlewares/roleauth.middleware.js";
import { 
    addProduct,
    importProductsFromExcel,
    deleteProduct,
    updateProduct, 
    getAllProdcuts, 
    addBestDeals, 
    deleteDeals, 
    getDeals, 
    getPurchases, 
    markPurchaseConfirm, 
    updateDeal, 
    addCategories, 
    getCategories,
    getArticlesForDropdown 
} from "../Controllers/Admin/products.controllers.js";
import {
  getAutoDeleteSettings,
  updateAutoDeleteSettings,
  cleanupOldShipments,
} from '../Controllers/Admin/shipment.controllers.js'
import upload from "../MIddlewares/multer.middleware.js";
import multer from "multer";

const uploadFormDetails = multer();

let adminRouter = express.Router();

// Authentication routes
adminRouter.post("/register", register)
.get("/me", adminOnly, getAdmin)
.post("/qr/generate", adminOnly, generateQRCodes)

// Product management routes
.post("/products/addproduct", upload.array('images', 10), addProduct)
.delete("/products/deleteproduct/:productid", deleteProduct)
.put("/products/updateproduct/:productid", upload.array('images', 10), updateProduct)
.get("/products/getproducts", getAllProdcuts)
.post("/products/import-excel", upload.single('excel'), importProductsFromExcel)
.get("/products/articles", getArticlesForDropdown)

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
.post("/qr/generate", adminOnly, generateQRCodes)
.post("/qr/download", adminOnly, downloadQRCodes)
.post("/qr/scan/:uniqueId", scanQRCode)
.get("/qr/statistics", getQRStatistics)

// Inventory management routes
.get("/inventory/all", getAllInventory)
.get("/inventory/:productId", getSingleProductInventory)
// Fixed: Use separate routes instead of optional parameter syntax
.get("/inventory/data/:productId", getInventoryData) // Route with productId parameter
.get("/inventory/data", getInventoryData) // Route without productId (uses query parameter)
.get("/inventory/article/:articleId", getInventoryByArticleId)

// User Management Routes
.post("/users/contractor/add", adminOnly, addContractor)
.post("/users/warehouse/add", adminOnly, addWarehouseManager)
.post("/users/shipment/add", adminOnly, addShipmentManager)

.get("/users/contractors", adminOnly, getContractors)
.get("/users/warehouse-managers", adminOnly, getWarehouseManagers)
.get("/users/shipment-managers", adminOnly, getShipmentManagers)
.get("/users/role/:role", adminOnly, getUsersByRole)

.put("/users/:id", adminOnly, updateUserStats)
.delete("/users/:id", adminOnly, deleteUser)

// ========== NEW SHIPMENT MANAGEMENT ROUTES ==========
// Shipment listing and details routes
.get("/shipments", adminOnly, getAllShipments)
.get("/shipments/:shipmentId", adminOnly, getShipmentDetails)
.get("/shipments/view-details/:shipmentId", adminOnly, getShipmentDetails)

// Auto-delete settings management routes
.get("/shipments/auto-delete-settings", adminOnly, getAutoDeleteSettings)
.put("/shipments/auto-delete-settings", adminOnly, updateAutoDeleteSettings)

// Cleanup operations route
.delete("/shipments/cleanup", adminOnly, cleanupOldShipments)

export default adminRouter;
