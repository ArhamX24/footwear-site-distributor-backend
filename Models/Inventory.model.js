// Models/Inventory.model.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const InventorySchema = new Schema({
  articleId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  articleName: {
    type: String,
    required: true,
    index: true
  },
  segment: {
    type: String,
    default: 'Unknown'
  },
  articleImage: {
    type: String,
    default: null
  },
  
  // Simplified quantity tracking - ONE QR = ONE UNIT
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
  
  // ✅ FIXED: Track QR codes with proper schema
  qrCodes: [{
    qrCodeId: {
      type: Schema.Types.ObjectId,
      ref: 'QRCode',
      required: true  // ✅ Make required within array items
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
  timestamps: true
});

// ✅ FIXED: Sparse unique index to avoid null duplicate errors
InventorySchema.index(
  { 'qrCodes.qrCodeId': 1 }, 
  { 
    unique: true, 
    sparse: true,  // Ignores null/missing values
    partialFilterExpression: { 
      'qrCodes.qrCodeId': { $exists: true, $ne: null } 
    }
  }
);

// ✅ Additional indexes
InventorySchema.index({ articleId: 1 });
InventorySchema.index({ articleName: 1 });
InventorySchema.index({ segment: 1 });
InventorySchema.index({ 'qrCodes.uniqueId': 1 });  // For fast uniqueId lookups

// ✅ FIXED: Improved syncWithQRCode method
InventorySchema.methods.syncWithQRCode = async function(qrCodeId) {
  console.log(`[INVENTORY] Syncing with QR: ${qrCodeId}`);

  try {
    // ✅ Fetch QR code
    const QRCode = mongoose.model('QRCode');
    const qrCode = await QRCode.findById(qrCodeId);

    if (!qrCode) {
      console.error(`[INVENTORY] ❌ QR code not found: ${qrCodeId}`);
      throw new Error(`QR code not found: ${qrCodeId}`);
    }

    console.log(`[INVENTORY] QR Status: ${qrCode.status}, UniqueID: ${qrCode.uniqueId}`);

    // ✅ Convert to string for comparison
    const qrIdString = qrCodeId.toString();
    
    // ✅ Find existing QR in array
    const existingIndex = this.qrCodes.findIndex((qr) => {
      return qr.qrCodeId.toString() === qrIdString;
    });

    console.log(`[INVENTORY] Existing index: ${existingIndex}`);

    // ========== CASE 1: QR NOT IN INVENTORY YET ==========
    if (existingIndex === -1) {
      if (qrCode.status === 'received') {
        console.log('[INVENTORY] ➕ Adding new QR as RECEIVED');
        
        this.qrCodes.push({
          qrCodeId: qrCodeId,
          uniqueId: qrCode.uniqueId,
          status: 'received',
          receivedAt: new Date(),
          shippedAt: null
        });
        
        this.receivedQuantity += 1;
        this.availableQuantity += 1;

        console.log(`[INVENTORY] ✅ Received: ${this.receivedQuantity}, Available: ${this.availableQuantity}`);
      } else if (qrCode.status === 'shipped') {
        // Edge case: QR is shipped but not in inventory (shouldn't happen in normal flow)
        console.warn('[INVENTORY] ⚠️ QR is shipped but was never received in inventory');
        
        // Add it as shipped (no available stock increase)
        this.qrCodes.push({
          qrCodeId: qrCodeId,
          uniqueId: qrCode.uniqueId,
          status: 'shipped',
          receivedAt: new Date(), // Assume it was received at some point
          shippedAt: new Date()
        });
        
        this.receivedQuantity += 1;
        this.shippedQuantity += 1;
        // availableQuantity stays 0
        
        console.log(`[INVENTORY] ⚠️ Added as shipped directly`);
      } else {
        console.log(`[INVENTORY] ⏭️ QR status "${qrCode.status}" - no action needed`);
      }
    } 
    // ========== CASE 2: QR ALREADY IN INVENTORY ==========
    else {
      const existingQR = this.qrCodes[existingIndex];
      console.log(`[INVENTORY] Found existing QR with status: ${existingQR.status}`);

      // ✅ QR was received, now being shipped
      if (existingQR.status === 'received' && qrCode.status === 'shipped') {
        console.log('[INVENTORY] 📦 Marking QR as SHIPPED');
        
        this.qrCodes[existingIndex].status = 'shipped';
        this.qrCodes[existingIndex].shippedAt = new Date();
        
        // ✅ Only deduct if available quantity > 0
        if (this.availableQuantity > 0) {
          this.shippedQuantity += 1;
          this.availableQuantity -= 1;
          console.log(`[INVENTORY] ✅ Shipped: ${this.shippedQuantity}, Available: ${this.availableQuantity}`);
        } else {
          console.error('[INVENTORY] ❌ Cannot ship - no available quantity!');
        }
      } 
      // ✅ QR was shipped, now being received again (return/re-receive)
      else if (existingQR.status === 'shipped' && qrCode.status === 'received') {
        console.log('[INVENTORY] 🔄 Re-receiving previously shipped QR');
        
        this.qrCodes[existingIndex].status = 'received';
        this.qrCodes[existingIndex].receivedAt = new Date();
        this.qrCodes[existingIndex].shippedAt = null;
        
        if (this.shippedQuantity > 0) {
          this.shippedQuantity -= 1;
        }
        this.availableQuantity += 1;
        
        console.log(`[INVENTORY] ✅ Re-received: Available: ${this.availableQuantity}`);
      } 
      // ✅ No status change
      else {
        console.log(`[INVENTORY] ℹ️ No change needed - QR status is already ${qrCode.status}`);
      }
    }

    // ✅ Mark array as modified (important for Mongoose to detect changes)
    this.markModified('qrCodes');
    this.lastUpdated = new Date();

    // ✅ Save inventory
    await this.save();
    console.log('[INVENTORY] ✅ Inventory saved successfully');

    return {
      success: true,
      receivedQuantity: this.receivedQuantity,
      shippedQuantity: this.shippedQuantity,
      availableQuantity: this.availableQuantity
    };

  } catch (error) {
    console.error('[INVENTORY] ❌ Sync error:', error);
    throw error;
  }
};

// ✅ Helper method to get inventory summary
InventorySchema.methods.getSummary = function() {
  return {
    articleId: this.articleId,
    articleName: this.articleName,
    segment: this.segment,
    receivedQuantity: this.receivedQuantity,
    shippedQuantity: this.shippedQuantity,
    availableQuantity: this.availableQuantity,
    totalQRCodes: this.qrCodes.length,
    receivedQRs: this.qrCodes.filter(qr => qr.status === 'received').length,
    shippedQRs: this.qrCodes.filter(qr => qr.status === 'shipped').length
  };
};

// ✅ Static method to find by QR code
InventorySchema.statics.findByQRCode = async function(qrCodeId) {
  return this.findOne({ 'qrCodes.qrCodeId': qrCodeId });
};

// ✅ Static method to find by unique ID
InventorySchema.statics.findByUniqueId = async function(uniqueId) {
  return this.findOne({ 'qrCodes.uniqueId': uniqueId });
};

const Inventory = model('Inventory', InventorySchema);

export default Inventory;
