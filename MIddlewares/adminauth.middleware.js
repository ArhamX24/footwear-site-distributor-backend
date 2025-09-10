import jwt from "jsonwebtoken"
import AdminModel from "../Models/Admin.model.js"

let statusCodes = {
    success: 200,
    noContent:204,
    badRequest: 400,
    unauthorized: 403,
    notFound: 404,
    serverError: 500,
    forbidden: 402
}


const adminAuth = async (req,res,next) => {
    try {
        let token = req?.cookies?.accessToken;
        
        if(!token){
            return res.status(statusCodes.unauthorized).send({result: false, message: "Unauthorized"});
        }

        let verifyToken = jwt.verify(token, process.env.ACCESS_JWT_SECRET);

        if(!verifyToken){
            return res.status(statusCodes.unauthorized).send({result: false, message: "Invalid Token"});
        }

        let admin = await AdminModel.findOne({_id: verifyToken._id})

        if(admin.role !== "admin"){
            return res.status(statusCodes.unauthorized).send({result: false, message: "Unauthorized"});
        }

        req.admin = admin;
        next();
    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: error.message, error: "in adminAuth"});
    }
}

export default adminAuth