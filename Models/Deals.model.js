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


DealsSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

DealsSchema.post("findOneAndDelete", async function (deal) {
  if (deal) {
    await productModel.findByIdAndUpdate(deal.articleId, {
      $unset: { deal: {}, indeal: false }, 
    });
  }
});


const dealsModel = model('Deal', DealsSchema)

export default dealsModel

