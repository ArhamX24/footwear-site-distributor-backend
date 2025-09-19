// models/Inventory.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const inventoryItemSchema = new Schema({
  qrCodeId: { type: Schema.Types.ObjectId, ref: 'QRCode', required: true, unique: true },
    uniqueId: { type: String, required: true, unique: true },
    articleName: { type: String, required: true },
    articleDetails: {
        colors: [String],
        sizes: [Number],
        numberOfCartons: { type: Number, default: 1 }, // ✅ Default to 1 as each item is one carton
        articleId: { type: Schema.Types.ObjectId }
    },
    status: {
        type: String,
        enum: ['received', 'shipped', 'delivered'], // ✅ Reflects post-manufacturing states
        default: 'received'
    },
  receivedAt: Date,
  shippedAt: Date,
  receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  shippedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  distributorId: { type: Schema.Types.ObjectId, ref: 'User' },
  notes: String
}, { timestamps: true });

const inventorySchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
  
  quantityByStage: {
    received: { type: Number, default: 0 },
    shipped: { type: Number, default: 0 }
  },
  
  availableQuantity: { type: Number, default: 0, min: 0 },
  items: [inventoryItemSchema],
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// ✅ Helper function to format sizes as range
const formatSizeRange = (sizes) => {
  if (!sizes || sizes.length === 0) return 'N/A';
  if (sizes.length === 1) return sizes[0].toString();
  
  const sortedSizes = [...sizes].sort((a, b) => a - b);
  return `${sortedSizes[0]}X${sortedSizes[sortedSizes.length - 1]}`;
};

inventorySchema.pre('save', function(next) {
    this.quantityByStage.received = this.items.filter(i => i.status === 'received').length;
    this.quantityByStage.shipped = this.items.filter(i => i.status === 'shipped').length;
    
    // Available quantity is now correctly calculated as received minus shipped
    this.availableQuantity = this.quantityByStage.received - this.quantityByStage.shipped;
    
    this.lastUpdated = new Date();
    next();
});

// ✅ Updated syncWithQRCode method
inventorySchema.methods.syncWithQRCode = async function(qrCodeId) {
  const QRCode = mongoose.model('QRCode');
  const qrCode = await QRCode.findById(qrCodeId);
  if (!qrCode) throw new Error('QRCode not found');

  let status = 'received';
  if (qrCode.status === 'shipped') {
    status = 'shipped';
  }

  let articleName = qrCode.articleName
    || qrCode.contractorInput?.articleName
    || qrCode.productReference?.articleName
    || 'Unknown Article';

  let articleId = qrCode.contractorInput?.articleId 
    || qrCode.productReference?.articleId;

  const idx = this.items.findIndex(i => i.qrCodeId.toString() === qrCodeId.toString());

  const baseItem = {
    qrCodeId: qrCode._id,
    uniqueId: qrCode.uniqueId,
    articleName,
    articleDetails: {
      colors: qrCode.contractorInput?.colors || ['Unknown'], // ✅ Array
      sizes: qrCode.contractorInput?.sizes || [0], // ✅ Array of numbers
      numberOfCartons: qrCode.contractorInput?.totalCartons || 1,
      articleId: articleId
    },
    status,
    receivedAt: qrCode.warehouseDetails?.receivedAt,
    shippedAt: qrCode.shipmentDetails?.shippedAt || (status === 'shipped' ? new Date() : null),
    receivedBy: qrCode.warehouseDetails?.receivedBy?.userId,
    shippedBy: qrCode.shipmentDetails?.shippedBy?.userId,
    distributorId: qrCode.shipmentDetails?.distributorId,
    notes: qrCode.notes || ''
  };

  if (idx === -1) {
    this.items.push(baseItem);
  } else {
    Object.assign(this.items[idx], baseItem);
  }

  this.quantityByStage.received = this.items.filter(i => i.status === 'received').length;
  this.quantityByStage.shipped = this.items.filter(i => i.status === 'shipped').length;
  this.availableQuantity = this.quantityByStage.received;
  this.lastUpdated = new Date();

  return this.save();
};

inventorySchema.index({ productId: 1 });
inventorySchema.index({ 'items.qrCodeId': 1 });
inventorySchema.index({ 'items.uniqueId': 1 });
inventorySchema.index({ 'items.status': 1 });
inventorySchema.index({ 'items.distributorId': 1 });

const Inventory = model('Inventory', inventorySchema);

export default Inventory;

