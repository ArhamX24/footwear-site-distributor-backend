// Models/Inventory.model.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Models/Inventory.model.js
const InventorySchema = new Schema({
  // ✅ PRIMARY KEY (QR/article level)
  articleId: { type: String, required: true, unique: true },
  articleName: { type: String, required: true },
  
  // ✅ PRODUCT REFERENCE (for grouping)
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true  // Speed up queries
  },
  
  segment: { type: String, default: 'Unknown' },
  articleImage: { type: String, default: null },
  
  // Colors & Sizes (from QR data)
  colors: { type: [String], default: [] },
  sizes: { type: [Number], default: [] },
  
  // Quantities
  receivedQuantity: { type: Number, default: 0, min: 0 },
  shippedQuantity: { type: Number, default: 0, min: 0 },
  availableQuantity: { type: Number, default: 0, min: 0 },
  
  // QR Code tracking
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

// Add this method to your InventorySchema.methods
InventorySchema.methods.updateDemand = async function() {
  try {
    const Demand = mongoose.model('Demand');
    
    // Update ALL demands for this articleId with new stock
    const updatedDemand = await Demand.findOneAndUpdate(
      { articleId: this.articleId },
      { 
        availableStock: this.availableQuantity,
        lastStockUpdate: new Date()
      },
      { new: true }
    );


  } catch (error) {
    console.error('Demand sync error:', error);
  }
};

// ✅ Add this METHOD to InventorySchema.methods
InventorySchema.methods.syncDemand = async function() {
  try {
    const Demand = mongoose.model('Demand');
    const demand = await Demand.findOne({ articleId: this.articleId });
    
    if (demand) {
      // ✅ AUTO UPDATE demand with new stock
      const newDemand = Math.max(0, demand.totalOrdered - this.availableQuantity);
      demand.availableStock = this.availableQuantity;
      demand.demand = newDemand;
      demand.lastStockUpdate = new Date();
      await demand.save();
      

    }
  } catch (error) {
    console.error('Demand sync failed:', error);
  }
};

// ✅ AUTO-TRIGGER on EVERY inventory save
InventorySchema.post('save', function(doc) {
  doc.syncDemand();
});


// ✅ HOOK: Auto-run on EVERY inventory save
InventorySchema.post('save', async function() {
  await this.updateDemand();
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

    const Demand = mongoose.model('Demand');
    await Demand.updateDemandFromInventory(this.articleId, this.availableQuantity);

    await this.updateDemand();

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
