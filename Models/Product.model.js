import mongoose from "mongoose";

const { model, Schema } = mongoose;

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
    event: { type: String, enum: ['manufactured', 'received', 'shipped', 'verified', 'damaged'] },
    location: String,
    notes: String
  }],

  qrTracking: {
    totalQRsGenerated: { type: Number, default: 0 },
    activeQRs: { type: Number, default: 0 },
    manufacturedQRs: { type: Number, default: 0 },
    receivedQRs: { type: Number, default: 0 },
    shippedQRs: { type: Number, default: 0 },
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

// Updated QRCode schema
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
  batchId: { type: String },

  qrData: {
    type: String,
    required: true
  },
  qrImagePath: String,

  // Updated status to track manufacturing lifecycle
  status: {
    type: String,
    enum: ['generated', 'manufactured', 'received', 'shipped', 'damaged', 'expired', 'deactivated'],
    default: 'generated'
  },

  // Manufacturing tracking
  manufacturingDetails: {
    manufacturedAt: Date,
    manufacturedBy: {
      userId: String,
      userType: String,
      name: String
    },
    manufacturingLocation: {
      address: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    qualityCheck: {
      passed: { type: Boolean, default: false },
      checkedBy: String,
      notes: String
    }
  },

  // Warehouse receipt tracking
  warehouseDetails: {
    receivedAt: Date,
    receivedBy: {
      userId: String,
      userType: String,
      name: String
    },
    warehouseLocation: {
      address: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    conditionOnReceipt: {
      type: String,
      enum: ['good', 'damaged', 'incomplete'],
      default: 'good'
    }
  },

  // Distributor shipment tracking
  distributorDetails: {
    shippedAt: Date,
    shippedBy: {
      userId: String,
      userType: String,
      name: String
    },
    distributorId: {
      type: Schema.Types.ObjectId,
      ref: 'Distributor'
    },
    distributorName: String,
    trackingNumber: String,
    estimatedDelivery: Date
  },

  scans: [{
    scannedAt: { type: Date, default: Date.now },
    scannedBy: {
      userId: String,
      userType: { type: String, enum: ['admin', 'manufacturer', 'warehouse', 'distributor', 'customer'] },
      name: String
    },
    event: {
      type: String,
      enum: ['manufactured', 'received', 'shipped', 'quality_check', 'verification'],
      required: true
    },
    location: {
      address: String,
      coordinates: {
        latitude: Number,
        longitude: Number
      }
    },
    notes: String,
    metadata: Schema.Types.Mixed // For additional scan-specific data
  }],

  totalScans: { type: Number, default: 0 },
  firstScannedAt: Date,
  lastScannedAt: Date,
  expiresAt: Date,

}, { timestamps: true });

const QRCode = model('QRCode', qrCodeSchema);

export { productModel as Product, QRCode };
export default productModel;
