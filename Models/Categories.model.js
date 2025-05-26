import mongoose from "mongoose";

let {model, Schema} = mongoose

const categorySchema = new Schema({
    category: {type: String, required: true},
});

const categoryModel = model('Category', categorySchema);

export default categoryModel