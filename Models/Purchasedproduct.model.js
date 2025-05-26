import mongoose from "mongoose";

let {model, Schema} = mongoose;

let PurchaseproductSchema = new Schema({
    orderId: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(), // Ensures unique ID
    unique: true,
    },
    distributorId: {type: mongoose.Types.ObjectId, ref: 'Distributor', required: true},
    orderDate: { type: Date, default: Date.now },
    billNo: {type: Number, required: true},
    partyName: {type: String, required: true},
    phoneNo: {type: Number, required: true},
    items: [{
        articleName: {type: String},
        articleImg: {type: String},
        productid: {type: mongoose.Types.ObjectId, ref: "Product"},
        totalCartons: {type: Number, required: true},
        colors: [{type: String, required: true}],
        sizes: {type: String, required: true},
        price: {type: Number, required: true},
        totalAmount: {type: Number},
    }],
    isFulfiled: {type: Boolean}
}, {timestamps: true})

const purchaseProductModel = model("Purchases", PurchaseproductSchema)

export default purchaseProductModel