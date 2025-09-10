import userModel from "../Models/user.model.js";
import jwt from 'jsonwebtoken'
import mongoose from "mongoose";

let statusCodes = {
    success: 200,
    noContent:204,
    badRequest: 400,
    unauthorized: 403,
    notFound: 404,
    serverError: 500,
    forbidden: 402
}


const userAuth = async (req,res,next) => {
    try {
        let token = req?.cookies?.accessToken

        if(!token){
            return res.status(statusCodes.unauthorized).send({result: false, message: "Unauthorized"})
        }

        let verifyToken = jwt.verify(token, process.env.ACCESS_JWT_SECRET)

        if(!verifyToken){
            return res.status(statusCodes.unauthorized).send({result: false, message: "Invalid Token"})
        }

        let distributor = await userModel.findOne({_id: verifyToken._id})

        if(distributor.role !== 'distributor'){
            return res.status(statusCodes.unauthorized).send({result: false, message: "Unauthorized"})
        }
        
        req.distributor = distributor
        next()

    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: error.message})
    }
}

export default userAuth