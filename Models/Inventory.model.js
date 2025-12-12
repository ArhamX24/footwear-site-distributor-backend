// Models/Inventory.model.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const InventorySchema = new Schema({
  articleId: {
    type: String,
    required: true,
    unique: true
  },
  articleName: {
    type: String,
    required: true
  },
  segment: {
    type: String,
    default: 'Unknown'
  },
  articleImage: {
    type: String,
    default: null
  },
  
  receivedQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  shippedQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  availableQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // ✅ CRITICAL FIX: Add _id: false to prevent auto-indexing
  qrCodes: [{
    _id: false,  // ✅ This stops Mongoose from creating indexes
    qrCodeId: {
      type: Schema.Types.ObjectId,
      ref: 'QRCode',
      required: true
    },
    uniqueId: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['received', 'shipped'],
      default: 'received'
    },
    receivedAt: {
      type: Date,
      default: Date.now
    },
    shippedAt: {
      type: Date,
      default: null
    }
  }],
  
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  autoIndex: false  // ✅ Disable automatic index creation
});

// ✅ Only define top-level indexes (NO subdocument indexes)
InventorySchema.index({ articleId: 1 }, { unique: true });
InventorySchema.index({ articleName: 1 });
InventorySchema.index({ segment: 1 });

// ❌ DO NOT add index on qrCodes subdocument fields
// InventorySchema.index({ 'qrCodes.uniqueId': 1 }); // REMOVE THIS

InventorySchema.methods.syncWithQRCode = async function(qrCodeId) {
  console.log(`[INVENTORY] Syncing with QR: ${qrCodeId}`);

  try {
    const QRCode = mongoose.model('QRCode');
    const qrCode = await QRCode.findById(qrCodeId);

    if (!qrCode) {
      throw new Error(`QR code not found: ${qrCodeId}`);
    }

    const qrIdString = qrCodeId.toString();
    const existingIndex = this.qrCodes.findIndex((qr) => qr.qrCodeId.toString() === qrIdString);

    if (existingIndex === -1) {
      if (qrCode.status === 'received') {
        this.qrCodes.push({
          qrCodeId: qrCodeId,
          uniqueId: qrCode.uniqueId,
          status: 'received',
          receivedAt: new Date(),
          shippedAt: null
        });
        
        this.receivedQuantity += 1;
        this.availableQuantity += 1;
      }
    } else {
      const existingQR = this.qrCodes[existingIndex];

      if (existingQR.status === 'received' && qrCode.status === 'shipped') {
        this.qrCodes[existingIndex].status = 'shipped';
        this.qrCodes[existingIndex].shippedAt = new Date();
        
        if (this.availableQuantity > 0) {
          this.shippedQuantity += 1;
          this.availableQuantity -= 1;
        }
      }
    }

    this.markModified('qrCodes');
    this.lastUpdated = new Date();

    await this.save();
    console.log('[INVENTORY] ✅ Saved');

    return {
      success: true,
      receivedQuantity: this.receivedQuantity,
      shippedQuantity: this.shippedQuantity,
      availableQuantity: this.availableQuantity
    };

  } catch (error) {
    console.error('[INVENTORY] ❌ Error:', error);
    throw error;
  }
};

const Inventory = model('Inventory', InventorySchema);

export default Inventory;
