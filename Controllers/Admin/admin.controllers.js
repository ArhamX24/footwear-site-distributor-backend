import AdminModel from "../../Models/Admin.model.js";
import zod from "zod"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import statuscodes from "../../Utils/statuscodes.js";
import userModel from "../../Models/distributor.model.js";
import purchaseProductModel from "../../Models/Purchasedproduct.model.js";
import finalOrderPerforma from "../../Utils/finalOrderPerforma.js";
import Festive from "../../Models/Festivle.model.js";
import { uploadOnCloudinary } from "../../Utils/cloudinary.js";

const validationSchema = zod.object({
    phoneNo: zod
      .string()
      .refine((val) => val.toString().length === 10, {
        message: "Phone number must be 10 digits",
      }),
    password: zod
      .string()
});

const loginValidationSchema = zod.object({
    phoneNo: zod
      .string()
      .refine((val) => val.toString().length === 10, {
        message: "Phone number must be 10 digits",
      }),
    password: zod
    .string()
})

const distributorValidationSchema = zod.object({

  billNo: zod.number({
    required_error: "Bill number is required",
    invalid_type_error: "Bill number must be a number"
  }),
  
  partyName: zod.string({
    required_error: "Party name is required",
    invalid_type_error: "Party name must be a string"
  }).min(1, "Party name cannot be empty"),
  
  transport: zod.string({
    required_error: "Transport is required",
    invalid_type_error: "Transport must be a string"
  }).min(1, "Transport information cannot be empty"),
  
})

let cookieOption = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: 'none'
}

const register = async (req,res) => {
    try {
        let userdata = req?.body

        let checkData = validationSchema.safeParse({phoneNo: userdata.phoneNo, password: userdata.password});

        if(!checkData.success){
            return res.status(statuscodes.badRequest).send({result: false, message: checkData.error.errors[0].message, error: checkData.error})
        }

        let alreadyInDb = await AdminModel.findOne({phoneNo: userdata.phoneNo})

        if(alreadyInDb){
            return res.status(statuscodes.notFound).send({result: false, message: "Account With This Phone Number Already Exists"})
        }

        await AdminModel.create({
            phoneNo: userdata.phoneNo,
            password: userdata.password,
            role: "admin"
        })

        return res.status(statuscodes.success).send({result: true, message: "Admin Created"})
    } catch (error) {
        console.error(error)
        return res.status(statuscodes.serverError).send({result: false, message: "Error Creating Admin. Please Try Again Later"})
    }
}

const login = async (req,res) => {
    try {
        let userdata = req?.body

        let checkData = loginValidationSchema.safeParse({phoneNo: userdata.phoneNo, password: userdata.password});

        if(!checkData.success){
            return res.status(statuscodes.badRequest).send({result: false, message: checkData.error.errors[0].message})
        }

        let alreadyInDb = await AdminModel.findOne({phoneNo: userdata.phoneNo}).select("-refreshToken")

        if(!alreadyInDb){
            return res.status(statuscodes.notFound).send({result: false, message: "Account Not Found"})
        }

        let comparePassword = await bcrypt.compare(userdata.password, alreadyInDb.password)

        if(!comparePassword){
            return res.status(statuscodes.unauthorized).send({result:false, message: "Incorrect Password"})
        }

        const accessToken = jwt.sign({
            _id: alreadyInDb._id ,phoneNo: alreadyInDb.phoneNo, role: "admin"}
            ,process.env.ACCESS_JWT_SECRET, 
            {expiresIn: process.env.ACCESS_JWT_EXPIRY
        })

        const refreshToken = jwt.sign({
            _id: alreadyInDb._id,
            phoneNo: alreadyInDb.phoneNo,
            role: "admin"
        },process.env.REFRESH_JWT_SECRET,
        {expiresIn: process.env.REFRESH_JWT_EXPIRY}
        )

        await AdminModel.updateOne(
            { _id: alreadyInDb._id}, 
            { $set: { refreshToken: refreshToken } }
        );

        return res.status(statuscodes.success).cookie("accessToken", accessToken, cookieOption).cookie("refreshToken", refreshToken, cookieOption).send({result: true, message: "Login Success", role: "admin"})

    } catch (error) {
        console.error(error)
        return res.status(statuscodes.serverError).send({result: false, message: "Error Logging In. Please Try Again Later"})
    }
}



const getAdmin = async (req,res) => {
    try {
        let admin = req.admin

        return res.status(statuscodes.success).send({result: true, message: "Admin Data Found", admin})
    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error in Getting Admin. Please Try Again Later"})
    }
}

const addDistributor = async (req,res) => {
    try {
        let {billNo, partyName,transport, phoneNo, password } = req?.body;

        let numBillNo = Number(billNo);
        partyName = partyName ? partyName.trim() : "";
        transport = transport ? transport.trim() : "";
        password = password ? password.trim() : "";

        let checkData = distributorValidationSchema.safeParse({billNo: numBillNo, partyName, transport, phoneNo, password});

        if(!checkData.success){
            return res.status(statuscodes.badRequest).send({result: false, message: checkData.error.errors[0].message, error: checkData.error})
        }

        let alreadyInDb = await userModel.findOne({phoneNo})

        if(alreadyInDb){
            return res.status(statuscodes.badRequest).send({result: false, message: "Distributor Already Exists"})
        }

        await userModel.create({
            billNo: numBillNo,
            partyName,
            transport,
            phoneNo,
            password,
            role: "distributor"
        })

        return res.status(statuscodes.success).send({result: true, message: "Distributor Created"})

    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error in Adding Distributor. Please Try Again Later"})
    }
}

const addFestivleImage = async (req, res) => {
    try {
        let { startDate, endDate } = req.body;

        startDate = new Date(startDate);
        endDate = new Date(endDate);

        if (!req.file || !req.file.path) {
            return res.status(statuscodes.badRequest).send({ 
                result: false, message: "Please Upload an Image" 
            });
        }

        // ✅ Upload single image to Cloudinary
        let uploadResult;
        try {
            uploadResult = await uploadOnCloudinary(req.file.path);
        } catch (uploadError) {
            return res.status(statuscodes.badRequest).send({ 
                result: false, message: "Image Failed to Upload. Please Try Again Later" 
            });
        }

        await Festive.create({
            startDate,
            endDate,
            image: uploadResult.secure_url // ✅ Save Cloudinary URL in the database
        });

        return res.status(statuscodes.success).send({ 
            result: true, message: "Festival Image Uploaded Successfully",
            imageUrl: uploadResult.secure_url
        });

    } catch (error) {
        console.error("Error Adding Festive Image:", error);
        return res.status(statuscodes.serverError).send({ 
            result: false, message: "Error in Adding Festival Image. Please Try Again Later" 
        });
    }
};

const getFestivleImages = async (req, res) => {
    try {
        let festiveImages = await Festive.find({}, "image"); // ✅ Select only image field

        if (!festiveImages || festiveImages.length === 0) {
            return res.status(statuscodes.success).send({
                result: false, message: "No Festival Images Added"
            });
        }

        // ✅ Extract image URLs only
        let imageUrls = festiveImages.map((festival) => festival.image);

        return res.status(statuscodes.success).send({
            result: true, message: "Festival Images Retrieved", imageUrls
        });
    } catch (error) {
        return res.status(statuscodes.serverError).send({
            result: false, message: "Error in Getting Festival Images. Please Try Again Later"
        });
    }
};

const deleteDistributor = async (req,res) => {
    try {
        let distributorid = req?.params.id

        let distributorInTable = await userModel.findById(distributorid)

        if(!distributorInTable){
            return res.status(statuscodes.badRequest).send({result: false, message: "Distributor Not Found"})
        }

        await userModel.findByIdAndDelete(distributorid)

        return res.status(statuscodes.success).send({result: true, message: "Distributor Removed"})
    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error in Adding Distributor. Please Try Again Later"})
    }
}

const getDistributors = async (req,res) => {
    try {
        let distributors = await userModel.find({})

        if(!distributors){
            return res.status(statuscodes.noContent).send({result: false, message: "No Distributors Added"})
        }

        return res.status(statuscodes.success).send({result: true, message: "Distributors Found", data: distributors})

    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error in Getting Distributor. Please Try Again Later"})
    }
}

const updateDistributor = async (req,res) => {
    try {
        let distributorid = req?.params.id
        let newData = req?.body

        let distributorInDb = await userModel.findById(distributorid)

        if(!distributorInDb){
            return res.status(statuscodes.badRequest).send({result: false, message: "Distributor Not Found"})
        }

        let validateData = distributorValidationSchema.safeParse(newData)

        if(!validateData.success){
            return res.status(statuscodes.badRequest).send({result: false, message: validateData.error.errors[0].message, error: validateData.error})
        }

        await userModel.findByIdAndUpdate(distributorid, newData, {new: true})

        return res.status(statuscodes.success).send({result: true, message: "Distributor Updated"})
    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error in Updating Distributor. Please Try Again Later"})
    }
}

let generateOrderPerforma = async (req, res) => {
try {
    const { orderId } = req.params;
    // Find the order in the database.
    const order = await purchaseProductModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    // Generate and stream the PDF.
    finalOrderPerforma(order, res);
  } catch (error) {
    res.status(500).json({
      message: "Error generating order performa. Please try again.",
      error: error.message
    });
  }
}


export {register, login, getAdmin, addDistributor, deleteDistributor, getDistributors, updateDistributor, generateOrderPerforma, addFestivleImage, getFestivleImages}