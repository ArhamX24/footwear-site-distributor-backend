import express from "express";
import { warehouseOnly } from "../MIddlewares/roleauth.middleware.js";
import { scanQRCode, getInventoryData, getQRCodeById} from "../Controllers/Admin/admin.controllers.js";

const warehouseRouter = express.Router();

warehouseRouter.post("/scan/:uniqueId", warehouseOnly, scanQRCode);
warehouseRouter.get("/inventory", warehouseOnly, getInventoryData)
.get('/qr/:qrId', getQRCodeById)
// warehouseRouter.get("/dashboard", warehouseOnly, getWarehouseDashboard);

export default warehouseRouter;
