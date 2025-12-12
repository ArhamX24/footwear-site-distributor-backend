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
    console.error('[SHIPMENTS] Error:', error);
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
    console.error('[SHIPMENT-DETAILS] Error:', error);
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
    console.error('[CLEANUP] Error:', error);
    res.status(500).json({
      result: false,
      message: 'Failed to cleanup shipments'
    });
  }
};

const generateShipmentPerforma = async (req, res) => {
    try {
        const { shipmentId } = req.params;

        // Get shipment data
        const shipment = await Shipment.findById(shipmentId)
            .populate('distributorId', 'distributorDetails contactDetails')
            .exec();

        if (!shipment) {
            return res.status(404).json({ result: false, message: 'Shipment not found' });
        }

        // Create PDF Document
        const doc = new PDFDocument({
            size: 'A4',
            margin: 40
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Performa_${shipment.shipmentId}.pdf"`);

        // Pipe to response
        doc.pipe(res);

        // ========== HEADER SECTION ==========
        doc.fontSize(24).font('Helvetica-Bold').text('SHIPMENT PERFORMA', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text('Official Shipment Document', { align: 'center' });
        doc.moveTo(40, doc.y + 5).lineTo(555, doc.y + 5).stroke();
        doc.moveDown(0.5);

        // ========== SHIPMENT & DISTRIBUTOR INFO ==========
        doc.fontSize(11).font('Helvetica-Bold').text('SHIPMENT INFORMATION', { underline: true });
        doc.fontSize(10).font('Helvetica');

        const infoStartY = doc.y;
        
        // Left Column - Shipment Details
        doc.text(`Shipment ID: ${shipment.shipmentId}`, 50);
        doc.text(`Tracking Number: ${shipment.trackingNumber || 'N/A'}`);
        doc.text(`Status: ${shipment.status?.toUpperCase() || 'PENDING'}`);
        doc.text(`Shipped Date: ${new Date(shipment.shippedAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`);

        // Right Column - Distributor Details
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('DISTRIBUTOR INFORMATION', 320);
        doc.font('Helvetica');
        doc.text(`Name: ${shipment.distributorName || 'Unknown'}`, 320);
        
        if (shipment.distributorId?.distributorDetails) {
            const distDetails = shipment.distributorId.distributorDetails;
            doc.text(`Party Name: ${distDetails.partyName || 'N/A'}`, 320);
            doc.text(`Contact: ${distDetails.mobileNo || distDetails.phoneNo || 'N/A'}`, 320);
            doc.text(`City: ${distDetails.city || 'N/A'}`, 320);
        }

        doc.moveTo(40, doc.y + 10).lineTo(555, doc.y + 10).stroke();
        doc.moveDown(0.5);

        // ========== SHIPMENT MANAGER DETAILS ==========
        if (shipment.shippedBy && Object.keys(shipment.shippedBy).length > 0) {
            doc.fontSize(11).font('Helvetica-Bold').text('SHIPMENT MANAGER', { underline: true });
            doc.font('Helvetica').fontSize(10);
            doc.text(`Name: ${shipment.shippedBy.name || 'N/A'}`);
            doc.text(`Email: ${shipment.shippedBy.email || 'N/A'}`);
            doc.text(`Phone: ${shipment.shippedBy.phone || 'N/A'}`);
            doc.moveTo(40, doc.y + 10).lineTo(555, doc.y + 10).stroke();
            doc.moveDown(0.5);
        }

        // ========== ARTICLE DETAILS TABLE ==========
        doc.fontSize(11).font('Helvetica-Bold').text('ARTICLE DETAILS', { underline: true });
        doc.moveDown(0.3);

        // Table Header
        const tableTop = doc.y;
        const col1X = 50;
        const col2X = 150;
        const col3X = 270;
        const col4X = 380;
        const col5X = 480;
        const rowHeight = 30;

        // Header Background
        doc.rect(col1X - 10, tableTop, 525, rowHeight).fill('#f0f0f0');
        doc.fill('#000000');

        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Article Name', col1X, tableTop + 8);
        doc.text('Variant', col2X, tableTop + 8);
        doc.text('Sizes', col3X, tableTop + 8);
        doc.text('Colors', col4X, tableTop + 8);
        doc.text('Cartons', col5X, tableTop + 8);

        let currentY = tableTop + rowHeight;
        doc.font('Helvetica').fontSize(9);

        // Table Rows
        shipment.items.forEach((item, index) => {
            const rowY = currentY;

            // Alternate row colors
            if (index % 2 === 0) {
                doc.rect(col1X - 10, rowY, 525, rowHeight).fill('#ffffff');
                doc.fill('#000000');
            } else {
                doc.rect(col1X - 10, rowY, 525, rowHeight).fill('#f9f9f9');
                doc.fill('#000000');
            }

            // Article Name
            doc.text(item.articleName || 'N/A', col1X, rowY + 8, { width: 95 });

            // Variant
            doc.text(item.productReference?.variantName || 'N/A', col2X, rowY + 8, { width: 110 });

            // Sizes
            const sizes = item.sizes?.join(', ') || 'N/A';
            doc.text(sizes, col3X, rowY + 8, { width: 100 });

            // Colors
            const colors = item.articleDetails?.colors?.join(', ') || 'N/A';
            doc.text(colors, col4X, rowY + 8, { width: 90 });

            // Cartons
            doc.text(item.totalCartons?.toString() || '0', col5X, rowY + 8, { width: 50 });

            currentY += rowHeight;
        });

        // Total Cartons
        doc.moveTo(40, currentY).lineTo(555, currentY).stroke();
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text(`Total Cartons: ${shipment.totalCartons || 0}`, 450, currentY + 10);

        doc.moveDown(2);

        // ========== ADDITIONAL INFO ==========
        if (shipment.notes) {
            doc.fontSize(10).font('Helvetica-Bold').text('NOTES', { underline: true });
            doc.font('Helvetica').fontSize(9).text(shipment.notes, { align: 'left' });
        }

        // ========== FOOTER ==========
        const pageHeight = doc.page.height;
        const footerY = pageHeight - 60;

        doc.moveTo(40, footerY).lineTo(555, footerY).stroke();
        doc.fontSize(8).font('Helvetica').fill('#666666');
        doc.text(`Generated on: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 50, footerY + 10);
        doc.text(`This is an official shipment performa`, 50, footerY + 25, { align: 'center' });

        // End document
        doc.end();

    } catch (error) {
        console.error('Error generating shipment performa:', error);
        res.status(500).json({ result: false, message: 'Error generating performa', error: error.message });
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
