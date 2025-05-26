import express from "express";
import {getDeals} from "../Controllers/Admin/products.controllers.js";
import { login, purchaseProduct, getAllProdcuts, fetchAllDealsImages, fetchFilters, fetchProductData, generateOrderPerforma, getDistributor } from "../Controllers/User/user.contollers.js";
import userAuth from "../MIddlewares/userauth.middleware.js";
import multer from "multer";

const uploadFormDetails = multer();

let userRouter = express.Router()


userRouter.get("/deals/get", getDeals)
.get("/products/get",  getAllProdcuts)
.post("/login", login)
.post("/product/placeorder/",uploadFormDetails.none(), userAuth, purchaseProduct)
.get("/deals/getimages", fetchAllDealsImages)
.get("/products/filters/get", fetchFilters)
.get("/products/names/get", fetchProductData)
.get("/products/details/get", fetchProductData)
.get("/orders/download-performa/:orderId", generateOrderPerforma)
.get("/get", userAuth, getDistributor)

export default userRouter