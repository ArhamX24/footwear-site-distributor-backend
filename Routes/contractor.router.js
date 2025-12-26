import express from "express";
import { contractorOnly } from "../MIddlewares/roleauth.middleware.js";
import { generateQRCodes, downloadQRCodes, generateReceiptPdf, trackQRGeneration } from "../Controllers/Admin/contractor.controllers.js";
const contractorRouter = express.Router();

contractorRouter.post("/qr/generate", contractorOnly, generateQRCodes)
.post('/track', contractorOnly, trackQRGeneration)
.post("/qr/download", contractorOnly, downloadQRCodes)
.post('/qr/receipt', contractorOnly, generateReceiptPdf);

export default contractorRouter;
