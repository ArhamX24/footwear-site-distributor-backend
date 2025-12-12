import mongoose from "mongoose";

let { model, Schema } = mongoose;

let FestiveSchema = new Schema({
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
    // ✅ TTL field for auto-deletion
    expireAt: { 
        type: Date,
        index: { expires: 0 } // Auto-delete when this date is reached
    }
}, { timestamps: true });

// ✅ Auto-set expireAt to endDate before saving
FestiveSchema.pre('save', function(next) {
    if (this.isModified('endDate')) {
        this.expireAt = this.endDate;
    }
    next();
});

// ✅ Index for active festivals
FestiveSchema.index({ endDate: 1 });

let Festive = model('Festival', FestiveSchema);

export default Festive;
