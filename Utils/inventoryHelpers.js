// Helper function to add item to inventory
const addToInventory = async (qrCode, scannedBy, location, notes) => {
  try {
    let inventory = await Inventory.findOne({ productId: qrCode.productId });
    
    if (!inventory) {
      inventory = new Inventory({
        productId: qrCode.productId,
        items: []
      });
    }

    // Parse QR data to get contractor input
    let contractorInput = {};
    try {
      const qrData = JSON.parse(qrCode.qrData);
      contractorInput = qrData.contractorInput || {};
    } catch (e) {
      console.log('Error parsing QR data:', e);
    }

    inventory.items.push({
      qrCodeId: qrCode._id,
      uniqueId: qrCode.uniqueId,
      articleName: qrCode.articleName,
      articleDetails: {
        color: contractorInput.colors,
        size: contractorInput.sizes,
        numberOfCartons: 1 // Each QR represents 1 carton
      },
      status: 'received',
      manufacturedAt: qrCode.manufacturingDetails?.manufacturedAt,
      receivedAt: new Date(),
      manufacturedBy: qrCode.manufacturingDetails?.manufacturedBy?.userId,
      receivedBy: scannedBy?.userId,
      notes
    });

    await inventory.save();
    console.log(`✅ Added carton ${qrCode.uniqueId} to inventory`);
    
  } catch (error) {
    console.error('Error adding to inventory:', error);
    throw error;
  }
};

// Helper function to remove from inventory and create shipment record
const removeFromInventoryAndCreateShipment = async (qrCode, scannedBy, distributorDetails, trackingNumber, notes) => {
  try {
    // Remove from inventory
    const inventory = await Inventory.findOne({ productId: qrCode.productId });
    
    if (!inventory) {
      throw new Error('Inventory not found for this product');
    }

    const itemIndex = inventory.items.findIndex(item => 
      item.qrCodeId.toString() === qrCode._id.toString()
    );

    if (itemIndex === -1) {
      throw new Error('Item not found in inventory');
    }

    const inventoryItem = inventory.items[itemIndex];
    
    // Remove from inventory
    inventory.items.splice(itemIndex, 1);
    await inventory.save();

    // Create or update shipment record
    let shipment = await Shipment.findOne({
      distributorId: distributorDetails.distributorId,
      status: 'active' // Find active shipment for this distributor
    });

    if (!shipment) {
      // Create new shipment
      shipment = new Shipment({
        shipmentId: `SHIP_${Date.now()}_${distributorDetails.distributorId}`,
        distributorId: distributorDetails.distributorId,
        distributorName: distributorDetails.distributorName,
        shippedBy: scannedBy?.userId,
        shippedAt: new Date(),
        items: [],
        totalCartons: 0,
        status: 'active'
      });
    }

    // Add item to shipment
    shipment.items.push({
      qrCodeId: qrCode._id,
      uniqueId: qrCode.uniqueId,
      articleName: qrCode.articleName,
      articleDetails: inventoryItem.articleDetails,
      manufacturedAt: inventoryItem.manufacturedAt,
      receivedAt: inventoryItem.receivedAt,
      shippedAt: new Date(),
      trackingNumber
    });

    shipment.totalCartons += 1;
    await shipment.save();

  } catch (error) {
    console.error('Error in inventory/shipment operation:', error);
    throw error;
  }
};

export {removeFromInventoryAndCreateShipment, addToInventory}