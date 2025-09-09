// routes/shipment.router.js (NEW)
import express from "express";
import { shipmentOnly } from "../MIddlewares/roleauth.middleware.js"
import { scanQRCode, generateShipmentReceiptPDF } from "../Controllers/Admin/admin.controllers.js";

const shipmentRouter = express.Router();

shipmentRouter.post("/scan/:uniqueId", shipmentOnly, scanQRCode)
.post('/receipt/generate', generateShipmentReceiptPDF)

// shipmentRouter.post("/create-shipment", shipmentOnly, createShipment);
// shipmentRouter.get("/dashboard", shipmentOnly, getShipmentDashboard);

export default shipmentRouter;
