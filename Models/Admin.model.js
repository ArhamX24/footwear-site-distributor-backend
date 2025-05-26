import mongoose from "mongoose";
import bcrypt from "bcrypt"

let {model, Schema} = mongoose

let AdminSchema = new Schema({
    firstname: {type: String},
    lastname: {type: String},
    email: {type: String, required: true, unique: true},
    phoneNo: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    role: {type: String, required: true}
})

AdminSchema.pre("save", async function (next) {
    let user = this

    if(!user.isModified('password')){
        return next()
    }

    try {
        let salt = await bcrypt.genSalt(10);
        let hashedPass = await bcrypt.hash(user.password, salt)
        user.password = hashedPass
        next()
    } catch (error) {
        console.log(error)
    }
})

const AdminModel = model("Admin", AdminSchema)

export default AdminModel