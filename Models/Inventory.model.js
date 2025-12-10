import mongoose from "mongoose";

const { Schema, model } = mongoose;

const inventoryItemSchema = new Schema({
  qrCodeId: { type: Schema.Types.ObjectId, ref: "QRCode", required: true, unique: true },
  uniqueId: { type: String, required: true, unique: true },
  articleName: { type: String, required: true },
  articleDetails: {
    colors: [String],
    sizes: [Number],
    numberOfCartons: { type: Number, default: 1 }, // ✅ This is the key field
    articleId: { type: Schema.Types.ObjectId, ref: "Product" }
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

const inventorySchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, unique: true },
  quantityByStage: {
    received: { type: Number, default: 0 },
    shipped: { type: Number, default: 0 }
  },
  availableQuantity: { type: Number, default: 0, min: 0 },
  items: [inventoryItemSchema],
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Helper function to format sizes as range
const formatSizeRange = (sizes) => {
  if (!sizes || sizes.length === 0) return "N/A";
  if (sizes.length === 1) return sizes[0].toString();
  const sortedSizes = [...sizes].sort((a, b) => a - b);
  return `${sortedSizes[0]}X${sortedSizes[sortedSizes.length - 1]}`;
};

// ✅ FIXED: Pre-save hook - Sum numberOfCartons instead of counting items
inventorySchema.pre("save", function(next) {
  // Calculate received quantity by summing numberOfCartons for received items
  this.quantityByStage.received = this.items
    .filter(i => i.status === "received")
    .reduce((sum, item) => sum + (item.articleDetails?.numberOfCartons || 1), 0);
  
  // Calculate shipped quantity by summing numberOfCartons for shipped items
  this.quantityByStage.shipped = this.items
    .filter(i => i.status === "shipped")
    .reduce((sum, item) => sum + (item.articleDetails?.numberOfCartons || 1), 0);
  
  // Available quantity = received - shipped
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

  let articleName = qrCode.articleName || 
                   qrCode.contractorInput?.articleName || 
                   qrCode.productReference?.articleName || 
                   "Unknown Article";

  let articleId = qrCode.contractorInput?.articleId || qrCode.productReference?.articleId;

  const idx = this.items.findIndex(i => i.qrCodeId.toString() === qrCodeId.toString());

  const baseItem = {
    qrCodeId: qrCode._id,
    uniqueId: qrCode.uniqueId,
    articleName,
    articleDetails: {
      colors: qrCode.contractorInput?.colors || ["Unknown"],
      sizes: qrCode.contractorInput?.sizes || [0],
      numberOfCartons: qrCode.contractorInput?.totalCartons || 1, // ✅ Get actual carton count
      articleId: articleId
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

  // ✅ FIXED: Recalculate using numberOfCartons sum
  this.quantityByStage.received = this.items
    .filter(i => i.status === "received")
    .reduce((sum, item) => sum + (item.articleDetails?.numberOfCartons || 1), 0);
  
  this.quantityByStage.shipped = this.items
    .filter(i => i.status === "shipped")
    .reduce((sum, item) => sum + (item.articleDetails?.numberOfCartons || 1), 0);
  
  this.availableQuantity = this.quantityByStage.received - this.quantityByStage.shipped;
  this.lastUpdated = new Date();

  return this.save();
};

// Indexes
inventorySchema.index({ productId: 1 });
inventorySchema.index({ "items.qrCodeId": 1 });
inventorySchema.index({ "items.uniqueId": 1 });
inventorySchema.index({ "items.status": 1 });
inventorySchema.index({ "items.distributorId": 1 });

const Inventory = model("Inventory", inventorySchema);

export default Inventory;
