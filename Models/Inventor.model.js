// inventory.model.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const inventorySchema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    unique: true, // each product only one inventory record
  },
  quantity: {
    type: Number,
    default: 0,
    min: 0
  }
}, { timestamps: true });

const Inventory = model('Inventory', inventorySchema);

export default Inventory;
