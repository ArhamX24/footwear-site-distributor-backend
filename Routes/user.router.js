import express from "express";
import {getDeals} from "../Controllers/Admin/products.controllers.js";
import {purchaseProduct, getAllProducts, fetchAllDealsImages, fetchFilters, fetchProductData, generateOrderPerforma, getDistributor, fetchArticleDetailsFromInventory, searchProducts, getPastOrders} from "../Controllers/User/user.contollers.js";
import userAuth from "../MIddlewares/userauth.middleware.js";
import multer from "multer";
import { getFestivleImages } from "../Controllers/Admin/admin.controllers.js";
import authenticateToken from "../MIddlewares/auth.middleware.js";


const uploadFormDetails = multer();

let userRouter = express.Router()


userRouter.get("/deals/get", getDeals)
.get("/products/get",  getAllProducts)
.post("/product/placeorder/",uploadFormDetails.none(), authenticateToken, purchaseProduct)
.get("/deals/getimages", fetchAllDealsImages)
.get("/products/filters/get", fetchFilters)
.get("/products/names/get", fetchProductData)
.get("/products/details/get", fetchProductData)
.get("/orders/download-performa/:orderId", generateOrderPerforma)
.get("/me", authenticateToken, getDistributor)
.get("/festival/get", getFestivleImages)
.get("/article-details/:articleId", fetchArticleDetailsFromInventory)
.get("/products/search", searchProducts)
.get("/orders/past", authenticateToken ,getPastOrders)

export default userRouter