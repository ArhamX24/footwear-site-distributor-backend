import mongoose from "mongoose";

const { model, Schema } = mongoose;

// Keep your existing nested product schema as-is
const articleSchema = new Schema({
  name: { type: String, required: true },
  colors: [{ type: String }],
  sizes: [{ type: String }],
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
  allColorsAvailable: { type: Boolean, default: false },

  quantity: { type: Number, default: 0 },
  scannedHistory: [{
    qrCodeId: { type: Schema.Types.ObjectId, ref: 'QRCode' },
    scannedAt: { type: Date, default: Date.now },
    scannedBy: String,
    event: { type: String, enum: ['received', 'shipped', 'verified', 'damaged'] },
    location: String,
    notes: String
  }],

  qrTracking: {
    totalQRsGenerated: { type: Number, default: 0 },
    activeQRs: { type: Number, default: 0 },
    lastQRGenerated: { type: Date }
  }
});

const variantSchema = new Schema({
  name: { type: String, required: true },
  articles: [articleSchema]
});

const productSchema = new Schema({
  segment: { type: String, required: true },
  variants: [variantSchema]
}, { timestamps: true });

const productModel = model("Product", productSchema);

// Simplified QRCode schema that includes batch info within it
const qrCodeSchema = new Schema({
  uniqueId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variantName: { type: String, required: true },
  articleName: { type: String, required: true },

  // Combine batch info here if needed
  batchId: { type: String },  // optional or generated per group

  qrData: {
    type: String, // JSON stringified data or plain object if preferred
    required: true
  },
  qrImagePath: String, // path to saved QR image file or URL

  status: {
    type: String,
    enum: ['active', 'scanned', 'damaged', 'expired', 'deactivated'],
    default: 'active'
  },

  scans: [{
    scannedAt: { type: Date, default: Date.now },
    scannedBy: {
      userId: String,
      userType: { type: String, enum: ['admin', 'customer', 'retailer'] }
    },
    event: {
      type: String,
      enum: ['verification', 'purchase', 'delivery', 'return', 'inspection'],
      default: 'verification'
    },
    notes: String
  }],

  totalScans: { type: Number, default: 0 },
  firstScannedAt: Date,
  lastScannedAt: Date,

  expiresAt: Date,

}, { timestamps: true });

const QRCode = model('QRCode', qrCodeSchema);

export { productModel as Product, QRCode };
export default productModel;
