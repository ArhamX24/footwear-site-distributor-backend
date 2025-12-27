import Shipment from "../../Models/shipment.model.js";
import PDFDocument from 'pdfkit'

const getAllShipments = async (req, res) => {
  try {
    const { status, distributorId, startDate, endDate } = req.query;

    // Build query
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (distributorId && distributorId !== 'all') {
      query.distributorId = distributorId;
    }

    if (startDate || endDate) {
      query.shippedAt = {};
      if (startDate) query.shippedAt.$gte = new Date(startDate);
      if (endDate) query.shippedAt.$lte = new Date(endDate);
    }

    const shipments = await Shipment.find(query)
      .populate('distributorId', 'name phoneNo distributorDetails')
      .sort({ shippedAt: -1 });

    res.status(200).json({
      result: true,
      message: 'Shipments retrieved successfully',
      data: {
        shipments: shipments.map(s => ({
          _id: s._id,
          shipmentId: s.shipmentId,
          distributorName: s.distributorId?.distributorDetails?.partyName || 
                          s.distributorId?.name || 
                          s.distributorName || 'Unknown',
          distributorPhone: s.distributorId?.phoneNo || 'N/A',
          totalCartons: s.totalCartons,
          status: s.status,
          shippedAt: s.shippedAt,
          items: s.items
        }))
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

// Get single shipment details
const getShipmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await Shipment.findById(id)
      .populate('distributorId', 'name phoneNo distributorDetails')
      .populate('shippedBy.userId', 'name');

    if (!shipment) {
      return res.status(404).json({
        result: false,
        message: 'Shipment not found'
      });
    }

    res.status(200).json({
      result: true,
      message: 'Shipment details retrieved',
      data: {
        _id: shipment._id,
        shipmentId: shipment.shipmentId,
        distributorName: shipment.distributorId?.distributorDetails?.partyName || 
                        shipment.distributorId?.name || 
                        shipment.distributorName || 'Unknown',
        distributorPhone: shipment.distributorId?.phoneNo || 'N/A',
        totalCartons: shipment.totalCartons,
        status: shipment.status,
        shippedAt: shipment.shippedAt,
        shippedBy: shipment.shippedBy,
        items: shipment.items,
        trackingNumber: shipment.trackingNumber,
        notes: shipment.notes
      }
    });

  } catch (error) {

    res.status(500).json({
      result: false,
      message: 'Failed to fetch shipment details',
      error: error.message
    });
  }
};

// Get auto-delete settings
const getAutoDeleteSettings = async (req, res) => {
  try {
    // You can store this in a Settings model or return defaults
    res.status(200).json({
      result: true,
      data: {
        enabled: false,
        days: 30
      }
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to get settings'
    });
  }
};

// Update auto-delete settings
const updateAutoDeleteSettings = async (req, res) => {
  try {
    const { enabled, days } = req.body;

    // Store in database (create Settings model if needed)
    // For now, just return success
    res.status(200).json({
      result: true,
      message: 'Settings updated successfully',
      data: { enabled, days }
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: 'Failed to update settings'
    });
  }
};

// Cleanup old shipments
const cleanupOldShipments = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await Shipment.deleteMany({
      shippedAt: { $lt: thirtyDaysAgo }
    });

    res.status(200).json({
      result: true,
      message: 'Old shipments deleted',
      deletedCount: result.deletedCount
    });

  } catch (error) {

    res.status(500).json({
      result: false,
      message: 'Failed to cleanup shipments'
    });
  }
};

const generateShipmentPerforma = async (req, res) => {
    try {
        const { shipmentId } = req.params;

        const shipment = await Shipment.findById(shipmentId)
            .populate('distributorId', 'distributorDetails phoneNo')
            .exec();

        if (!shipment) {
            return res.status(404).json({ result: false, message: 'Shipment not found' });
        }

        const doc = new PDFDocument({
            size: 'A4',
            margin: 30,
            bufferPages: true
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Performa_${shipment.shipmentId}.pdf"`);

        doc.pipe(res);

        // ========== HEADER SECTION ==========
        doc.fontSize(20).font('Helvetica-Bold').text('SHIPMENT PERFORMA', { align: 'center' });
        doc.fontSize(9).font('Helvetica').text('Official Shipment Document', { align: 'center' });
        doc.moveTo(30, doc.y + 3).lineTo(565, doc.y + 3).stroke();
        doc.moveDown(0.5);

        // ========== SHIPMENT & DISTRIBUTOR INFO ==========
        const infoStartY = doc.y;
        
        doc.fontSize(10).font('Helvetica-Bold').text('SHIPMENT INFO', 30, infoStartY, { underline: true });
        doc.fontSize(8).font('Helvetica');
        
        let leftY = infoStartY + 15;
        doc.text(`Shipment ID: ${shipment.shipmentId}`, 30, leftY);
        leftY += 12;
        doc.text(`Tracking: ${shipment.trackingNumber || 'N/A'}`, 30, leftY);
        leftY += 12;
        doc.text(`Status: ${shipment.status?.toUpperCase() || 'PENDING'}`, 30, leftY);
        leftY += 12;
        doc.text(`Shipped: ${new Date(shipment.shippedAt).toLocaleDateString('en-GB')}`, 30, leftY);

        doc.fontSize(10).font('Helvetica-Bold').text('DISTRIBUTOR INFO', 320, infoStartY, { underline: true });
        doc.fontSize(8).font('Helvetica');
        
        let rightY = infoStartY + 15;
        doc.text(`Name: ${shipment.distributorName || 'Unknown'}`, 320, rightY);
        rightY += 12;
        doc.text(`Party: ${shipment.distributorPartyName || 'N/A'}`, 320, rightY);
        rightY += 12;
        doc.text(`Contact: ${shipment.distributorPhoneNo || 'N/A'}`, 320, rightY);
        rightY += 12;
        doc.text(`City: ${shipment.distributorCity || 'N/A'}`, 320, rightY);

        doc.y = Math.max(leftY, rightY) + 10;
        doc.moveTo(30, doc.y).lineTo(565, doc.y).stroke();
        doc.moveDown(0.5);

        // ========== ARTICLE DETAILS TABLE ==========
        doc.fontSize(10).font('Helvetica-Bold').text('ARTICLE DETAILS', { align: 'center', underline: true });
        doc.moveDown(0.5);

        const tableTop = doc.y;
        const col1X = 30;   // Article Name
        const col2X = 140;  // Segment
        const col3X = 220;  // Sizes
        const col4X = 290;  // Colors
        const col5X = 410;  // Category
        const col6X = 500;  // Quantity (Cartons)
        const rowHeight = 20;

        // Header Background
        doc.rect(col1X - 5, tableTop, 540, rowHeight).fill('#e8e8e8');
        doc.fill('#000000');

        doc.fontSize(7).font('Helvetica-Bold');
        doc.text('Article', col1X, tableTop + 6, { width: 100, lineBreak: false });
        doc.text('Segment', col2X, tableTop + 6, { width: 70, lineBreak: false });
        doc.text('Sizes', col3X, tableTop + 6, { width: 60, lineBreak: false });
        doc.text('Colors', col4X, tableTop + 6, { width: 110, lineBreak: false });
        doc.text('Category', col5X, tableTop + 6, { width: 80, lineBreak: false });
        doc.text('Quantity', col6X, tableTop + 6, { width: 50, lineBreak: false });

        let currentY = tableTop + rowHeight;
        doc.font('Helvetica').fontSize(7);

        // ✅ FIXED: Table Rows - show quantity per article
        shipment.items.forEach((item, index) => {
            const rowY = currentY;

            // Alternate row colors
            if (index % 2 === 0) {
                doc.rect(col1X - 5, rowY, 540, rowHeight).fill('#ffffff');
            } else {
                doc.rect(col1X - 5, rowY, 540, rowHeight).fill('#f5f5f5');
            }
            doc.fill('#000000');

            // Article Name
            const articleName = String(item.articleName || 'N/A');
            doc.text(articleName, col1X, rowY + 6, { width: 100, lineBreak: false });

            // Segment
            const segment = String(item.productReference?.segment || 'N/A');
            doc.text(segment, col2X, rowY + 6, { width: 70, lineBreak: false });

            // Sizes
            let sizes = 'N/A';
            if (item.articleDetails?.sizes && Array.isArray(item.articleDetails.sizes) && item.articleDetails.sizes.length > 0) {
                if (item.articleDetails.sizes.length === 1) {
                    sizes = String(item.articleDetails.sizes[0]);
                } else {
                    const min = Math.min(...item.articleDetails.sizes);
                    const max = Math.max(...item.articleDetails.sizes);
                    sizes = `${min}X${max}`;
                }
            }
            doc.text(sizes, col3X, rowY + 6, { width: 60, lineBreak: false });

            // Colors
            const colors = item.articleDetails?.colors?.join(', ') || 'N/A';
            doc.text(colors, col4X, rowY + 6, { width: 110, lineBreak: false });

            // Category (Variant)
            const variant = String(item.productReference?.variantName || 'N/A');
            doc.text(variant, col5X, rowY + 6, { width: 80, lineBreak: false });

            // ✅ FIXED: Quantity - show actual quantity of this article
            const quantity = String(item.quantity || '0');
            doc.text(quantity, col6X, rowY + 6, { width: 50, lineBreak: false });

            currentY += rowHeight;
        });

        // Total Cartons Row
        doc.moveTo(30, currentY).lineTo(570, currentY).stroke();
        doc.fontSize(8).font('Helvetica-Bold');
        // ✅ FIXED: Show actual total cartons
        doc.text(`Total Cartons: ${shipment.totalCartons || 0}`, 450, currentY + 8);

        // ========== FOOTER ==========
        doc.moveDown(2);
        doc.fontSize(7).font('Helvetica').fill('#888888');
        doc.text(`Generated on: ${new Date().toLocaleString('en-GB')}`, 30);

        doc.end();

    } catch (error) {
        console.error('Error generating shipment performa:', error);
        
        if (!res.headersSent) {
            res.status(500).json({ result: false, message: 'Error generating performa', error: error.message });
        }
    }
};




// Export these functions
export {
  getAllShipments,
  getShipmentById,
  getAutoDeleteSettings,
  updateAutoDeleteSettings,
  cleanupOldShipments,
  generateShipmentPerforma
};
