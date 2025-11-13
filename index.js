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
  optionsSuccessStatus: 200
}));

// ✅ Updated route mounting - Role-based API structure
server.use("/api/v1/auth", AuthRouter);
server.use("/api/v1/admin", adminRouter);
server.use("/api/v1/distributor", userRouter);
server.use("/api/v1/contractor", contractorRouter);
server.use("/api/v1/warehouse", warehouseRouter);
server.use("/api/v1/shipment", shipmentRouter);

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

// ✅ FIXED: Cron job with proper error handling
const processExpiredDeals = async () => {
  try {
    // Find all deals where expireAt has passed
    const expiredDeals = await dealsModel.find({ 
      expireAt: { $lt: new Date() } 
    }).lean();
    
    if (!expiredDeals || expiredDeals.length === 0) {
      return; // No expired deals to process
    }
    
    for (const deal of expiredDeals) {
      try {
        const articleId = deal.articleId;
        
        // ✅ Validate articleId exists and is valid ObjectId
        if (!articleId || !mongoose.Types.ObjectId.isValid(articleId)) {
          console.warn(`⚠️ Invalid articleId in deal ${deal._id}`);
          // Delete invalid deal
          await dealsModel.deleteOne({ _id: deal._id });
          continue;
        }

        // ✅ FIXED: Corrected MongoDB update query
        const updateResult = await productModel.updateOne(
          { 
            "variants.articles._id": new mongoose.Types.ObjectId(articleId)
          },
          { 
            $set: { 
              "variants.$[variant].articles.$[article].indeal": false 
            },
            $unset: { 
              "variants.$[variant].articles.$[article].deal": "" 
            }
          },
          {
            arrayFilters: [
              { "variant.articles._id": new mongoose.Types.ObjectId(articleId) },
              { "article._id": new mongoose.Types.ObjectId(articleId) }
            ]
          }
        );

        // Delete the expired deal
        await dealsModel.deleteOne({ _id: deal._id });
        
        
      } catch (dealError) {
        console.error(`Error processing deal ${deal._id}:`, dealError.message);
        // Continue with next deal instead of crashing
        continue;
      }
    }
    
    console.log(`✅ Finished processing expired deals`);
    
  } catch (error) {
    console.error("Critical error in processExpiredDeals:", error.message);
    // Don't throw - just log and continue
    // This prevents the cron job from crashing the server
  }
};

// Run every minute to check for expired deals
// ✅ Wrapped in try-catch to prevent cron crashes
cron.schedule("* * * * *", async () => {
  try {
    await processExpiredDeals();
  } catch (error) {
    console.error(error.message);
  }
});

// ✅ Enhanced error handling for uncaught exceptions
process.on('uncaughtException', (error) => {  
  // Give time to log before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
  
  // Give time to log before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// ✅ Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Database connection and server startup
dbConnect()
  .then(() => {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {});
  })
  .catch((err) => {
    process.exit(1);
  });

export default server;