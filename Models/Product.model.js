import mongoose from "mongoose";

let {model, Schema} = mongoose

const productSchema = new Schema({
  articleName: { type: String},
  price: { type: Number},
  category: {type: String},
  type:{type: String},
  variants:[{type: String, default: ""}],
  colors: [{ type: String}],
  sizes:[{type: String}],
  images: [{ type: String, required: true }],
  indeal:{type: Boolean, default: false},
  deal: {minQuantity: String, reward: String}
}, { timestamps: true });

let productModel = model("Product", productSchema)

export default productModel
