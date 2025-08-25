// inventory.model.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const inventoryItemSchema = new Schema({
  qrCodeId: {
    type: Schema.Types.ObjectId,
    ref: 'QRCode',
    required: true
  },
  uniqueId: {
    type: String,
    required: true
  },
  articleName: {
    type: String,
    required: true
  },
  articleDetails: {
    type: Schema.Types.Mixed, // Store complete article data
    required: true
  },
  receivedAt: {
    type: Date,
    required: true
  },
  receivedBy: {
    userId: String,
    userType: String
  },
  receivedLocation: {
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  status: {
    type: String,
    enum: ['received', 'in_stock', 'reserved', 'shipped'],
    default: 'received'
  },
  notes: String
}, { timestamps: true });

const inventorySchema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    unique: true
  },
  totalQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  availableQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  items: [inventoryItemSchema], // Array of individual articles
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Update quantities before saving
inventorySchema.pre('save', function(next) {
  this.totalQuantity = this.items.length;
  this.availableQuantity = this.items.filter(item => 
    item.status === 'received' || item.status === 'in_stock'
  ).length;
  this.lastUpdated = new Date();
  next();
});

// Index for better performance
inventorySchema.index({ productId: 1 });
inventorySchema.index({ 'items.qrCodeId': 1 });
inventorySchema.index({ 'items.uniqueId': 1 });

const Inventory = model('Inventory', inventorySchema);

export default Inventory;
