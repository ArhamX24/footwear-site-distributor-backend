import mongoose from "mongoose";
import bcrypt from 'bcrypt'

let {model, Schema} = mongoose

let UserSchema = new Schema({
    billNo: {type: Number, required: true},
    partyName: {type: String, required: true},
    purchases: [{type: mongoose.Types.ObjectId, ref: 'Product'}],
    transport:{type: String, required: true},
    phoneNo: {type: String, required: true, unique: true},
    password: {type: String, required: true},
    role: {type: String, default: 'distributor'},
    refreshToken: {type: String}
})

UserSchema.pre("save", async function (next) {
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

const userModel = model('User', UserSchema)

export default userModel