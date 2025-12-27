// Models/Inventory.model.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const InventorySchema = new Schema({
  articleId: { type: String, required: true, unique: true },
  articleName: { type: String, required: true },
  
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false,
    default: null,
    index: true
  },
  
  segment: { type: String, default: 'Unknown' },
  articleImage: { type: String, default: null },
  
  colors: { type: [String], default: [] },
  sizes: { type: [Number], default: [] },
  
  receivedQuantity: { type: Number, default: 0, min: 0 },
  shippedQuantity: { type: Number, default: 0, min: 0 },
  availableQuantity: { type: Number, default: 0, min: 0 },
  
  qrCodes: [{
    _id: false,
    qrCodeId: { type: Schema.Types.ObjectId, ref: 'QRCode', required: true },
    uniqueId: { type: String, required: true },
    status: { type: String, enum: ['received', 'shipped'], default: 'received' },
    receivedAt: { type: Date, default: Date.now },
    shippedAt: { type: Date, default: null }
  }],
  
  lastUpdated: { type: Date, default: Date.now }
}, {
  timestamps: true,
  autoIndex: false
});

// ✅ FIXED: Simple updateDemand method without aggregation operators
InventorySchema.methods.updateDemand = async function() {
  try {
    const Demand = mongoose.model('Demand');
    
    // Find the demand record
    const demand = await Demand.findOne({ articleId: this.articleId });
    
    if (demand) {
      // Calculate new demand: max(0, totalOrdered - availableStock)
      const newDemand = Math.max(0, demand.totalOrdered - this.availableQuantity);
      
      // Update demand with calculated values
      demand.availableStock = this.availableQuantity;
      demand.demand = newDemand;
      demand.lastStockUpdate = new Date();
      
      await demand.save();

    }
  } catch (error) {
    console.error('❌ Demand sync error:', error);
  }
};

// ✅ AUTO-TRIGGER on EVERY inventory save
InventorySchema.post('save', async function(doc) {
  await doc.updateDemand();
});

// Updated syncWithQRCode method
InventorySchema.methods.syncWithQRCode = async function(qrCodeId) {
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

        // ADD COLORS AND SIZES TO INVENTORY
        if (qrCode.contractorInput?.colors && Array.isArray(qrCode.contractorInput.colors)) {
          const newColors = qrCode.contractorInput.colors
            .filter(c => c && c !== 'Unknown' && c.toLowerCase() !== 'unknown')
            .map(c => c.toLowerCase());
          
          const uniqueColors = new Set([...this.colors, ...newColors]);
          this.colors = Array.from(uniqueColors).sort();
        }

        if (qrCode.contractorInput?.sizes && Array.isArray(qrCode.contractorInput.sizes)) {
          const newSizes = qrCode.contractorInput.sizes
            .filter(s => s && s !== 0)
            .map(s => Number(s));
          
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
    
    // ✅ Demand will be automatically updated by the post-save hook

    return {
      success: true,
      receivedQuantity: this.receivedQuantity,
      shippedQuantity: this.shippedQuantity,
      availableQuantity: this.availableQuantity,
      colors: this.colors,
      sizes: this.sizes
    };

  } catch (error) {
    throw error;
  }
};

const Inventory = model('Inventory', InventorySchema);

export default Inventory;
