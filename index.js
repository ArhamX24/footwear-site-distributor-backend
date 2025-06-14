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

const server = express()

server.use(express.json())
server.use(express.urlencoded({extended: true}))
server.use(cookieParser())
server.use(cors({
    origin: "http://www.pinkeyfootwear.in",
    // origin: "http://localhost:5173",
    credentials: true
}))

cron.schedule("0 * * * *", async () => { // ✅ Runs every hour
    try {
        let expiredDeals = await dealsModel.find({ expireAt: { $lt: new Date() } });

        if (expiredDeals.length > 0) {
            await Promise.all(expiredDeals.map(async (deal) => {
                await productModel.updateOne(
                    { articleId: deal.articleId },
                    { $set: { inDeal: false, deal: {} } } // ✅ Resets product state
                );
            }));

            await dealsModel.deleteMany({ expireAt: { $lt: new Date() } });
            console.log(`Cleaned up ${expiredDeals.length} expired deals and updated products.`);
        }
    } catch (error) {
        console.error("Error in scheduled cleanup:", error);
    }
});

server.use("/api/v1/auth", AuthRouter)
server.use("/api/v1/admin", adminRouter)
server.use("/api/v1/distributor", userRouter)


dbConnect().then(()=>{
    server.listen(process.env.PORT)
    console.log("Connected")
}).catch((err)=>{
    console.log(err)
})







