import userModel from "../Models/distributor.model.js";
import jwt from 'jsonwebtoken'
import statusCodes from "../Utils/statuscodes.js";

const userAuth = async (req,res,next) => {
    try {
        let token = req?.cookies?.Token

        if(!token){
            return res.status(statusCodes.unauthorized).send({result: false, message: "Unauthorized"})
        }

        let verifyToken = jwt.verify(token, process.env.JWT_SECRET)

        if(!verifyToken){
                return res.status(statusCodes.unauthorized).send({result: false, message: "Invalid Token"})
        }

        let distributor = await userModel.findOne({phoneNo: verifyToken.phoneNo})

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