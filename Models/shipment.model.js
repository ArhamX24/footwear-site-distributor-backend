// models/Shipment.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const shipmentSchema = new Schema({
  shipmentId: { type: String, unique: true, required: true },
  distributorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  distributorName: { type: String, required: true },
  shippedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  shippedAt: { type: Date, default: Date.now },
  items: [{
    qrCodeId: { type: Schema.Types.ObjectId, ref: 'QRCode' },
    uniqueId: String,
    articleName: String,
    articleDetails: { 
      colors: [String], // ✅ Array
      sizes: [Number], // ✅ Array of numbers
      numberOfCartons: Number 
    },
    manufacturedAt: Date,
    receivedAt: Date,
    shippedAt: Date,
    trackingNumber: String,
    // ✅ ADD: Individual item status
    status: { 
      type: String, 
      enum: ['pending', 'shipped'], 
      default: 'pending' 
    }
  }],
  totalCartons: { type: Number, default: 0 },
  // ✅ FIXED: Only two status types as requested
  status: { 
    type: String, 
    enum: ['active', 'completed'], // active = pending, completed = shipped
    default: 'active' 
  }
}, { timestamps: true });

const Shipment = model('Shipment', shipmentSchema);

export default Shipment;
