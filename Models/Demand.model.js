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

const Demand = model('Demand', DemandSchema);
export default Demand;
