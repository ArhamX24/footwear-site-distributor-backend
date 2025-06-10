import express from "express";
import { register, getAdmin, addDistributor, getDistributors, updateDistributor, deleteDistributor, generateOrderPerforma, addFestivleImage} from "../Controllers/Admin/admin.controllers.js";
import adminAuth from "../MIddlewares/adminauth.middleware.js";
import { addProduct, deleteProduct, getAllProdcuts, addBestDeals, deleteDeals, getDeals, getPurchases, markPurchaseConfirm, updateDeal, addCategories, getCategories } from "../Controllers/Admin/products.controllers.js";
import upload from "../MIddlewares/multer.middleware.js";
import multer from "multer";


const uploadFormDetails = multer();

let adminRouter = express.Router();

adminRouter.post("/register", register)
.get("/me", adminAuth, getAdmin)
.post("/products/addproduct", upload.array('images', 10), addProduct)
.delete("/products/deleteproduct/:productid", deleteProduct)
.get("/products/getproducts",  getAllProdcuts)
.post("/deal/add", upload.array('images', 1) , addBestDeals)
.delete("/deal/delete/:productid", deleteDeals)
.patch("/deal/update/:id", updateDeal)
.get("/deal/get", getDeals)
.post("/distributor/add",uploadFormDetails.none(), addDistributor)
.get("/distributor/get", getDistributors)
.patch("/distributor/update/:id", updateDistributor)
.delete("/distributor/delete/:id", deleteDistributor)
.get("/products/orders", getPurchases)
.post("/products/orders/confirm/:id", markPurchaseConfirm)
.post("/products/category/add", addCategories)
.get("/products/category/get", getCategories)
.get("/orders/view-performa/:orderId", generateOrderPerforma)
.post("/festival/upload", upload.single('images'), addFestivleImage)


export default adminRouter

