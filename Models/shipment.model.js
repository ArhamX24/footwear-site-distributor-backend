// Models/Shipment.model.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const ShipmentItemSchema = new Schema(
  {
    qrCodeId: {
      type: Schema.Types.ObjectId,
      ref: 'QRCode',
      required: true,
    },
    uniqueId: {
      type: String,
      required: true,
    },
    articleName: {
      type: String,
      required: true,
    },
    articleImage: String,
    articleDetails: {
      colors: [String],
      sizes: [Number],
      cartonNumber: Number,
      totalCartons: Number,
    },
    productReference: {
      productId: Schema.Types.ObjectId,
      variantId: Schema.Types.ObjectId,
      articleId: Schema.Types.ObjectId,
      segment: String,
      variantName: String,
    },
    scannedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const ShipmentSchema = new Schema(
  {
    shipmentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Distributor
    distributorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    distributorName: String,
    distributorPhoneNo: String,
    distributorCity: String,
    distributorTransport: String,
    distributorPartyName: String,

    // Items
    items: [ShipmentItemSchema],

    // Shipment manager
    shippedBy: {
      userId: Schema.Types.ObjectId,
      userType: String,
      name: String,
      phoneNo: String,
    },

    shippedAt: {
      type: Date,
      default: Date.now,
    },

    totalCartons: {
      type: Number,
      required: true,
      default: 0,
    },

    status: {
      type: String,
      enum: ['pending', 'in_transit', 'delivered', 'cancelled'],
      default: 'in_transit',
    },

    trackingNumber: String,
    notes: String,
  },
  {
    timestamps: true,
  }
);

ShipmentSchema.index({ distributorId: 1, shippedAt: -1 });
ShipmentSchema.index({ shipmentId: 1 });
ShipmentSchema.index({ status: 1 });

const Shipment = model('Shipment', ShipmentSchema);

export default Shipment;
