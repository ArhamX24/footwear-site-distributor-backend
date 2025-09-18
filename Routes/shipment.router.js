// routes/shipment.router.js (NEW)
import express from "express";
import { shipmentOnly } from "../MIddlewares/roleauth.middleware.js"
import { scanQRCode, generateShipmentReceiptPDF, getAllShipments, getShipmentDetails } from "../Controllers/Admin/admin.controllers.js";

const shipmentRouter = express.Router();

shipmentRouter.post("/scan/:uniqueId", shipmentOnly, scanQRCode)
.post('/receipt/generate', generateShipmentReceiptPDF)
.get('/api/v1/shipment/all', getAllShipments)
.get('/api/v1/shipment/details/:id', getShipmentDetails)

export default shipmentRouter;

