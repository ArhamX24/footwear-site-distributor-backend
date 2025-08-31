import express from "express";
import "dotenv/config"
import cors from "cors"
import cookieParser from "cookie-parser";
import dbConnect from "./DB/DbConnect.js";
import adminRouter from "./Routes/admin.router.js";
import userRouter from "./Routes/user.router.js";
import AuthRouter from "./Routes/auth.router.js";
import cron from "node-cron";
import dealsModel from "./Models/Deals.model.js";
import productModel from "./Models/Product.model.js";
import mongoose from "mongoose";

const server = express()

server.use(express.json());
server.use(express.urlencoded({extended: true}))
server.use(cookieParser())

const allowedOrigins = [
  "http://www.pinkeyfootwear.in",
  "https://pinkey-demo.netlify.app",
  "http://localhost:5173",
  "http://10.214.28.84:5173/"
];

server.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin like mobile apps or curl requests
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true
}));

server.use("/api/v1/auth", AuthRouter)
server.use("/api/v1/admin", adminRouter)
server.use("/api/v1/distributor", userRouter)


const processExpiredDeals = async () => {
  try {
    // Find all deals where expireAt has passed
    const expiredDeals = await dealsModel.find({ 
      expireAt: { $lt: new Date() } 
    });
    for (const deal of expiredDeals) {
      const articleId = deal.articleId;
      
      if (articleId) {
        // Update the specific article in the nested structure
        await productModel.updateOne(
          { 
            "variants.articles._id": articleId 
          },
          { 
            $set: { 
              "variants.$[].articles.$[article].indeal": false 
            },
            $unset: { 
              "variants.$[].articles.$[article].deal": "" 
            }
          },
          {
            arrayFilters: [
              { "article._id": articleId }
            ]
          }
        );
      }
      
      // Delete the expired deal
      await dealsModel.deleteOne({ _id: deal._id });
    }
    
    if (expiredDeals.length > 0) {
      console.log(`Processed ${expiredDeals.length} expired deals`);
    }
    
  } catch (error) {
    console.error("Error processing expired deals:", error);
  }
};

// // Run every minute
cron.schedule("* * * * *", async () => {
  await processExpiredDeals();
});



dbConnect()
  .then(() => {
    server.listen(process.env.PORT)
    console.log("Connected");
  })
  .catch((err) => {
    console.error(err)
    console.error("Database connection failed:", err);
});





