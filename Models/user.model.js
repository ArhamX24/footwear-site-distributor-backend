import mongoose from "mongoose";
import bcrypt from 'bcrypt';

const { model, Schema } = mongoose;

const UserSchema = new Schema({
    // Common fields for all users
    name: { type: String, required: true },
    phoneNo: { type: String, required: true},
    password: { type: String, required: true },
    plainPassword: { type: String },
    role: { 
        type: String, 
        enum: ['admin', 'distributor', 'contractor', 'warehouse_inspector', 'shipment_manager'],
        required: true 
    },
    refreshToken: { type: String },
    
    // Role-specific fields
    distributorDetails: {
        salesmanName: {type: String},
        partyName: { type: String },
        cityName: {type: String},
        purchases: [{ type: mongoose.Types.ObjectId, ref: 'Product' }],
        transport: { type: String },
        receivedShipments: [{ type: mongoose.Types.ObjectId, ref: 'Shipment' }]
    },
    
    contractorDetails: {
        fullName: { 
            type: String, 
            required: function() { return this.role === 'contractor'; }
        },
        phoneNo: {
            type: String,  // ✅ Changed from Number to String
            required: function() { return this.role === 'contractor'; }
            // ✅ REMOVED: unique: true (this was causing the error)
        },
        password: {
            type: String, 
            required: function() { return this.role === 'contractor'; }
        },
        totalItemsProduced: { type: Number, default: 0 },
        activeProductions: [{ type: mongoose.Types.ObjectId, ref: 'Inventory' }]
    },
    
    warehouseInspectorDetails: {
        fullName: { 
            type: String,
            required: function() { return this.role === 'warehouse_inspector'; }
        },
        phoneNo: {
            type: String,  // ✅ Changed from Number to String
            required: function() { return this.role === 'warehouse_inspector'; }
            // ✅ REMOVED: unique: true
        },
        password: {
            type: String, 
            required: function() { return this.role === 'warehouse_inspector'; }
        },
        totalItemsInspected: { type: Number, default: 0 },
        itemsProcessedToday: { type: Number, default: 0 }
    },
    
    shipmentManagerDetails: {
        fullName: { 
            type: String,
            required: function() { return this.role === 'shipment_manager'; }
        },
        phoneNo: {
            type: String,  // ✅ Changed from Number to String
            required: function() { return this.role === 'shipment_manager'; }
            // ✅ REMOVED: unique: true
        },
        password: {
            type: String, 
            required: function() { return this.role === 'shipment_manager'; }
        },
        totalShipmentsHandled: { type: Number, default: 0 },
        activeShipments: [{ type: mongoose.Types.ObjectId, ref: 'Shipment' }]
    },
    
    adminDetails: {
        fullName: { 
            type: String,
            required: function() { return this.role === 'admin'; }
        },
        phoneNo: {
            type: String,  // ✅ Changed from Number to String
            required: function() { return this.role === 'admin'; }
            // ✅ REMOVED: unique: true
        },
        password: {
            type: String, 
            required: function() { return this.role === 'admin'; }
        },
        permissions: [{ type: String }],
        lastAdminAction: { type: Date }
    },
    
    // Common audit fields
    isActive: { type: Boolean, default: true },
    lastLogin: { type: Date },
    createdBy: { type: mongoose.Types.ObjectId, ref: 'User' },
    
}, { timestamps: true });

UserSchema.pre("save", async function (next) {
    const user = this;

    // Only hash the main password field, not the role-specific ones
    if (!user.isModified('password')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPass = await bcrypt.hash(user.password, salt);
        user.password = hashedPass;
        next();
    } catch (error) {
        console.log(error);
        next(error);
    }
});


// Helper methods for role-specific operations
UserSchema.methods.updateStats = function(action) {
    switch(this.role) {
        case 'contractor':
            if (action === 'produced') {
                this.contractorDetails.totalItemsProduced += 1;
            }
            break;
        case 'warehouse_inspector':
            if (action === 'inspected') {
                this.warehouseInspectorDetails.totalItemsInspected += 1;
                this.warehouseInspectorDetails.itemsProcessedToday += 1;
            }
            break;
        case 'shipment_manager':
            if (action === 'shipped') {
                this.shipmentManagerDetails.totalShipmentsHandled += 1;
            }
            break;
        case 'admin':
            if (action === 'admin_action') {
                this.adminDetails.lastAdminAction = new Date();
            }
            break;
    }
    return this.save();
};

// Static method to find users by role
UserSchema.statics.findByRole = function(role) {
    return this.find({ role, isActive: true });
};

// Static method to find all admins
UserSchema.statics.findAdmins = function() {
    return this.find({ role: 'admin', isActive: true });
};

// Basic indexes for performance
UserSchema.index({ phoneNo: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ isActive: 1 });

// ✅ OPTIONAL: Create sparse partial indexes for nested phoneNo uniqueness
// Only use these if you need nested phoneNo to be unique within each role
UserSchema.index(
    { 'contractorDetails.phoneNo': 1 }, 
    { 
        unique: true, 
        sparse: true, 
        partialFilterExpression: { role: 'contractor' } 
    }
);

UserSchema.index(
    { 'warehouseInspectorDetails.phoneNo': 1 }, 
    { 
        unique: true, 
        sparse: true, 
        partialFilterExpression: { role: 'warehouse_inspector' } 
    }
);

UserSchema.index(
    { 'shipmentManagerDetails.phoneNo': 1 }, 
    { 
        unique: true, 
        sparse: true, 
        partialFilterExpression: { role: 'shipment_manager' } 
    }
);

UserSchema.index(
    { 'adminDetails.phoneNo': 1 }, 
    { 
        unique: true, 
        sparse: true, 
        partialFilterExpression: { role: 'admin' } 
    }
);

const userModel = model('User', UserSchema);

export default userModel;
