import mongoose from "mongoose";

let {model, Schema} = mongoose;

const DealsSchema = new Schema({
    articleId: {type: Schema.Types.ObjectId, ref: 'Product', required: true},
    articleName: {type: String, required: true},
    startDate: { 
      type: Date, 
      required: true 
    },
    endDate: { 
      type: Date, 
      required: true 
    },
    image: {type: String},
    noOfPurchase: {type: String},
    reward: { 
        type: String, 
        required: true 
    },
    expireAt: { 
      type: Date, 
      required: true 
    },
},{ timestamps: true });


DealsSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const dealsModel = model('Deal', DealsSchema)

export default dealsModel

