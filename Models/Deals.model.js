import mongoose from "mongoose";
import productModel from "./Product.model.js";

let {model, Schema} = mongoose;

const DealsSchema = new Schema({
    articleId: {type: Schema.Types.ObjectId, ref: 'Product'},
    articleName: {type: String},
    startDate: { 
      type: Date, 
    },
    endDate: { 
      type: Date, 
    },
    image: {type: String},
    noOfPurchase: {type: String},
    reward: { 
        type: String, 
    },
    expireAt: { 
      type: Date, 
    },
},{ timestamps: true });



const dealsModel = model('Deal', DealsSchema)

export default dealsModel

