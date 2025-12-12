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
  
  // Track QR codes
  qrCodes: [{
    qrCodeId: {
      type: Schema.Types.ObjectId,
      ref: 'QRCode'
    },
    uniqueId: String,
    status: {
      type: String,
      enum: ['received', 'shipped'],
      default: 'received'
    },
    receivedAt: Date,
    shippedAt: Date
  }],
  
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ✅ FIXED: Proper ObjectId comparison handling both cases
InventorySchema.methods.syncWithQRCode = async function(qrCodeId) {


  try {
    // ✅ Fetch QR code
    const QRCode = mongoose.model('QRCode');
    const qrCode = await QRCode.findById(qrCodeId);

    if (!qrCode) {
      throw new Error(`QR code not found: ${qrCodeId}`);
    }



    // ✅ CRITICAL FIX: Handle both ObjectId and subdocument formats
    const qrIdString = qrCodeId.toString();
    
    const existingIndex = this.qrCodes.findIndex((qr) => {
      // Handle case where qrCodes contains subdocuments with _id
      if (qr._id) {
        return qr._id.toString() === qrIdString;
      }
      // Handle case where qrCodes contains plain ObjectIds
      return qr.toString() === qrIdString;
    });



    if (existingIndex === -1) {

      
      if (qrCode.status === 'received') {
        this.qrCodes.push(qrCodeId);
        this.receivedQuantity += 1;
        this.availableQuantity += 1;

      } else {

      }
    } else {

      if (qrCode.status === 'shipped') {

        
        // ✅ Update the status in the qrCodes array if it's a subdocument
        if (this.qrCodes[existingIndex]._id) {
          this.qrCodes[existingIndex].status = 'shipped';

        }
        
        // ✅ CRITICAL: Only deduct if availableQuantity > 0
        if (this.availableQuantity > 0) {
          this.shippedQuantity += 1;
          this.availableQuantity -= 1;

        } else {

        }
        
      } else if (qrCode.status === 'received') {

      } else {

      }
    }

    // ✅ Mark as modified if array contains subdocuments
    this.markModified('qrCodes');

    // ✅ Save inventory
    await this.save();


  } catch (error) {

    throw error;
  }
};


InventorySchema.index({ articleId: 1 });
InventorySchema.index({ articleName: 1 });
InventorySchema.index({ segment: 1 });

const Inventory = model('Inventory', InventorySchema);

export default Inventory;
