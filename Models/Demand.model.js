import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const DemandSchema = new Schema({
  articleId: { type: String, required: true, index: true },
  articleName: { type: String, required: true, index: true },
  segment: { type: String, required: true, index: true },
  articleImage: { type: String, default: null },
  colors: [{ type: String }],
  sizes: [{ type: Number }],
  
  totalOrdered: { type: Number, default: 0, min: 0 },
  availableStock: { type: Number, default: 0, min: 0 },
  demand: { 
    type: Number, 
    default: 0,
    get: function() {
      return Math.max(0, this.totalOrdered - this.availableStock);
    }
  },
  
  distributorOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseProduct' },
  lastStockUpdate: { type: Date, default: Date.now },
  lastOrderUpdate: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  toJSON: { getters: true },  // ✅ Enable getters for JSON
  toObject: { getters: true } // ✅ Enable getters for objects
});

// ✅ AUTO-CALCULATE demand on EVERY SAVE
DemandSchema.pre('save', function(next) {
  this.demand = Math.max(0, this.totalOrdered - this.availableStock);
  next();
});

// ✅ VIRTUAL demand field (always correct)
DemandSchema.virtual('backorder').get(function() {
  return Math.max(0, this.totalOrdered - this.availableStock);
});

DemandSchema.statics.updateDemandFromInventory = async function(articleId, availableQuantity) {
  try {
    const demand = await this.findOne({ articleId: articleId });
    
    if (demand) {
      // Calculate new demand based on orders and available stock
      const newDemand = Math.max(0, demand.totalOrdered - availableQuantity);
      
      demand.availableStock = availableQuantity;
      demand.demand = newDemand;
      demand.lastStockUpdate = new Date();
      
      await demand.save();
      
      console.log(`✅ Demand updated for article ${articleId}: Stock=${availableQuantity}, Demand=${newDemand}`);
      
      return {
        success: true,
        articleId,
        availableStock: availableQuantity,
        demand: newDemand
      };
    } else {
      console.log(`⚠️ No demand record found for article ${articleId}`);
      return {
        success: false,
        message: 'No demand record found'
      };
    }
  } catch (error) {
    console.error('❌ Error updating demand from inventory:', error);
    throw error;
  }
};

// ✅ Instance method to recalculate demand
DemandSchema.methods.recalculateDemand = function() {
  this.demand = Math.max(0, this.totalOrdered - this.availableStock);
  return this.demand;
};

const Demand = model('Demand', DemandSchema);
export default Demand;
