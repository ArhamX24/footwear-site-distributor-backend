// models/Inventory.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const inventoryItemSchema = new Schema({
  qrCodeId: { type: Schema.Types.ObjectId, ref: 'QRCode', required: true, unique: true },
  uniqueId: { type: String, required: true, unique: true },
  articleName: { type: String, required: true },
  articleDetails: {
    color: { type: String, required: true },
    size: { type: String, required: true },
    numberOfCartons: { type: Number, required: true },
    articleId: {type: Schema.Types.ObjectId}
  },
  status: {
    type: String,
    enum: ['received', 'shipped'],
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
  
  // ✅ ONLY track received and shipped quantities
  quantityByStage: {
    received: { type: Number, default: 0 },
    shipped: { type: Number, default: 0 }
  },
  
  availableQuantity: { type: Number, default: 0, min: 0 }, // Items available to ship
  items: [inventoryItemSchema],
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// ✅ Updated pre-save hook to only calculate received and shipped
inventorySchema.pre('save', function(next) {
  this.quantityByStage.received = this.items.filter(i => i.status === 'received').length;
  this.quantityByStage.shipped = this.items.filter(i => i.status === 'shipped').length;
  this.availableQuantity = this.quantityByStage.received; // Only received items are available
  this.lastUpdated = new Date();
  next();
});

// ✅ Updated syncWithQRCode method
// ✅ Enhanced syncWithQRCode method in Inventory schema
// Enhanced syncWithQRCode method in Inventory schema
inventorySchema.methods.syncWithQRCode = async function(qrCodeId) {
  const QRCode = mongoose.model('QRCode');
  const qrCode = await QRCode.findById(qrCodeId);
  if (!qrCode) throw new Error('QRCode not found');

  // Only map to 'received' or 'shipped'
  let status = 'received';
  if (qrCode.status === 'shipped') {
    status = 'shipped';
  }

  // Resolve articleName and articleId
  let articleName = qrCode.articleName
    || qrCode.contractorInput?.articleName
    || qrCode.productReference?.articleName
    || 'Unknown Article';

  // ✅ Extract articleId from QR code
  let articleId = qrCode.contractorInput?.articleId 
    || qrCode.productReference?.articleId;

  const idx = this.items.findIndex(i => i.qrCodeId.toString() === qrCodeId.toString());

  const baseItem = {
    qrCodeId: qrCode._id,
    uniqueId: qrCode.uniqueId,
    articleName,
    articleDetails: {
      color: qrCode.contractorInput?.color || 'Unknown',
      size: qrCode.contractorInput?.size || 'Unknown',
      numberOfCartons: qrCode.contractorInput?.totalCartons || 1,
      articleId: articleId // ✅ Store article ID in inventory
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

  // Recalculate counts after sync
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
