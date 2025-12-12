import mongoose from "mongoose";

const { Schema, model } = mongoose;

const inventoryItemSchema = new Schema({
  qrCodeId: { type: Schema.Types.ObjectId, ref: "QRCode", required: true, unique: true },
  uniqueId: { type: String, required: true, unique: true },
  articleDetails: {
    colors: [String],
    sizes: [Number],
    numberOfCartons: { type: Number, default: 1 },
  },
  status: {
    type: String,
    enum: ["received", "shipped", "delivered"],
    default: "received"
  },
  receivedAt: Date,
  shippedAt: Date,
  receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
  shippedBy: { type: Schema.Types.ObjectId, ref: "User" },
  distributorId: { type: Schema.Types.ObjectId, ref: "User" },
  notes: String
}, { timestamps: true });

const inventorySchema = new Schema({
  articleId: { type: String, required: true, unique: true, index: true }, // ✅ PRIMARY KEY
  articleName: { type: String, required: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product" }, // ✅ NOT UNIQUE - multiple articles per product
  variantId: { type: Schema.Types.ObjectId },
  segment: { type: String },
  variantName: { type: String },
  
  quantityByStage: {
    received: { type: Number, default: 0 },
    shipped: { type: Number, default: 0 }
  },
  availableQuantity: { type: Number, default: 0, min: 0 },
  items: [inventoryItemSchema],
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Pre-save hook
inventorySchema.pre("save", function(next) {
  this.quantityByStage.received = this.items.filter(i => i.status === "received").length;
  this.quantityByStage.shipped = this.items.filter(i => i.status === "shipped").length;
  this.availableQuantity = this.quantityByStage.received - this.quantityByStage.shipped;
  this.lastUpdated = new Date();
  next();
});

// In Inventory.model.js
inventorySchema.methods.syncWithQRCode = async function(qrCodeId) {
  try {
    const qrCode = await mongoose.model('QRCode').findById(qrCodeId);
    
    if (!qrCode) {
      throw new Error(`QR Code ${qrCodeId} not found`);
    }

    console.log('[SYNC] Syncing QR:', qrCode.uniqueId, 'Status:', qrCode.status);

    // Find existing item in inventory
    const existingItemIndex = this.items.findIndex(
      item => item.uniqueId === qrCode.uniqueId || item.qrCodeId?.toString() === qrCodeId.toString()
    );

    const numberOfCartons = qrCode.contractorInput?.totalCartons || 1;

    // ✅ FIXED: Handle state transitions properly
    if (qrCode.status === 'received') {
      if (existingItemIndex === -1) {
        // NEW item - add to inventory
        console.log('[SYNC] Adding new item to inventory');
        
        this.items.push({
          qrCodeId: qrCode._id,
          uniqueId: qrCode.uniqueId,
          articleName: qrCode.articleName,
          articleDetails: {
            colors: qrCode.contractorInput?.colors || [],
            sizes: qrCode.contractorInput?.sizes || [],
            cartonNumber: qrCode.contractorInput?.cartonNumber || 0
          },
          status: 'received',
          numberOfCartons: numberOfCartons,
          manufacturedAt: qrCode.createdAt,
          receivedAt: qrCode.warehouseDetails?.receivedAt || new Date(),
          receivedBy: qrCode.warehouseDetails?.receivedBy?.userId || null,
          notes: qrCode.warehouseDetails?.notes || ''
        });

        // ✅ Increment received count
        this.quantityByStage.received += numberOfCartons;
        this.availableQuantity += numberOfCartons;
        
      } else {
        // Item already exists - update if status changed
        const existingItem = this.items[existingItemIndex];
        
        if (existingItem.status !== 'received') {
          console.log('[SYNC] Updating existing item status to received');
          
          // If it was shipped before, decrement shipped count
          if (existingItem.status === 'shipped') {
            this.quantityByStage.shipped -= numberOfCartons;
            this.availableQuantity += numberOfCartons; // Add back to available
          }
          
          existingItem.status = 'received';
          existingItem.receivedAt = qrCode.warehouseDetails?.receivedAt || new Date();
          existingItem.receivedBy = qrCode.warehouseDetails?.receivedBy?.userId || null;
          
          this.quantityByStage.received += numberOfCartons;
        }
      }
    }

    // ✅ FIXED: Handle shipped status
    else if (qrCode.status === 'shipped') {
      if (existingItemIndex === -1) {
        console.warn('[SYNC] ⚠️ Cannot ship item that was never received!');
        throw new Error('Cannot ship item that was not received in warehouse');
      }

      const existingItem = this.items[existingItemIndex];
      
      if (existingItem.status === 'received') {
        console.log('[SYNC] Moving item from received to shipped');
        
        // ✅ Decrement received, increment shipped
        this.quantityByStage.received = Math.max(0, this.quantityByStage.received - numberOfCartons);
        this.quantityByStage.shipped += numberOfCartons;
        this.availableQuantity = Math.max(0, this.availableQuantity - numberOfCartons);
        
        // Update item details
        existingItem.status = 'shipped';
        existingItem.shippedAt = qrCode.shipmentDetails?.shippedAt || new Date();
        existingItem.shippedBy = qrCode.shipmentDetails?.shippedBy?.userId || null;
        existingItem.distributorId = qrCode.shipmentDetails?.distributorId || null;
        existingItem.trackingNumber = qrCode.shipmentDetails?.trackingNumber || null;
        
      } else if (existingItem.status === 'shipped') {
        console.log('[SYNC] Item already shipped, skipping');
      }
    }

    // ✅ Ensure no negative values
    this.quantityByStage.received = Math.max(0, this.quantityByStage.received);
    this.quantityByStage.shipped = Math.max(0, this.quantityByStage.shipped);
    this.availableQuantity = Math.max(0, this.availableQuantity);
    
    // Update total quantity
    this.totalQuantity = this.items.reduce((sum, item) => sum + (item.numberOfCartons || 1), 0);
    this.lastUpdated = new Date();

    console.log('[SYNC] Final counts - Received:', this.quantityByStage.received, 
                ', Shipped:', this.quantityByStage.shipped, 
                ', Available:', this.availableQuantity);

    await this.save();
    console.log('[SYNC] ✅ Inventory saved successfully');
    
    return this;
  } catch (error) {
    console.error('[SYNC] ❌ Sync error:', error);
    throw error;
  }
};


// ✅ CORRECTED INDEXES - articleId is unique, productId is NOT
inventorySchema.index({ articleId: 1 }, { unique: true }); // Each article has ONE inventory
inventorySchema.index({ articleName: 1 }); // For quick lookup by name
inventorySchema.index({ productId: 1 }); // ✅ NOT UNIQUE - for filtering/grouping only
inventorySchema.index({ "items.qrCodeId": 1 });
inventorySchema.index({ "items.uniqueId": 1 });
inventorySchema.index({ "items.status": 1 });

const Inventory = model("Inventory", inventorySchema);

export default Inventory;
