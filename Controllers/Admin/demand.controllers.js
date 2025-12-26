import Demand from '../../Models/Demand.model.js';
import Inventory from '../../Models/Inventory.model.js';
import purchaseProductModel from '../../Models/Purchasedproduct.model.js';
import productModel from '../../Models/Product.model.js';
import mongoose from 'mongoose';

const statusCodes = { success: 200, badRequest: 400, notFound: 404, serverError: 500 };

export const createDemandFromOrder = async (orderItems, distributorOrderId) => {
  try {


    for (const orderItem of orderItems) {
      const articleId = orderItem.articleId || orderItem.productid || orderItem.productId;
      const quantity = parseInt(orderItem.quantity || orderItem.totalCartons);

      if (!articleId || !quantity || quantity <= 0) continue;

      const inventory = await Inventory.findOne({ articleId });
      const currentStock = inventory?.availableQuantity || 0;

      // ✅ STEP 1: Update base data + increment orders
      await Demand.findOneAndUpdate(
        { articleId },
        { 
          $setOnInsert: {
            articleName: orderItem.articleName,
            segment: orderItem.segment,
            articleImage: orderItem.articleImg || null,
            colors: Array.isArray(orderItem.colors) ? orderItem.colors : [],
            sizes: typeof orderItem.sizes === 'string' 
              ? orderItem.sizes.split('X').map(s => parseInt(s)).filter(Boolean)
              : Array.isArray(orderItem.sizes) ? orderItem.sizes : [],
            distributorOrderId
          },
          $set: {
            availableStock: currentStock,
            lastOrderUpdate: new Date()
          },
          $inc: { totalOrdered: quantity }
        },
        { upsert: true }
      );

      // ✅ STEP 2: FORCE RECALCULATE demand field
      const demand = await Demand.findOne({ articleId });
      if (demand) {
        const newDemand = Math.max(0, demand.totalOrdered - demand.availableStock);
        demand.demand = newDemand;
        await demand.save();
        
      }
    }
  } catch (error) {
    console.error('❌ Demand creation FAILED:', error);
  }
};

export const getAllDemand = async (req, res) => {
  try {
    const { page = 1, limit = 20, segment, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const match = {};
    if (segment) match.segment = segment;
    if (search) {
      match.$or = [
        { articleName: { $regex: search, $options: 'i' } },
        { segment: { $regex: search, $options: 'i' } }
      ];
    }

    // ✅ FORCE CALCULATE demand in aggregation
    const demands = await Demand.aggregate([
      { $match: match },
      {
        $addFields: {
          calculatedDemand: {
            $max: [0, { $subtract: ["$totalOrdered", "$availableStock"] }]
          }
        }
      },
      { $sort: { calculatedDemand: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $project: {
          articleId: 1, articleName: 1, segment: 1, articleImage: 1,
          colors: 1, sizes: 1, totalOrdered: 1, availableStock: 1,
          demand: "$calculatedDemand",  // ✅ Use calculated!
          lastStockUpdate: 1, lastOrderUpdate: 1
        }
      }
    ]);

    const total = await Demand.countDocuments(match);

    res.status(200).json({
      result: true,
      data: demands,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, hasMore: skip + demands.length < total }
    });
  } catch (error) {
    res.status(500).json({ result: false, message: 'Error fetching demand', error: error.message });
  }
};

// 🔄 UPDATE DEMAND FROM INVENTORY CHANGES
export const updateDemandFromInventory = async (articleId, newStock) => {
  try {
    const demand = await Demand.findOne({ articleId });
    if (!demand) return;

    demand.availableStock = newStock;
    await demand.save();
    
  } catch (error) {
    console.error('Demand update error:', error);
  }
};

// 📈 HIGH DEMAND REPORT (Priority)
export const getHighDemandReport = async (req, res) => {
  try {
    const demands = await Demand.find({ demand: { $gt: 0 } })
      .sort({ demand: -1 })
      .limit(20)
      .lean();

    res.status(statusCodes.success).json({
      result: true,
      message: 'High demand report',
      data: demands
    });
  } catch (error) {
    res.status(statusCodes.serverError).json({
      result: false,
      message: 'Error generating report',
      error: error.message
    });
  }
};

// NEW: Manual stock refresh (Admin can call anytime)
export const refreshAllDemand = async (req, res) => {
  try {
    const inventories = await Inventory.find({}).lean();
    
    for (const inv of inventories) {
      const demand = await Demand.findOne({ articleId: inv.articleId });
      if (demand) {
        demand.availableStock = inv.availableQuantity;
        demand.lastStockUpdate = new Date();
        await demand.save();
      }
    }

    res.status(200).json({
      result: true,
      message: 'All demand refreshed!',
      updated: inventories.length
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Refresh failed',
      error: error.message
    });
  }
};
