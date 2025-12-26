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
  "pinkey-demo.netlify.app",
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

server.use("/api/v1/auth", AuthRouter);
server.use("/api/v1/admin", adminRouter);
server.use("/api/v1/distributor", userRouter);
server.use("/api/v1/contractor", contractorRouter);
server.use("/api/v1/warehouse", warehouseRouter);
server.use("/api/v1/shipment", shipmentRouter);


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


dbConnect()
  .then(() => {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {});
  })
  .catch((err) => {
    process.exit(1);
  });


export default server;