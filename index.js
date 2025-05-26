import express from "express";
import "dotenv/config"
import cors from "cors"
import cookieParser from "cookie-parser";
import dbConnect from "./DB/DbConnect.js";
import adminRouter from "./Routes/admin.router.js";
import userRouter from "./Routes/user.router.js";


const server = express()

server.use(express.json())
server.use(express.urlencoded({extended: true}))
server.use(cookieParser())
server.use(cors({
    origin: "https://pinkey-demo.netlify.app",
    credentials: true
}))


server.use("/api/v1/admin", adminRouter)
server.use("/api/v1/distributor", userRouter)

dbConnect().then(()=>{
    server.listen(process.env.PORT)
    console.log("Connected")
}).catch((err)=>{
    console.log(err)
})







