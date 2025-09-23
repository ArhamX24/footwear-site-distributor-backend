// controllers/shipmentController.js
import Shipment from '../../Models/shipment.model.js';
import userModel from '../../Models/user.model.js';
import Product from '../../Models/Product.model.js';
import cron from 'node-cron';
import { model, Schema } from 'mongoose';

// Auto-delete settings model (create this)
const autoDeleteSettingSchema = new Schema({
  enabled: { type: Boolean, default: false },
  days: { type: Number, default: 30 },
  lastCleanup: { type: Date, default: Date.now }
}, { timestamps: true });

const AutoDeleteSetting = model('AutoDeleteSetting', autoDeleteSettingSchema);

const formatSizeRange = (sizes) => {
  if (!sizes || sizes.length === 0) return 'N/A';
  if (sizes.length === 1) return sizes[0].toString();
  const sortedSizes = [...sizes].sort((a, b) => a - b);
  return `${sortedSizes[0]}X${sortedSizes[sortedSizes.length - 1]}`;
};

// Get all shipments with enhanced filtering
const getAllShipments = async (req, res) => {
  try {
    const { status, distributorId, startDate, endDate } = req.query;
    
    let query = {};
    if (status && status !== 'all') query.status = status;
    if (distributorId && distributorId !== 'all') query.distributorId = distributorId;
    
    if (startDate && endDate) {
      query.shippedAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const shipments = await Shipment.find(query)
      .populate('distributorId', 'name phoneNo email')
      .populate('shippedBy', 'name phoneNo')
      .populate({
        path: 'items.qrCodeId',
        select: 'articleName articleDetails images'
      })
      .sort({ shippedAt: -1 });

    // ✅ Enhanced shipments with proper size formatting
    const enhancedShipments = await Promise.all(shipments.map(async (shipment) => {
      const shipmentObj = shipment.toObject();
      
      // ✅ Format sizes in each item
      shipmentObj.items = shipmentObj.items.map(item => ({
        ...item,
        articleDetails: {
          ...item.articleDetails,
          sizesFormatted: formatSizeRange(item.articleDetails?.sizes), // ✅ Add formatted sizes
          colorsFormatted: Array.isArray(item.articleDetails?.colors) 
            ? item.articleDetails.colors.join(', ') 
            : item.articleDetails?.colors || 'N/A'
        }
      }));
      
      // Get article images for each item
      for (let item of shipmentObj.items) {
        if (item.articleName) {
          try {
            const product = await Product.findOne({
              'variants.articles.name': { $regex: new RegExp(item.articleName, 'i') }
            });
            
            if (product) {
              const variant = product.variants.find(v => 
                v.articles.some(a => a.name.toLowerCase().includes(item.articleName.toLowerCase()))
              );
              if (variant) {
                const article = variant.articles.find(a => 
                  a.name.toLowerCase().includes(item.articleName.toLowerCase())
                );
                if (article && article.images.length > 0) {
                  item.articleImage = article.images[0];
                }
              }
            }
          } catch (error) {
            console.log('Error fetching article image:', error);
          }
        }
      }
      
      return shipmentObj;
    }));

    res.status(200).json({
      result: true,
      message: 'Shipments retrieved successfully',
      data: {
        shipments: enhancedShipments,
        totalCount: enhancedShipments.length
      }
    });

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to fetch shipments',
      error: error.message
    });
  }
};

// Generate shipment details PDF/view with proper formatting
const viewShipmentDetails = async (req, res) => {
  try {
    const { shipmentId } = req.params;
    
    const shipment = await Shipment.findById(shipmentId)
      .populate('distributorId', 'name phoneNo email distributorDetails')
      .populate('shippedBy', 'name phoneNo')
      .populate({
        path: 'items.qrCodeId',
        select: 'articleName articleDetails'
      });

    if (!shipment) {
      return res.status(404).json({
        result: false,
        message: 'Shipment not found'
      });
    }

    // ✅ Format the shipment data for display
    const formattedShipment = {
      ...shipment.toObject(),
      items: shipment.items.map(item => ({
        ...item,
        articleDetails: {
          ...item.articleDetails,
          sizesFormatted: formatSizeRange(item.articleDetails?.sizes), // ✅ Range format
          colorsFormatted: Array.isArray(item.articleDetails?.colors) 
            ? item.articleDetails.colors.join(', ') 
            : item.articleDetails?.colors || 'N/A'
        }
      }))
    };
    
    res.status(200).json({
      result: true,
      message: 'Shipment details retrieved successfully',
      data: formattedShipment
    });

  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to view shipment details',
      error: error.message
    });
  }
};

// Get auto-delete settings
const getAutoDeleteSettings = async (req, res) => {
  try {
    let settings = await AutoDeleteSetting.findOne();
    if (!settings) {
      settings = await AutoDeleteSetting.create({
        enabled: false,
        days: 30
      });
    }

    res.status(200).json({
      result: true,
      message: 'Auto-delete settings retrieved successfully',
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to fetch auto-delete settings',
      error: error.message
    });
  }
};

// Update auto-delete settings
const updateAutoDeleteSettings = async (req, res) => {
  try {
    const { enabled, days } = req.body;

    let settings = await AutoDeleteSetting.findOne();
    if (!settings) {
      settings = new AutoDeleteSetting();
    }

    settings.enabled = enabled;
    settings.days = days;
    await settings.save();

    res.status(200).json({
      result: true,
      message: 'Auto-delete settings updated successfully',
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to update auto-delete settings',
      error: error.message
    });
  }
};

// Manual cleanup of old shipments
const cleanupOldShipments = async (req, res) => {
  try {
    const settings = await AutoDeleteSetting.findOne();
    const daysToKeep = settings?.days || 30;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await Shipment.deleteMany({
      shippedAt: { $lt: cutoffDate },
      status: { $in: ['completed', 'cancelled'] }
    });

    // Update last cleanup date
    if (settings) {
      settings.lastCleanup = new Date();
      await settings.save();
    }

    res.status(200).json({
      result: true,
      message: `Successfully deleted ${result.deletedCount} old shipments`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to cleanup old shipments',
      error: error.message
    });
  }
};

// Generate shipment details PDF/view

// Auto-cleanup cron job (run daily at midnight)
const setupAutoCleanup = () => {
  cron.schedule('0 0 * * *', async () => {
    try {
      const settings = await AutoDeleteSetting.findOne();
      
      if (settings && settings.enabled) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - settings.days);

        const result = await Shipment.deleteMany({
          shippedAt: { $lt: cutoffDate },
          status: { $in: ['completed', 'cancelled'] }
        });

        if (result.deletedCount > 0) {
          settings.lastCleanup = new Date();
          await settings.save();
        }
      }
    } catch (error) {
      console.error('Error in auto-cleanup cron job:', error);
    }
  });
};

// Initialize auto-cleanup on server start
setupAutoCleanup();

export {
  getAllShipments,
  getAutoDeleteSettings,
  updateAutoDeleteSettings,
  cleanupOldShipments,
  viewShipmentDetails,
};
