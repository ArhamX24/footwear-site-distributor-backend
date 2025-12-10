import mongoose from "mongoose";

let {model, Schema} = mongoose;

const DealsSchema = new Schema({
    // Deal Type: 'segment' applies to all articles in a segment, 'article' applies to one article
    dealType: {
        type: String,
        enum: ['segment', 'article'],
        required: true,
        default: 'article'
    },
    
    // For Segment-wide Deals
    segmentName: { type: String }, // e.g., "eva", "school shoe"
    
    // For Article-specific Deals
    articleId: { type: Schema.Types.ObjectId },
    articleName: { type: String },
    variantName: { type: String },
    
    // Common Deal Fields
    startDate: { 
        type: Date,
        required: true
    },
    endDate: { 
        type: Date,
        required: true
    },
    image: { type: String, required: true },
    noOfPurchase: { type: Number, required: true }, // Minimum cartons required
    reward: { 
        type: String,
        required: true
    },
    
    // Auto-expiry
    expireAt: { type: Date },
    
    // Tracking
    isActive: { type: Boolean, default: true },
    totalRedemptions: { type: Number, default: 0 }
}, { timestamps: true });

// Indexes for performance
DealsSchema.index({ dealType: 1, isActive: 1 });
DealsSchema.index({ segmentName: 1 });
DealsSchema.index({ articleId: 1 });
DealsSchema.index({ expireAt: 1 });

// Auto-set expireAt on save
DealsSchema.pre('save', function(next) {
    if (this.isModified('endDate')) {
        this.expireAt = this.endDate;
    }
    next();
});

const dealsModel = model('Deal', DealsSchema);

export default dealsModel;
