import express from "express";
import {getDeals} from "../Controllers/Admin/products.controllers.js";
import {purchaseProduct, getAllProducts, fetchAllDealsImages, fetchFilters, fetchProductData, generateOrderPerforma, getDistributor, fetchArticleDetailsFromInventory} from "../Controllers/User/user.contollers.js";
import userAuth from "../MIddlewares/userauth.middleware.js";
import multer from "multer";
import { getFestivleImages } from "../Controllers/Admin/admin.controllers.js";


const uploadFormDetails = multer();

let userRouter = express.Router()


userRouter.get("/deals/get", getDeals)
.get("/products/get",  getAllProducts)
.post("/product/placeorder/",uploadFormDetails.none(), userAuth, purchaseProduct)
.get("/deals/getimages", fetchAllDealsImages)
.get("/products/filters/get", fetchFilters)
.get("/products/names/get", fetchProductData)
.get("/products/details/get", fetchProductData)
.get("/orders/download-performa/:orderId", generateOrderPerforma)
.get("/me", userAuth, getDistributor)
.get("/festival/get", getFestivleImages)
.get("/article-details/:articleId", fetchArticleDetailsFromInventory)

export default userRouter