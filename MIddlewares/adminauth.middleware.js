import jwt from "jsonwebtoken"
import AdminModel from "../Models/Admin.model.js"
import statusCodes from "../Utils/statuscodes.js"

const adminAuth = async (req,res,next) => {
    try {
        let token = req?.cookies?.Token
        
        if(!token){
            return res.status(statusCodes.unauthorized).send({result: false, message: "Unauthorized"})
        }

        let verifyToken = jwt.verify(token, process.env.JWT_SECRET)

        if(!verifyToken){
            return res.status(statusCodes.unauthorized).send({result: false, message: "Invalid Token"})
        }

        let admin = await AdminModel.findOne({email: verifyToken.email})

        if(admin.role !== "admin"){
            return res.status(statusCodes.unauthorized).send({result: false, message: "Unauthorized"})
        }

        req.admin = admin
        next()
    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: error.message})
    }
}

export default adminAuth