import mongoose from "mongoose";

const { Schema, model } = mongoose;

const articleSchema = new Schema({
  name: { type: String, required: true },
  colors: [{ type: String, default: [] }],
  sizes: [{ type: String, default: [] }],
  images: {
    type: [String],
    required: true,
    validate: {
      validator: arr => Array.isArray(arr) && arr.length > 0,
      message: "At least one image is required per article."
    }
  },
  gender: { type: String },
  indeal: { type: Boolean, default: false },
  deal: {
    minQuantity: String,
    reward: String
  },
  allColorsAvailable: { type: Boolean, default: false }
}, { timestamps: true });

const variantSchema = new Schema({
  name: { type: String, required: true },
  articles: [articleSchema]
});

const productSchema = new Schema({
  segment: { type: String, required: true },
  variants: [variantSchema]
}, { timestamps: true });

const Product = model("Product", productSchema);

export default Product;
