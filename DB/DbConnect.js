import mongoose from "mongoose";

const dbConnect = async () => {
    await mongoose.connect(process.env.MONNGO_DB_URI)
}

export default dbConnect

