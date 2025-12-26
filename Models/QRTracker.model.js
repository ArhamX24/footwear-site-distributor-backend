import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const QRTrackerSchema = new Schema({
  contractorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  contractorName: {
    type: String,
    required: true,
    index: true
  },
  
  date: {
    type: Date,
    required: true,
    index: true,
    default: () => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
  },
  
  articleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article',
    index: true
  },
  articleName: {
    type: String,
    required: true,
    index: true
  },
  segment: {
    type: String,
    index: true
  },
  
  qrGeneratedCount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  batchId: {
    type: String
  },

  bharra: { type: String },
  printing: { type: String },
  packing: { type: String },
  
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { timestamps: true });

// TTL Index - Auto delete after 60 days
QRTrackerSchema.index(
  { createdAt: 1 },
  { 
    expireAfterSeconds: 5184000  // 60 days
  }
);

// Compound indexes
QRTrackerSchema.index({ contractorId: 1, date: 1, articleId: 1 });
QRTrackerSchema.index({ contractorId: 1, date: 1 });

// ✅ FIXED: Track with total QR count
QRTrackerSchema.statics.trackQRGeneration = async function(
  contractorId, 
  contractorName, 
  articleId, 
  articleName, 
  segment, 
  batchId, 
  productionDetails = {},
  totalQRs = 1
) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tracking = await this.findOneAndUpdate(
      {
        contractorId,
        date: today,
        articleId,
        articleName,
        segment,
        batchId
      },
      {
        $setOnInsert: {
          contractorName,
          bharra: productionDetails.bharra || null,
          printing: productionDetails.printing || null,
          packing: productionDetails.packing || null
        },
        $set: {
          qrGeneratedCount: totalQRs
        }
      },
      { 
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );
    
    return tracking;
  } catch (error) {
    console.error('Error tracking QR generation:', error);
    throw error;
  }
};

// ✅ FIXED: Include production details in monthly report
QRTrackerSchema.statics.getMonthlyReport = async function(contractorId, year, month) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    
    const report = await this.find({
      contractorId,
      date: {
        $gte: startDate,
        $lt: endDate
      }
    })
    .select({
      date: 1,
      articleName: 1,
      segment: 1,
      qrGeneratedCount: 1,
      bharra: 1,
      printing: 1,
      packing: 1
    })
    .sort({ date: 1, articleName: 1 })
    .lean();
    
    return report;
  } catch (error) {
    console.error('Error fetching monthly report:', error);
    throw error;
  }
};

// ✅ FIXED: Include production details in all contractors report
QRTrackerSchema.statics.getCurrentMonthReport = async function() {
  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    const report = await this.aggregate([
      {
        $match: {
          date: {
            $gte: startDate,
            $lt: endDate
          }
        }
      },
      {
        $sort: { date: 1, articleName: 1 }
      },
      {
        $group: {
          _id: '$contractorId',
          contractorName: { $first: '$contractorName' },
          records: {
            $push: {
              date: '$date',
              articleName: '$articleName',
              segment: '$segment',
              qrGeneratedCount: '$qrGeneratedCount',
              bharra: '$bharra',
              printing: '$printing',
              packing: '$packing'
            }
          },
          totalQRs: { $sum: '$qrGeneratedCount' }
        }
      }
    ]);
    
    return report;
  } catch (error) {
    console.error('Error fetching current month report:', error);
    throw error;
  }
};

const QRTracker = model('QRTracker', QRTrackerSchema);

export default QRTracker;
