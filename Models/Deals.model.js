import mongoose from "mongoose";

let {model, Schema} = mongoose;

const DealsSchema = new Schema({
    // ✅ ACTIVE FIELDS
    dealName: {
        type: String,
        required: true,
        trim: true
    },
    startDate: { 
        type: Date,
        required: true
    },
    endDate: { 
        type: Date,
        required: true
    },
    image: { 
        type: String, 
        required: true 
    },
    
    // ✅ Auto-expiry
    expireAt: { type: Date },
    isActive: { type: Boolean, default: true },
    
    // ❌ COMMENTED OUT - May be needed in future
    // dealType: {
    //     type: String,
    //     enum: ['segment', 'article'],
    //     required: true,
    //     default: 'article'
    // },
    // segmentName: { type: String },
    // articleId: { type: Schema.Types.ObjectId },
    // articleName: { type: String },
    // variantName: { type: String },
    // noOfPurchase: { type: Number, required: true },
    // reward: { 
    //     type: String,
    //     required: true
    // },
    // totalRedemptions: { type: Number, default: 0 }
}, { timestamps: true });

// ✅ ACTIVE INDEXES
DealsSchema.index({ isActive: 1 });
DealsSchema.index({ expireAt: 1 });
DealsSchema.index({ dealName: 1 });

// ❌ COMMENTED OUT - May be needed in future
// DealsSchema.index({ dealType: 1, isActive: 1 });
// DealsSchema.index({ segmentName: 1 });
// DealsSchema.index({ articleId: 1 });

// ✅ Auto-set expireAt on save
DealsSchema.pre('save', function(next) {
    if (this.isModified('endDate')) {
        this.expireAt = this.endDate;
    }
    next();
});

const dealsModel = model('Deal', DealsSchema);

export default dealsModel;
