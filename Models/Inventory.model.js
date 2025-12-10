import mongoose from "mongoose";

const { Schema, model } = mongoose;

const inventoryItemSchema = new Schema({
  qrCodeId: { type: Schema.Types.ObjectId, ref: "QRCode", required: true, unique: true },
  uniqueId: { type: String, required: true, unique: true },
  articleDetails: {
    colors: [String],
    sizes: [Number],
    numberOfCartons: { type: Number, default: 1 },
  },
  status: {
    type: String,
    enum: ["received", "shipped", "delivered"],
    default: "received"
  },
  receivedAt: Date,
  shippedAt: Date,
  receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
  shippedBy: { type: Schema.Types.ObjectId, ref: "User" },
  distributorId: { type: Schema.Types.ObjectId, ref: "User" },
  notes: String
}, { timestamps: true });

// ✅ FIXED: Track by articleId instead of articleName
const inventorySchema = new Schema({
  articleId: { type: String, required: true, unique: true, index: true }, // ✅ PRIMARY KEY: contractorInput.articleId
  articleName: { type: String, required: true }, // Keep for display
  productId: { type: Schema.Types.ObjectId, ref: "Product" },
  variantId: { type: Schema.Types.ObjectId },
  segment: { type: String },
  variantName: { type: String },
  
  quantityByStage: {
    received: { type: Number, default: 0 },
    shipped: { type: Number, default: 0 }
  },
  availableQuantity: { type: Number, default: 0, min: 0 },
  items: [inventoryItemSchema],
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Pre-save hook - Count unique QR scans
inventorySchema.pre("save", function(next) {
  this.quantityByStage.received = this.items.filter(i => i.status === "received").length;
  this.quantityByStage.shipped = this.items.filter(i => i.status === "shipped").length;
  this.availableQuantity = this.quantityByStage.received - this.quantityByStage.shipped;
  this.lastUpdated = new Date();
  next();
});

// Updated syncWithQRCode method
inventorySchema.methods.syncWithQRCode = async function(qrCodeId) {
  const QRCode = mongoose.model("QRCode");
  const qrCode = await QRCode.findById(qrCodeId);

  if (!qrCode) {
    throw new Error("QRCode not found");
  }

  let status = "received";
  if (qrCode.status === "shipped") {
    status = "shipped";
  }

  const idx = this.items.findIndex(i => i.qrCodeId.toString() === qrCodeId.toString());

  const baseItem = {
    qrCodeId: qrCode._id,
    uniqueId: qrCode.uniqueId,
    articleDetails: {
      colors: qrCode.contractorInput?.colors || ["Unknown"],
      sizes: qrCode.contractorInput?.sizes || [0],
      numberOfCartons: qrCode.contractorInput?.totalCartons || 1,
    },
    status,
    receivedAt: qrCode.warehouseDetails?.receivedAt,
    shippedAt: status === "shipped" ? new Date() : null,
    receivedBy: qrCode.warehouseDetails?.receivedBy?.userId,
    shippedBy: qrCode.shipmentDetails?.shippedBy?.userId,
    distributorId: qrCode.shipmentDetails?.distributorId,
    notes: qrCode.notes
  };

  if (idx === -1) {
    this.items.push(baseItem);
  } else {
    Object.assign(this.items[idx], baseItem);
  }

  this.quantityByStage.received = this.items.filter(i => i.status === "received").length;
  this.quantityByStage.shipped = this.items.filter(i => i.status === "shipped").length;
  this.availableQuantity = this.quantityByStage.received - this.quantityByStage.shipped;
  this.lastUpdated = new Date();

  return this.save();
};

// ✅ Indexes - articleId is unique
inventorySchema.index({ articleId: 1 }, { unique: true });
inventorySchema.index({ articleName: 1 });
inventorySchema.index({ productId: 1 });
inventorySchema.index({ "items.qrCodeId": 1 });
inventorySchema.index({ "items.uniqueId": 1 });
inventorySchema.index({ "items.status": 1 });

const Inventory = model("Inventory", inventorySchema);

export default Inventory;
