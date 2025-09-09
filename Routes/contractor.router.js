
import express from "express";
import { contractorOnly } from "../MIddlewares/roleauth.middleware.js";
import { generateQRCodes, downloadQRCodes, generateReceiptPdf } from "../Controllers/Admin/admin.controllers.js";

const contractorRouter = express.Router();

contractorRouter.post("/qr/generate", contractorOnly, generateQRCodes)
.post("/qr/download", contractorOnly, downloadQRCodes)
.post('/qr/receipt', contractorOnly, generateReceiptPdf);

export default contractorRouter;
