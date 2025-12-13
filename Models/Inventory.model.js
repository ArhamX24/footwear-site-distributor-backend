// Models/Inventory.model.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Models/Inventory.model.js
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
  
  // ✅ ADD THESE FIELDS
  colors: {
    type: [String],
    default: []
  },
  sizes: {
    type: [Number],
    default: []
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
  
  qrCodes: [{
    _id: false,
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
  autoIndex: false
});

// Updated syncWithQRCode method
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

        // ✅ ADD COLORS AND SIZES TO INVENTORY
        if (qrCode.contractorInput?.colors && Array.isArray(qrCode.contractorInput.colors)) {
          const newColors = qrCode.contractorInput.colors
            .filter(c => c && c !== 'Unknown' && c.toLowerCase() !== 'unknown')
            .map(c => c.toLowerCase());
          
          // Add only unique colors
          const uniqueColors = new Set([...this.colors, ...newColors]);
          this.colors = Array.from(uniqueColors).sort();
        }

        if (qrCode.contractorInput?.sizes && Array.isArray(qrCode.contractorInput.sizes)) {
          const newSizes = qrCode.contractorInput.sizes
            .filter(s => s && s !== 0)
            .map(s => Number(s));
          
          // Add only unique sizes
          const uniqueSizes = new Set([...this.sizes, ...newSizes]);
          this.sizes = Array.from(uniqueSizes).sort((a, b) => a - b);
        }
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
    this.markModified('colors');
    this.markModified('sizes');
    this.lastUpdated = new Date();

    await this.save();
    console.log('[INVENTORY] ✅ Saved with colors:', this.colors, 'sizes:', this.sizes);

    return {
      success: true,
      receivedQuantity: this.receivedQuantity,
      shippedQuantity: this.shippedQuantity,
      availableQuantity: this.availableQuantity,
      colors: this.colors,
      sizes: this.sizes
    };

  } catch (error) {
    console.error('[INVENTORY] ❌ Error:', error);
    throw error;
  }
};


const Inventory = model('Inventory', InventorySchema);

export default Inventory;
