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
    type: Schema.Types.Mixed,
    required: true
  },
  
  // Manufacturing stage
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
  
  // Warehouse receipt stage
  receivedAt: Date,
  receivedBy: {
    userId: String,
    userType: String,
    name: String
  },
  receivedLocation: {
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Distributor shipment stage
  shippedAt: Date,
  shippedBy: {
    userId: String,
    userType: String,
    name: String
  },
  distributorDetails: {
    distributorId: { type: Schema.Types.ObjectId, ref: 'Distributor' },
    distributorName: String,
    trackingNumber: String
  },
  
  status: {
    type: String,
    enum: ['manufactured', 'in_warehouse', 'shipped_to_distributor', 'delivered', 'damaged', 'returned'],
    default: 'manufactured'
  },
  
  // Journey tracking
  lifecycle: [{
    stage: {
      type: String,
      enum: ['manufactured', 'received_warehouse', 'shipped_distributor']
    },
    timestamp: Date,
    location: String,
    performedBy: String,
    notes: String
  }],
  
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
  
  // Breakdown by lifecycle stage
  quantityByStage: {
    manufactured: { type: Number, default: 0 },
    in_warehouse: { type: Number, default: 0 },
    shipped_to_distributor: { type: Number, default: 0 }
  },
  
  availableQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  items: [inventoryItemSchema],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Update quantities before saving
inventorySchema.pre('save', function(next) {
  this.totalQuantity = this.items.length;
  
  // Calculate quantities by stage
  this.quantityByStage.manufactured = this.items.filter(item => 
    item.status === 'manufactured'
  ).length;
  
  this.quantityByStage.in_warehouse = this.items.filter(item => 
    item.status === 'in_warehouse'
  ).length;
  
  this.quantityByStage.shipped_to_distributor = this.items.filter(item => 
    item.status === 'shipped_to_distributor'
  ).length;
  
  this.availableQuantity = this.quantityByStage.in_warehouse;
  this.lastUpdated = new Date();
  next();
});

// Index for better performance
inventorySchema.index({ productId: 1 });
inventorySchema.index({ 'items.qrCodeId': 1 });
inventorySchema.index({ 'items.uniqueId': 1 });
inventorySchema.index({ 'items.status': 1 });

const Inventory = model('Inventory', inventorySchema);

export default Inventory;
