import AdminModel from "../../Models/Admin.model.js";
import zod from "zod"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import statuscodes from "../../Utils/statuscodes.js";
import userModel from "../../Models/distributor.model.js";

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?#&])[A-Za-z\d@$!%*?#&]{8,}$/;

const validationSchema = zod.object({
    firstname: zod.string().nonempty("First name is required"),
    lastname: zod.string().nonempty("Last name is required"),
    email: zod.string().email("Invalid email format"),
    phoneNo: zod
      .string()
      .refine((val) => val.toString().length === 10, {
        message: "Phone number must be 10 digits",
      }),
    password: zod
      .string()
});

const loginValidationSchema = zod.object({
    email: zod.string().email("Invalid email format"),
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

        let checkData = validationSchema.safeParse({firstname: userdata.firstname, lastname: userdata.lastname,email: userdata.email, phoneNo: userdata.phoneNo, password: userdata.password});

        if(!checkData.success){
            return res.status(statuscodes.badRequest).send({result: false, message: checkData.error.errors[0].message, error: checkData.error})
        }

        let alreadyInDb = await AdminModel.findOne({email: userdata.email})

        if(alreadyInDb){
            return res.status(statuscodes.forbidden).send({result: false, message: "Email Already Exists"})
        }

        await AdminModel.create({
            firstname: userdata.firstname,
            lastname: userdata.lastname,
            email: userdata.email,
            phoneNo: userdata.phoneNo,
            password: userdata.password,
            role: "admin"
        })

        return res.status(statuscodes.success).send({result: true, message: "Admin Created"})
    } catch (error) {
        return res.status(statuscodes.serverError).send({result: false, message: "Error Creating Admin. Please Try Again Later"})
    }
}

const login = async (req,res) => {
    try {
        let userdata = req?.body

        let checkData = loginValidationSchema.safeParse({email: userdata.email, password: userdata.password});

        if(!checkData.success){
            return res.status(statuscodes.badRequest).send({result: false, message: checkData.error.errors[0].message})
        }

        let alreadyInDb = await AdminModel.findOne({email: userdata.email})

        if(!alreadyInDb){
            return res.status(statuscodes.notFound).send({result: false, message: "Email Not Found Or Incorrect Email Entered"})
        }

        let comparePassword = await bcrypt.compare(userdata.password, alreadyInDb.password)

        if(!comparePassword){
            return res.status(statuscodes.unauthorized).send({result:false, message: "Incorrect Password"})
        }

        const token = jwt.sign({email: userdata.email, password: userdata.password}, process.env.JWT_SECRET, {expiresIn: "10d"})

        return res.status(statuscodes.success).cookie("Token", token, cookieOption).send({result: true, message: "Login Success"})

    } catch (error) {
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

// const updateAdminData = async (req,res) => {
//     try {
//         let updatedData = req?.body;

//         let checkData = validationSchema.safeParse
//     } catch (error) {
//     }
// }

export {register, login, getAdmin, addDistributor, deleteDistributor, getDistributors, updateDistributor}