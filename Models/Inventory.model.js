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

// ✅ NEW: Article-based inventory schema
const inventorySchema = new Schema({
  articleId: { type: Schema.Types.ObjectId, ref: "Product" }, // Reference to article in variants.articles
  articleName: { type: String, required: true, index: true }, // ✅ KEY: Article name as primary identifier
  productId: { type: Schema.Types.ObjectId, ref: "Product" }, // Reference to parent product
  variantId: { type: Schema.Types.ObjectId }, // Reference to variant
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

// ✅ FIXED: Pre-save hook - Count unique QR scans, not cartons
inventorySchema.pre("save", function(next) {
  // Count unique QR codes that are received (1 QR = 1 scan)
  this.quantityByStage.received = this.items.filter(i => i.status === "received").length;
  
  // Count unique QR codes that are shipped (1 QR = 1 scan)
  this.quantityByStage.shipped = this.items.filter(i => i.status === "shipped").length;
  
  // Available = received - shipped (in terms of QR scans)
  this.availableQuantity = this.quantityByStage.received - this.quantityByStage.shipped;
  
  this.lastUpdated = new Date();
  next();
});

// ✅ FIXED: Updated syncWithQRCode method
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

  // Recalculate - count unique QR scans
  this.quantityByStage.received = this.items.filter(i => i.status === "received").length;
  this.quantityByStage.shipped = this.items.filter(i => i.status === "shipped").length;
  this.availableQuantity = this.quantityByStage.received - this.quantityByStage.shipped;
  this.lastUpdated = new Date();

  return this.save();
};

// ✅ Indexes for article-based lookup
inventorySchema.index({ articleName: 1 });
inventorySchema.index({ productId: 1 });
inventorySchema.index({ articleId: 1 });
inventorySchema.index({ "items.qrCodeId": 1 });
inventorySchema.index({ "items.uniqueId": 1 });
inventorySchema.index({ "items.status": 1 });

const Inventory = model("Inventory", inventorySchema);

export default Inventory;
