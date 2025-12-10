import jwt from "jsonwebtoken"
import userModel from "../../Models/user.model.js"
import zod from 'zod'
import bcrypt from "bcrypt"
import productModel from "../../Models/Product.model.js"
import dealsModel from "../../Models/Deals.model.js"
import Variants from "../../Models/Variants.Model.js"
import generateOrderPerformaPDF from "../../Utils/orderPerformaGenerator.js"
import purchaseProductModel from "../../Models/Purchasedproduct.model.js"
import mongoose from "mongoose"
import Inventory from "../../Models/Inventory.model.js"

let cookieOption = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: 'none'
}

let statusCodes = {
    success: 200,
    noContent:204,
    badRequest: 400,
    unauthorized: 403,
    notFound: 404,
    serverError: 500,
    forbidden: 402
}


const loginValidationSchema = zod.object({
        phoneNo: zod
          .number({ invalid_type_error: "Phone number must be a number" })
          .refine((val) => val.toString().length === 10, {
            message: "Phone number must be 10 digits",
          }),
        password: zod
          .string(),
})

const purchaseProductValidationSchema = zod.object({
  quantity: zod.number().min(1, "Quantity must be at least 1"),
  colors: zod.union([
    zod.array(zod.string().min(1)), // ✅ Accepts array of colors
    zod.string().min(1).transform((str) => [str]) // ✅ Converts single value to array
  ]),
  sizes: zod.union([
    zod.array(zod.string().min(1)), // ✅ Accepts array of sizes
    zod.string().min(1).transform((str) => [str]) // ✅ Converts single size to array
  ])

});

const login = async (req,res) => {
    try {
        let{phoneNo, password} = req?.body;

        let numPhone = Number(phoneNo)

        let checkValidation = loginValidationSchema.safeParse({phoneNo: numPhone, password})

        if(!checkValidation.success){
            return res.status(statusCodes.badRequest).send({result: false, message: checkValidation.error.errors[0].message})
        }

        let distributorInDb = await userModel.findOne({phoneNo: numPhone})

        if(!distributorInDb){
            return res.status(statusCodes.badRequest).send({result: false, message: "Account Not Found Or Phone No is Incorrect"});
        }

        let checkPassword = await bcrypt.compare(password, distributorInDb.password);

        if(!checkPassword){
            return res.status(statusCodes.badRequest).send({result: false, message: "Incorrect Password"});
        }

        const accessToken = jwt.sign({
                    _id: distributorInDb._id, role: "distributor"}
                    ,process.env.ACCESS_JWT_SECRET, 
                    {expiresIn: process.env.ACCESS_JWT_EXPIRY
              })
        
        const refreshToken = jwt.sign({
                _id: distributorInDb._id,
                role: "distributor"
                },process.env.REFRESH_JWT_SECRET,
                {expiresIn: process.env.REFRESH_JWT_EXPIRY}
              )
        
          await userModel.updateOne(
              { _id: distributorInDb._id}, 
              { $set: { refreshToken: refreshToken }}
          );
        
      return res.status(statusCodes.success).cookie("accessToken", accessToken, cookieOption).cookie("refreshToken", refreshToken, cookieOption).send({result: true, message: "Login Success", role: "distributor"});

    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: "Error in Logging In. Please Try Again Later"});
    }
}

const getDistributor = async (req,res) => {
  try {
    res.status(statusCodes.success).send({result: true, userdata: req?.user})
  } catch (error) {
    return res.status(500).send({result: false, message: "Error Getting Distributor"})
  }
}

const purchaseProduct = async (req, res) => {
  try {
    const distributor = req.user;
    const distributorId = distributor._id;

    if (!distributor) {
      return res.status(400).json({ message: "Distributor details missing" });
    }

    const distributorUser = await userModel.findById(distributorId);
    
    if (!distributorUser) {
      return res.status(404).json({ message: "Distributor not found" });
    }

    if (distributorUser.role !== 'distributor') {
      return res.status(403).json({ message: "User is not a distributor" });
    }

    const orders = req?.body.items;
    const orderDate = req?.body.orderDate;
    const transportSource = req?.body.transportSource;

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ message: "No orders provided" });
    }

    const items = orders.map((order) => ({
      articleName: order.articlename,
      articleImg: order.productImg,  // ✅ Make sure this is being passed from frontend
      productid: order.productid,
      totalCartons: order.quantity,
      colors: order.colors,
      sizes: order.sizes,
      claimedDeal: order.dealClaimed,
      dealReward: order.dealReward,
      variant: order.variant,
      segment: order.segment
    }));

    const newPurchaseOrder = await purchaseProductModel.create({
      distributorId: distributorUser._id,
      orderId: new mongoose.Types.ObjectId(),
      orderDate: orderDate,
      partyName: distributorUser.distributorDetails.partyName,
      phoneNo: distributorUser.phoneNo,
      transportSource: transportSource,
      items,
      isFulfiled: false,
    });

    distributorUser.distributorDetails.purchases.push(newPurchaseOrder._id);
    await distributorUser.save();

    res.status(201).json({
      result: true,
      message: "Order placed successfully",
      order: newPurchaseOrder,
      downloadUrl: `https://pinkeyfootwear.in/api/v1/distributor/orders/download-performa/${newPurchaseOrder._id}`,
    });
  } catch (error) {
    console.log(error);
    
    return res.status(500).json({
      success: false,
      message: "Error while placing order. Please try again later.",
    });
  }
};


const getPastOrders = async (req, res) => {
  try {
    const distributor = req.user;
    const distributorId = distributor._id;

    if (!distributor) {
      return res.status(400).json({ result: false, message: "Distributor details missing" });
    }

    const orders = await purchaseProductModel
      .find({ distributorId })
      .sort({ orderDate: -1 })
      .lean();

    return res.status(200).json({
      result: true,
      message: "Past orders fetched successfully",
      orders
    });
  } catch (error) {
    console.error("Error fetching past orders:", error);
    return res.status(500).json({
      result: false,
      message: "Error fetching past orders. Please try again later.",
      error: error.message
    });
  }
};



let generateOrderPerforma = async (req, res) => {
try {
    const { orderId } = req.params;
    // Find the order in the database.
    const order = await purchaseProductModel.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    // Generate and stream the PDF.
    generateOrderPerformaPDF(order, res);
  } catch (error) {
    res.status(500).json({
      message: "Error generating order performa. Please try again.",
      error: error.message
    });
  }
}

const getAllProducts = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "" } = req.query;
    let { filterName = [], filterOption = [] } = req.query;
    const includeInventory = true; // req.query

    try {
      filterName = JSON.parse(filterName);
      filterOption = JSON.parse(filterOption);
    } catch {
      filterName = [];
      filterOption = [];
    }

    const skip = (page - 1) * limit;
    const match = {};

    // Build your top-level match for segment, variant, gender
    filterName.forEach((key, i) => {
      const vals = Array.isArray(filterOption[i]) ? filterOption[i] : [filterOption[i]].filter(v => v);
      if (!vals.length) return;

      if (key === "segment") {
        match.segment = { $in: vals };
      } else if (key === "variant" || key === "variants") {
        if (!match["variants.name"]) match["variants.name"] = { $in: [] };
        match["variants.name"].$in.push(...vals);
      } else if (key === "gender") {
        if (!match["variants.articles.gender"]) match["variants.articles.gender"] = { $in: [] };
        match["variants.articles.gender"].$in.push(...vals);
      }
    });

    // Aggregation pipeline
    const pipeline = [];

    // ✅ Enhanced search with keywords support
    if (search.trim()) {
      const terms = search.trim().split(/\s+/);
      pipeline.push({
        $match: {
          $or: terms.flatMap(t => [
            { "variants.articles.name": { $regex: t, $options: "i" } },
            { "variants.articles.gender": { $regex: t, $options: "i" } },
            { "variants.articles.keywords": { $regex: t, $options: "i" } },  // ✅ Article keywords
            { "variants.name": { $regex: t, $options: "i" } },
            { "variants.keywords": { $regex: t, $options: "i" } },  // ✅ Variant keywords
            { "segment": { $regex: t, $options: "i" } },
            { "keywords": { $regex: t, $options: "i" } }  // ✅ Segment keywords
          ])
        }
      });
    }

    // Apply top-level matches
    if (Object.keys(match).length) {
      pipeline.push({ $match: match });
    }

    // Filter variants array to only those whose name matched
    if (match["variants.name"]) {
      pipeline.push({
        $addFields: {
          variants: {
            $filter: {
              input: "$variants",
              as: "v",
              cond: { $in: ["$$v.name", match["variants.name"].$in] }
            }
          }
        }
      });
    }

    // ✅ Filter articles by gender and search (including keywords)
    pipeline.push({
      $addFields: {
        variants: {
          $map: {
            input: "$variants",
            as: "v",
            in: {
              name: "$$v.name",
              keywords: "$$v.keywords",  // ✅ Include variant keywords
              articles: {
                $filter: {
                  input: "$$v.articles",
                  as: "a",
                  cond: {
                    $and: [
                      ...(match["variants.articles.gender"]
                        ? [{ $in: ["$$a.gender", match["variants.articles.gender"].$in] }]
                        : []),
                      ...(search.trim()
                        ? [{
                            $or: [
                              { $regexMatch: { input: "$$a.name", regex: search, options: "i" } },
                              { $regexMatch: { input: "$$a.gender", regex: search, options: "i" } },
                              // ✅ Search in article keywords array
                              {
                                $gt: [
                                  {
                                    $size: {
                                      $filter: {
                                        input: { $ifNull: ["$$a.keywords", []] },
                                        as: "kw",
                                        cond: { $regexMatch: { input: "$$kw", regex: search, options: "i" } }
                                      }
                                    }
                                  },
                                  0
                                ]
                              }
                            ]
                          }]
                        : [])
                    ]
                  }
                }
              }
            }
          }
        }
      }
    });

    // ADD INVENTORY DATA LOOKUP
    if (includeInventory === true) {
      pipeline.push(
        // Lookup inventory data for this product
        {
          $lookup: {
            from: "inventories",
            localField: "_id",
            foreignField: "productId",
            as: "inventoryData"
          }
        },
        // Unwind inventory data
        {
          $unwind: {
            path: "$inventoryData",
            preserveNullAndEmptyArrays: true
          }
        },
        // ADD INVENTORY DETAILS TO EACH ARTICLE
        {
          $addFields: {
            variants: {
              $map: {
                input: "$variants",
                as: "variant",
                in: {
                  name: "$$variant.name",
                  keywords: "$$variant.keywords",  // ✅ Keep variant keywords
                  articles: {
                    $map: {
                      input: "$$variant.articles",
                      as: "article",
                      in: {
                        // Original article fields (excluding colors/sizes from schema)
                        name: "$$article.name",
                        images: "$$article.images",
                        gender: "$$article.gender",
                        indeal: "$$article.indeal",
                        deal: "$$article.deal",
                        allColorsAvailable: "$$article.allColorsAvailable",
                        _id: "$$article._id",
                        keywords: "$$article.keywords",  // ✅ Include article keywords
                        // GET COLORS FROM INVENTORY ONLY
                        colors: {
                          $let: {
                            vars: {
                              articleInventory: {
                                $filter: {
                                  input: { $ifNull: ["$inventoryData.items", []] },
                                  as: "invItem",
                                  cond: {
                                    $and: [
                                      { $eq: ["$$invItem.articleName", "$$article.name"] },
                                      { $eq: ["$$invItem.status", "received"] },
                                      { $gt: ["$$invItem.articleDetails.numberOfCartons", 0] }
                                    ]
                                  }
                                }
                              }
                            },
                            in: {
                              $reduce: {
                                input: "$$articleInventory.articleDetails.colors",
                                initialValue: [],
                                in: { $setUnion: ["$$value", "$$this"] }
                              }
                            }
                          }
                        },
                        // GET SIZES FROM INVENTORY ONLY
                        sizes: {
                          $let: {
                            vars: {
                              articleInventory: {
                                $filter: {
                                  input: { $ifNull: ["$inventoryData.items", []] },
                                  as: "invItem",
                                  cond: {
                                    $and: [
                                      { $eq: ["$$invItem.articleName", "$$article.name"] },
                                      { $eq: ["$$invItem.status", "received"] },
                                      { $gt: ["$$invItem.articleDetails.numberOfCartons", 0] }
                                    ]
                                  }
                                }
                              }
                            },
                            in: {
                              $reduce: {
                                input: "$$articleInventory.articleDetails.sizes",
                                initialValue: [],
                                in: { $setUnion: ["$$value", "$$this"] }
                              }
                            }
                          }
                        },
                        // SIMPLE INVENTORY OBJECT WITH JUST TOTALCARTONS
                        inventory: {
                          $let: {
                            vars: {
                              articleInventory: {
                                $filter: {
                                  input: { $ifNull: ["$inventoryData.items", []] },
                                  as: "invItem",
                                  cond: {
                                    $and: [
                                      { $eq: ["$$invItem.articleName", "$$article.name"] },
                                      { $eq: ["$$invItem.status", "received"] },
                                      { $gt: ["$$invItem.articleDetails.numberOfCartons", 0] }
                                    ]
                                  }
                                }
                              }
                            },
                            in: {
                              totalCartons: {
                                $sum: "$$articleInventory.articleDetails.numberOfCartons"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        // Remove inventory raw data from response
        { $unset: "inventoryData" }
      );
    }

    // Pagination
    pipeline.push(
      { $skip: skip },
      { $limit: Number(limit) }
    );

    const results = await productModel.aggregate(pipeline);

    return res.status(200).json({
      result: !!results.length,
      message: results.length ? "Products fetched successfully" : "No products matched",
      data: results,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: results.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      result: false,
      message: "Error fetching products",
      error: err.message
    });
  }
};


const fetchFilters = async (req, res) => {
  try {
    // ✅ Top-level distinct segments
    const segments = await productModel.distinct("segment");

    // ✅ Extracting unique variant names from nested array
    const products = await productModel.find({}, { variants: 1 });

    const variantSet = new Set();
    products.forEach(product => {
      product.variants?.forEach(variant => {
        if (variant.name) {
          variantSet.add(variant.name);
        }
      });
    });

    const variantNames = Array.from(variantSet);

    res.status(statusCodes.success).json({
      result: true,
      message: "Filters Fetched",
      data: { segments, variants: variantNames },
    });
  } catch (error) {
    res.status(500).json({
      result: false,
      message: "Error fetching filters",
      error,
    });
  }
};
 
const fetchProductData = async (req, res) => {
  try {
    const { segment = '' } = req.query;

    // 🔍 Filter products by segment
    const products = await productModel.find(segment ? { segment } : {});

    // 🧪 Gather all articles from matching products
    const articleSet = new Set();
    const variantSet = new Set();

    products.forEach(product => {
      // Extract variant names
      product.variants?.forEach(variant => {
        if (variant.name) variantSet.add(variant.name);

        // Extract article names
        variant.articles?.forEach(article => {
          if (article.name) articleSet.add(article.name);
        });
      });
    });

    // Final distinct arrays
    const articles = Array.from(articleSet);
    const variants = Array.from(variantSet);

    return res.status(statusCodes.success).json({
      result: true,
      message: "Product Data Fetched",
      data: { segment, articles, variants },
    });
  } catch (error) {
    return res.status(statusCodes.serverError).json({
      result: false,
      message: "Error fetching Products Data",
      error
    });
  }
};

const fetchAllDealsImages = async (req,res) => {
  try {
    const dealsImages = await dealsModel.aggregate([
      {
        $group : {
          _id : null,
          allImages: { $push: "$image" }
        }
      }
    ])    

    if(dealsImages == []){
      return res.status(statusCodes.badRequest).send({result: false, message: "No Deals Images Found"})
    }

    return res.status(statusCodes.success).send({result: true, message: "Images Fetched", data: dealsImages[0].allImages})
  } catch (error) {
    res.status(500).json({ message: "Error fetching Deals Images" });
  }
}

const fetchArticleDetailsFromInventory = async (req, res) => {
  try {
    const { articleId } = req.params;

    if (!articleId) {
      return res.status(400).json({ 
        message: "Article ID is required",
        success: false 
      });
    }

    // Find all inventory documents that contain items with the specified articleId
    const inventories = await Inventory.find({
      'items.articleDetails.articleId': articleId
    }).populate('productId', 'name description'); // Optional: populate product details

    if (!inventories || inventories.length === 0) {
      return res.status(404).json({ 
        message: "No inventory found for this article ID",
        success: false 
      });
    }

    // Aggregate data from all matching items across inventories
    let allColors = new Set();
    let allSizes = new Set();
    let totalAvailableStock = 0;
    let articleName = '';
    let receivedItems = 0;
    let shippedItems = 0;

    inventories.forEach(inventory => {
      // Filter items that match the articleId
      const matchingItems = inventory.items.filter(item => 
        item.articleDetails.articleId && 
        item.articleDetails.articleId.toString() === articleId.toString()
      );

      matchingItems.forEach(item => {
        // Set article name (take from first item)
        if (!articleName && item.articleName) {
          articleName = item.articleName;
        }

        // Collect colors
        if (item.articleDetails.colors && Array.isArray(item.articleDetails.colors)) {
          item.articleDetails.colors.forEach(color => {
            if (color && color !== 'Unknown') {
              allColors.add(color);
            }
          });
        }

        // Collect sizes
        if (item.articleDetails.sizes && Array.isArray(item.articleDetails.sizes)) {
          item.articleDetails.sizes.forEach(size => {
            if (size && size !== 0) {
              allSizes.add(size);
            }
          });
        }

        // Count items by status
        if (item.status === 'received') {
          receivedItems++;
        } else if (item.status === 'shipped') {
          shippedItems++;
        }
      });
    });

    // Calculate available stock (received - shipped)
    totalAvailableStock = receivedItems - shippedItems;

    // Convert Sets to sorted arrays
    const colors = Array.from(allColors).sort();
    const sizes = Array.from(allSizes).sort((a, b) => a - b);

    // Helper function to format size range
    const formatSizeRange = (sizes) => {
      if (!sizes || sizes.length === 0) return 'N/A';
      if (sizes.length === 1) return sizes[0].toString();
      
      const sortedSizes = [...sizes].sort((a, b) => a - b);
      return `${sortedSizes[0]}X${sortedSizes[sortedSizes.length - 1]}`;
    };

    const response = {
      success: true,
      data: {
        articleId,
        articleName: articleName || 'Unknown Article',
        colors: colors.length > 0 ? colors : ['N/A'],
        sizes: sizes.length > 0 ? sizes : [0],
        sizeRange: formatSizeRange(sizes),
        availableStock: Math.max(0, totalAvailableStock), // Ensure non-negative
        stockBreakdown: {
          received: receivedItems,
          shipped: shippedItems,
          available: Math.max(0, totalAvailableStock)
        },
        totalInventoryDocuments: inventories.length,
        lastUpdated: inventories.reduce((latest, inv) => {
          return (!latest || inv.lastUpdated > latest) ? inv.lastUpdated : latest;
        }, null)
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    return res.status(500).json({ 
      message: "Error fetching article details from inventory",
      success: false,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const searchProducts = async (req, res) => {
  try {
    let { page = 1, limit = 12, search = "" } = req.query;
    
    const skip = (page - 1) * limit;
    
    if (!search || !search.trim()) {
      return res.status(200).json({
        result: false,
        message: "Search query is required",
        data: [],
        pagination: { page: Number(page), limit: Number(limit), total: 0 }
      });
    }

    const searchTerms = search.trim().toLowerCase().split(/\s+/);
    
    // Build comprehensive search pipeline
    const pipeline = [
      {
        $match: {
          $or: [
            // Search in segment
            { segment: { $regex: search.trim(), $options: "i" } },
            // Search in segment keywords
            { keywords: { $elemMatch: { $regex: search.trim(), $options: "i" } } },
            // Search in variants
            { "variants.name": { $regex: search.trim(), $options: "i" } },
            { "variants.keywords": { $elemMatch: { $regex: search.trim(), $options: "i" } } },
            // Search in articles
            { "variants.articles.name": { $regex: search.trim(), $options: "i" } },
            { "variants.articles.gender": { $regex: search.trim(), $options: "i" } },
            { "variants.articles.keywords": { $elemMatch: { $regex: search.trim(), $options: "i" } } }
          ]
        }
      },
      // Filter variants that match search
      {
        $addFields: {
          variants: {
            $map: {
              input: "$variants",
              as: "variant",
              in: {
                name: "$$variant.name",
                keywords: "$$variant.keywords",
                articles: {
                  $filter: {
                    input: "$$variant.articles",
                    as: "article",
                    cond: {
                      $or: [
                        // Match article name
                        { $regexMatch: { input: "$$article.name", regex: search.trim(), options: "i" } },
                        // Match article gender
                        { $regexMatch: { input: "$$article.gender", regex: search.trim(), options: "i" } },
                        // Match article keywords
                        { $gt: [{ $size: { $filter: { input: { $ifNull: ["$$article.keywords", []] }, as: "kw", cond: { $regexMatch: { input: "$$kw", regex: search.trim(), options: "i" } } } } }, 0] },
                        // Match segment
                        { $regexMatch: { input: "$segment", regex: search.trim(), options: "i" } },
                        // Match segment keywords
                        { $gt: [{ $size: { $filter: { input: { $ifNull: ["$keywords", []] }, as: "kw", cond: { $regexMatch: { input: "$$kw", regex: search.trim(), options: "i" } } } } }, 0] },
                        // Match variant name
                        { $regexMatch: { input: "$$variant.name", regex: search.trim(), options: "i" } },
                        // Match variant keywords
                        { $gt: [{ $size: { $filter: { input: { $ifNull: ["$$variant.keywords", []] }, as: "kw", cond: { $regexMatch: { input: "$$kw", regex: search.trim(), options: "i" } } } } }, 0] }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      // Remove variants with no articles
      {
        $addFields: {
          variants: {
            $filter: {
              input: "$variants",
              as: "v",
              cond: { $gt: [{ $size: "$$v.articles" }, 0] }
            }
          }
        }
      },
      // Only keep products with matching variants
      {
        $match: {
          "variants.0": { $exists: true }
        }
      },
      // Lookup inventory data
      {
        $lookup: {
          from: "inventories",
          localField: "_id",
          foreignField: "productId",
          as: "inventoryData"
        }
      },
      {
        $unwind: {
          path: "$inventoryData",
          preserveNullAndEmptyArrays: true
        }
      },
      // Add inventory details to articles
      {
        $addFields: {
          variants: {
            $map: {
              input: "$variants",
              as: "variant",
              in: {
                name: "$$variant.name",
                keywords: "$$variant.keywords",
                articles: {
                  $map: {
                    input: "$$variant.articles",
                    as: "article",
                    in: {
                      name: "$$article.name",
                      images: "$$article.images",
                      gender: "$$article.gender",
                      indeal: "$$article.indeal",
                      deal: "$$article.deal",
                      allColorsAvailable: "$$article.allColorsAvailable",
                      _id: "$$article._id",
                      keywords: "$$article.keywords",
                      // Get colors from inventory
                      colors: {
                        $let: {
                          vars: {
                            articleInventory: {
                              $filter: {
                                input: { $ifNull: ["$inventoryData.items", []] },
                                as: "invItem",
                                cond: {
                                  $and: [
                                    { $eq: ["$$invItem.articleName", "$$article.name"] },
                                    { $eq: ["$$invItem.status", "received"] },
                                    { $gt: ["$$invItem.articleDetails.numberOfCartons", 0] }
                                  ]
                                }
                              }
                            }
                          },
                          in: {
                            $reduce: {
                              input: "$$articleInventory.articleDetails.colors",
                              initialValue: [],
                              in: { $setUnion: ["$$value", "$$this"] }
                            }
                          }
                        }
                      },
                      // Get sizes from inventory
                      sizes: {
                        $let: {
                          vars: {
                            articleInventory: {
                              $filter: {
                                input: { $ifNull: ["$inventoryData.items", []] },
                                as: "invItem",
                                cond: {
                                  $and: [
                                    { $eq: ["$$invItem.articleName", "$$article.name"] },
                                    { $eq: ["$$invItem.status", "received"] },
                                    { $gt: ["$$invItem.articleDetails.numberOfCartons", 0] }
                                  ]
                                }
                              }
                            }
                          },
                          in: {
                            $reduce: {
                              input: "$$articleInventory.articleDetails.sizes",
                              initialValue: [],
                              in: { $setUnion: ["$$value", "$$this"] }
                            }
                          }
                        }
                      },
                      // Inventory count
                      inventory: {
                        $let: {
                          vars: {
                            articleInventory: {
                              $filter: {
                                input: { $ifNull: ["$inventoryData.items", []] },
                                as: "invItem",
                                cond: {
                                  $and: [
                                    { $eq: ["$$invItem.articleName", "$$article.name"] },
                                    { $eq: ["$$invItem.status", "received"] },
                                    { $gt: ["$$invItem.articleDetails.numberOfCartons", 0] }
                                  ]
                                }
                              }
                            }
                          },
                          in: {
                            totalCartons: {
                              $sum: "$$articleInventory.articleDetails.numberOfCartons"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      // Remove inventory raw data
      { $unset: "inventoryData" },
      // Pagination
      { $skip: skip },
      { $limit: Number(limit) }
    ];

    const results = await productModel.aggregate(pipeline);

    return res.status(200).json({
      result: !!results.length,
      message: results.length ? "Products found" : "No products matched your search",
      data: results,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: results.length
      }
    });

  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({
      result: false,
      message: "Error searching products",
      error: err.message
    });
  }
};




export {login, purchaseProduct, getAllProducts,fetchFilters, fetchProductData, fetchAllDealsImages, generateOrderPerforma, getDistributor, fetchArticleDetailsFromInventory, searchProducts, getPastOrders}


