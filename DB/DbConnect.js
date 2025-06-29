import mongoose from "mongoose";

const dbConnect = async () => {
    await mongoose.connect(process.env.MONNGO_DB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000
})}

export default dbConnect

