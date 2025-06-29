import AdminModel from "../../Models/Admin.model.js";
import jwt from 'jsonwebtoken'
import userModel from "../../Models/distributor.model.js";
import bcrypt from "bcrypt"
import statusCodes from "../../Utils/statuscodes.js";

let cookieOption = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: 'Lax'
}

const createNewRefreshToken = async (req, res) => {
    try {
        let existingRefreshToken = req.cookies.refreshToken;

        if (!existingRefreshToken) {
            return res.status(statusCodes.unauthorized).send({ result: false, message: "Unauthorized Access" });
        }

        const decodedToken = jwt.verify(existingRefreshToken, process.env.REFRESH_JWT_SECRET);

        // Determine user role dynamically
        const Model = decodedToken.role === "admin" ? AdminModel : userModel;

        const user = await Model.findById(decodedToken._id)

        if (!user) {
            return res.status(statusCodes.unauthorized).send({ result: false, message: "Unauthorized Access" });
        }
        
        // Generate new tokens with the same role
        const accessToken = jwt.sign(
            { _id: user._id, phoneNo: user.phoneNo, role: decodedToken.role },
            process.env.ACCESS_JWT_SECRET,
            { expiresIn: process.env.ACCESS_JWT_EXPIRY }
        );

        return res.status(statusCodes.success)
            .cookie("accessToken", accessToken, cookieOption)
            .send({ result: true, message: "Access Token Refreshed"});

    } catch (error) {
        return res.status(statusCodes.serverError).send({ result: false, message: "Error in Creating Token. Please Try Again Later" });
    }
};

const login = async (req,res) => {
    try {
        const { phoneNo, password } = req.body;

        // Check both Admin and Distributor models
        let user = await AdminModel.findOne({ phoneNo }) || await userModel.findOne({ phoneNo });
        
        if (!user) return res.status(statusCodes.notFound).json({ result: false, message: "Account Not Found" });

        let isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(statusCodes.unauthorized).json({ result: false, message: "Incorrect Password" });

        // Generate tokens
        const accessToken = jwt.sign(
            { _id: user._id, role: user.role }, 
            process.env.ACCESS_JWT_SECRET, 
            { expiresIn: process.env.ACCESS_JWT_EXPIRY }
        );
        const refreshToken = jwt.sign(
            { _id: user._id, role: user.role }, 
            process.env.REFRESH_JWT_SECRET, 
            { expiresIn: process.env.REFRESH_JWT_EXPIRY }
        );

        // Send tokens via HttpOnly cookies
        res.cookie("accessToken", accessToken, cookieOption);
        res.cookie("refreshToken", refreshToken, cookieOption);

        return res.status(statusCodes.success).json({ result: true, message: "Login Success" , role: user.role });
    } catch (error) {
        return res.status(statusCodes.serverError).json({ result: false, message: "Login Failed" });
    }
}

const getMe = async (req,res) => {
    try {
        const token = req?.cookies.accessToken;

        if(!token){
            return res.status(statusCodes.unauthorized).json({ result: false, message: "Unauthorized" });
        }

        let decodedToken = jwt.verify(token, process.env.ACCESS_JWT_SECRET);

        const Model = decodedToken.role === "admin" ? AdminModel : userModel;

        const data = await Model.findById(decodedToken._id)

        return res.status(statusCodes.success).json({ result: true, message: "User Found", data});

    } catch (error) {
        return res.status(statusCodes.serverError).json({ result: false, message: "Error in Getting User" });
    }
}



export {createNewRefreshToken, login, getMe};

