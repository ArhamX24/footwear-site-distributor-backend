import mongoose from "mongoose";

let {Schema, model} = mongoose;

let VariantsSchema = new Schema({
    articleName: {type: String},
    variantName: {type: String},
    imagesUrls: [{type: String}],
    category: {type: String},
    type: {type: String},
    price: {type: Number},
    sizes: [{type: String}],
    colors: [{type: String}],
})

let Variants = model('Variant', VariantsSchema);

export default Variants