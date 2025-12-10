import mongoose from "mongoose";

let {model, Schema} = mongoose;

let PurchaseproductSchema = new Schema({
    orderId: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(), 
    unique: true,
    },
    distributorId: {type: mongoose.Types.ObjectId, ref: 'Distributor', required: true},
    orderDate: { type: Date, default: Date.now },
    partyName: {type: String, required: true},
    phoneNo: {type: String, required: true},  // Changed to String
    transportSource: {type: String},  // ✅ NEW FIELD
    items: [{
        articleName: {type: String},
        articleImg: {type: String},
        productid: {type: mongoose.Types.ObjectId, ref: "Product"},
        totalCartons: {type: Number, required: true},
        colors: [{type: String}],
        sizes: {type: String},
        variant: {type: String},
        segment: {type: String},
        claimedDeal: {type: Boolean, default: false},
        dealReward: {type: String, default: ''},
    }],
    isFulfiled: {type: Boolean, default: false}
}, {timestamps: true})

const purchaseProductModel = model("Purchases", PurchaseproductSchema)

export default purchaseProductModel
