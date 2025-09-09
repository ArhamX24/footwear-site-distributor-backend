// models/QRCode.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const qrCodeSchema = new Schema({
  uniqueId: { type: String, required: true, unique: true, index: true },

  // Root article name for simpler queries
  articleName: { type: String },

  contractorInput: {
    articleName: { type: String, required: true },
    color: { type: String, required: true },
    size: { type: String, required: true },
    cartonNumber: { type: Number, required: true },
    totalCartons: { type: Number, required: true }
  },

  productReference: {
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    variantName: String,
    articleName: String,
    isMatched: { type: Boolean, default: false },
    matchedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    matchedAt: Date
  },

  qrData: { type: String, required: true },
  qrImagePath: String,

  status: {
    type: String,
    enum: ['generated', 'manufactured', 'received', 'shipped'],
    default: 'generated'
  },

  batchInfo: {
    batchId: { type: String, required: true },
    contractorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    generatedAt: { type: Date, default: Date.now }
  },

  manufacturingDetails: {
    manufacturedAt: Date,
    manufacturedBy: {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      userType: { type: String, default: 'contractor' },
      name: String
    }
  },

  warehouseDetails: {
    receivedAt: Date,
    receivedBy: {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      userType: { type: String, default: 'warehouse_inspector' },
      name: String
    }
  },

  shipmentDetails: {
    shippedAt: Date,
    shippedBy: {
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      userType: { type: String, default: 'shipment_manager' },
      name: String
    },
    distributorId: { type: Schema.Types.ObjectId, ref: 'User' },
    distributorName: String,
    shipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment' },
    trackingNumber: String,
    notes: String
  },

  scans: [{
    scannedAt: { type: Date, default: Date.now },
    scannedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    event: { type: String, enum: ['manufactured', 'received', 'shipped'], required: true },
    location: String,
    notes: String,
    qualityCheck: {
      passed: { type: Boolean, default: true },
      notes: String
    }
  }],

  // Analytics
  totalScans: { type: Number, default: 0 },
  firstScannedAt: Date,
  lastScannedAt: Date,

  needsValidation: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });


const QRCode = model('QRCode', qrCodeSchema);

export default QRCode
