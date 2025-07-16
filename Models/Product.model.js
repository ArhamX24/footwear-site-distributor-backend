import mongoose from "mongoose";

let {model, Schema} = mongoose

const articleSchema = new Schema({
  name: { type: String, required: true },
  colors: [{ type: String }],
  sizes: [{ type: String }],
  images: [{ type: String, required: true }],
  gender: { type: String },
  indeal: { type: Boolean, default: false },
  deal: {
    minQuantity: String,
    reward: String
  }
});

const variantSchema = new Schema({
  name: { type: String, required: true },
  articles: [articleSchema]
});

const productSchema = new Schema({
  segment: { type: String, required: true },
  variants: [variantSchema]
}, { timestamps: true });


let productModel = model("Product", productSchema)

export default productModel
