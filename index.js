import express from "express";
import "dotenv/config";
import cors from "cors";
import cookieParser from "cookie-parser";
import dbConnect from "./DB/DbConnect.js";

import adminRouter from "./Routes/admin.router.js";
import userRouter from "./Routes/user.router.js";
import AuthRouter from "./Routes/auth.router.js";
import contractorRouter from "./Routes/contractor.router.js";  
import warehouseRouter from "./Routes/warehouse.router.js";    
import shipmentRouter from "./Routes/shipment.router.js";      

import cron from "node-cron";
import dealsModel from "./Models/Deals.model.js";
import productModel from "./Models/Product.model.js";
import mongoose from "mongoose";

const server = express();

// Middleware setup
server.use(express.json());
server.use(express.urlencoded({ extended: true }));
server.use(cookieParser());

const allowedOrigins = [
  "https://pinkeyfootwear.in",
  "https://www.pinkeyfootwear.in",
  "https://pinkeyfootwear.netlify.app",
  "https://pinkey-demo.netlify.app",
  "http://localhost:5173",
  "http://localhost:3000",
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
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 // For legacy browser support
}));

// ✅ Updated route mounting - Role-based API structure
server.use("/api/v1/auth", AuthRouter);                    // ✅ Universal auth routes
server.use("/api/v1/admin", adminRouter);                  // ✅ Admin-only routes
server.use("/api/v1/distributor", userRouter);             // ✅ Distributor-only routes
server.use("/api/v1/contractor", contractorRouter);        // ✅ Contractor routes
server.use("/api/v1/warehouse", warehouseRouter);          // ✅ Warehouse inspector routes
server.use("/api/v1/shipment", shipmentRouter);            // ✅ Shipment manager routes

// ✅ Health check endpoint
server.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    result: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    routes: {
      auth: "/api/v1/auth",
      admin: "/api/v1/admin", 
      distributor: "/api/v1/distributor",
      contractor: "/api/v1/contractor",
      warehouse: "/api/v1/warehouse",
      shipment: "/api/v1/shipment"
    }
  });
});

// Cron job for expired deals processing
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
    
    
  } catch (error) {
    console.error("❌ Error processing expired deals:", error);
  }
};

// Run every minute to check for expired deals
cron.schedule("* * * * *", async () => {
  await processExpiredDeals();
});

// ✅ Enhanced error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  process.exit(1);
});

// Database connection and server startup
dbConnect()
  .then(() => {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    process.exit(1);
  });

export default server;
