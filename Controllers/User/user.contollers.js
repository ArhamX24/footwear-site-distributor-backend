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
import Festive from "../../Models/Festivle.model.js"
import { createDemandFromOrder } from "../Admin/demand.controllers.js"

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


    await newPurchaseOrder.save();
    await distributorUser.save();


    
    // ✅ HOTFIX: Create demand AFTER order saved
    await createDemandFromOrder(items, newPurchaseOrder._id);


    res.status(201).json({
      result: true,
      message: "Order placed successfully",
      order: newPurchaseOrder,
      downloadUrl: `https://pinkeyfootwear.in/api/v1/distributor/orders/download-performa/${newPurchaseOrder._id}`,
    });
  } catch (error) {
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

    // ✅ Simple findOne - no need to populate QRCodes for colors/sizes
    const inventory = await Inventory.findOne({ 
      articleId: articleId.toString() 
    });

    if (!inventory) {
      return res.status(404).json({ 
        message: "No inventory found for this article ID",
        success: false 
      });
    }

    // ✅ Use colors and sizes directly from inventory document
    const colors = inventory.colors || [];
    const sizes = inventory.sizes || [];

    // Format size range
    const formatSizeRange = (sizes) => {
      if (!sizes || sizes.length === 0) return 'N/A';
      if (sizes.length === 1) return sizes[0].toString();
      
      const sortedSizes = [...sizes].sort((a, b) => a - b);
      return `${sortedSizes[0]}X${sortedSizes[sortedSizes.length - 1]}`;
    };

    const response = {
      success: true,
      data: {
        articleId: inventory.articleId,
        articleName: inventory.articleName || 'Unknown Article',
        segment: inventory.segment || 'Unknown',
        articleImage: inventory.articleImage || null,
        colors: colors,
        sizes: sizes,
        sizeRange: formatSizeRange(sizes),
        availableStock: inventory.availableQuantity,
        stockBreakdown: {
          received: inventory.receivedQuantity,
          shipped: inventory.shippedQuantity,
          available: inventory.availableQuantity
        },
        lastUpdated: inventory.lastUpdated || inventory.updatedAt
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
    let { page = 1, limit = 12, search = "", segment = "", genders = "[]" } = req.query;

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // Safely parse explicit gender filters from frontend
    let genderArr = [];
    try { 
      genderArr = JSON.parse(genders); 
    } catch (e) { 
      genderArr = []; 
    }

    if (!search && !segment && genderArr.length === 0) {
      return res.status(200).json({
        result: false,
        message: "Search query or filters required",
        data: [],
        pagination: { page: pageNum, limit: limitNum, hasMore: false },
      });
    }

    const tokenToFlexRegex = (token) => token.split("").join("-?");
    const normalise = (str) => str.toLowerCase().replace(/-/g, "").replace(/\s+/g, " ").trim();
    
    // Split "EVA GENTS" into ["eva", "gents"]
    const tokens = search ? normalise(search).split(" ").filter(Boolean) : [];

    // ── 1. Match Stage (Top-Level Filtering) ──────────────────────────────────
    const matchStage = { $and: [] };

    // Strict explicitly selected segment
    if (segment) {
      matchStage.$and.push({ segment: { $regex: `^${segment}$`, $options: "i" } });
    }

    // Strict explicitly selected genders
    if (genderArr.length > 0) {
      const genderRegexes = genderArr.map(g => new RegExp(`^${g}$`, "i"));
      matchStage.$and.push({ "variants.articles.gender": { $in: genderRegexes } });
    }

    // Search keywords (MUST match all words entered in the box)
    tokens.forEach((token) => {
      const rx = tokenToFlexRegex(token);
      matchStage.$and.push({
        $or: [
          { segment: { $regex: rx, $options: "i" } },
          { keywords: { $regex: rx, $options: "i" } },
          { "variants.name": { $regex: rx, $options: "i" } },
          { "variants.keywords": { $regex: rx, $options: "i" } },
          { "variants.articles.name": { $regex: rx, $options: "i" } },
          { "variants.articles.gender": { $regex: rx, $options: "i" } },
          { "variants.articles.articleKeywords": { $regex: rx, $options: "i" } },
          { "variants.articles.segmentKeywords": { $regex: rx, $options: "i" } },
          { "variants.articles.variantKeywords": { $regex: rx, $options: "i" } }
        ]
      });
    });

    const finalMatch = matchStage.$and.length > 0 ? matchStage : {};

    // ── 2. Article-Level Strict Filtering ──────────────────────────────────────
    const articleFilterAnd = [];

    // Articles MUST match the selected UI gender filters
    if (genderArr.length > 0) {
      articleFilterAnd.push({
        $gt: [
          {
            $size: {
              $filter: {
                input: { $ifNull: ["$$article.gender", []] },
                as: "g",
                cond: { $in: [{ $toLower: "$$g" }, genderArr.map(g => g.toLowerCase())] }
              }
            }
          },
          0
        ]
      });
    }

    // Articles MUST match ALL space-separated search words (e.g. "EVA" AND "GENTS")
    tokens.forEach((token) => {
      const rx = tokenToFlexRegex(token);
      articleFilterAnd.push({
        $or: [
          { $regexMatch: { input: { $ifNull: ["$$article.name", ""] }, regex: rx, options: "i" } },
          { $regexMatch: { input: { $ifNull: ["$segment", ""] }, regex: rx, options: "i" } },
          { $regexMatch: { input: { $ifNull: ["$$variant.name", ""] }, regex: rx, options: "i" } },
          {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: { $ifNull: ["$$article.gender", []] },
                    as: "g",
                    cond: { $regexMatch: { input: "$$g", regex: rx, options: "i" } }
                  }
                }
              },
              0
            ]
          },
          {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: { $ifNull: ["$$article.articleKeywords", []] },
                    as: "kw",
                    cond: { $regexMatch: { input: "$$kw", regex: rx, options: "i" } }
                  }
                }
              },
              0
            ]
          }
        ]
      });
    });

    const articleCond = articleFilterAnd.length > 0 ? { $and: articleFilterAnd } : true;

    const pipeline = [
      { $match: finalMatch },
      { $skip: skip },
      { $limit: limitNum },

      // Filter deeply nested articles to remove mismatches
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
                    cond: articleCond
                  }
                }
              }
            }
          }
        }
      },

      // Drop variants that became empty because no articles matched
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
      { $match: { "variants.0": { $exists: true } } },

      // ── 3. Inventory lookup (Unchanged) ─────────────────────────────────────
      {
        $lookup: {
          from: "inventories",
          localField: "_id",
          foreignField: "productId",
          as: "inventoryData",
        },
      },
      {
        $addFields: {
          variants: {
            $map: {
              input: "$variants",
              as: "variant",
              in: {
                name: "$$variant.name",
                articles: {
                  $map: {
                    input: "$$variant.articles",
                    as: "article",
                    in: {
                      _id: "$$article._id",
                      name: "$$article.name",
                      images: "$$article.images",
                      gender: "$$article.gender",
                      hasInventory: {
                        $gt: [
                          {
                            $size: {
                              $filter: {
                                input: { $ifNull: [{ $arrayElemAt: ["$inventoryData.items", 0] }, []] },
                                as: "inv",
                                cond: { $eq: ["$$inv.articleName", "$$article.name"] },
                              },
                            },
                          },
                          0,
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      { $unset: "inventoryData" },
    ];

    const results = await productModel.aggregate(pipeline);

    return res.status(200).json({
      result: !!results.length,
      message: results.length ? "Products found" : "No matches",
      data: results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        hasMore: results.length === limitNum,
        count: results.length,
      },
    });
  } catch (err) {
    res.status(500).json({ result: false, message: "Search failed", error: err.message });
  }
};
 

const getAllProducts = async (req, res) => {
  try {
    let { page = 1, limit = 12 } = req.query;
    let { filterName = [], filterOption = [] } = req.query;
 
    try {
      filterName   = JSON.parse(filterName);
      filterOption = JSON.parse(filterOption);
    } catch {
      filterName   = [];
      filterOption = [];
    }
 
    const pageNum  = Number(page);
    const limitNum = Number(limit);
    const skip     = (pageNum - 1) * limitNum;
 
    // ── Collect active filter values ─────────────────────────────────────────
    let segmentVals = [];
    let genderVals  = [];
    // (variant filter kept for future use)
 
    filterName.forEach((key, i) => {
      const vals = Array.isArray(filterOption[i])
        ? filterOption[i]
        : [filterOption[i]].filter(Boolean);
      if (!vals.length) return;
 
      if (key === "segment")             segmentVals = vals;
      else if (key === "gender")         genderVals  = vals;
    });
 
    // ── Top-level $match (only fields that exist at product level) ───────────
    const topMatch = {};
    if (segmentVals.length) topMatch.segment = { $in: segmentVals };
 
    const pipeline = [];
 
    if (Object.keys(topMatch).length) {
      pipeline.push({ $match: topMatch });
    }
 
    // ── Paginate BEFORE per-article processing for performance ───────────────
    pipeline.push({ $skip: skip }, { $limit: limitNum });
 
    // ── Gender filter: article.gender is [String], so use $filter + $size ───
    if (genderVals.length) {
      pipeline.push({
        $addFields: {
          variants: {
            $map: {
              input: "$variants",
              as:    "variant",
              in: {
                name:     "$$variant.name",
                keywords: "$$variant.keywords",
                articles: {
                  $filter: {
                    input: "$$variant.articles",
                    as:    "article",
                    // Keep article if its gender array contains ANY selected gender
                    cond: {
                      $gt: [
                        {
                          $size: {
                            $filter: {
                              input: { $ifNull: ["$$article.gender", []] },
                              as:    "g",
                              cond:  {
                                $in: [
                                  { $toLower: "$$g" },
                                  genderVals.map((v) => v.toLowerCase()),
                                ],
                              },
                            },
                          },
                        },
                        0,
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      });
 
      // Drop variants left with no articles after gender filter
      pipeline.push({
        $addFields: {
          variants: {
            $filter: {
              input: "$variants",
              as:    "v",
              cond:  { $gt: [{ $size: "$$v.articles" }, 0] },
            },
          },
        },
      });
 
      pipeline.push({ $match: { "variants.0": { $exists: true } } });
    }
 
    // ── Inventory lookup ─────────────────────────────────────────────────────
    pipeline.push(
      {
        $lookup: {
          from:         "inventories",
          localField:   "_id",
          foreignField: "productId",
          as:           "inventoryData",
        },
      },
      {
        $addFields: {
          variants: {
            $map: {
              input: "$variants",
              as:    "variant",
              in: {
                name:     "$$variant.name",
                keywords: "$$variant.keywords",
                articles: {
                  $map: {
                    input: "$$variant.articles",
                    as:    "article",
                    in: {
                      _id:    "$$article._id",
                      name:   "$$article.name",
                      images: "$$article.images",
                      gender: "$$article.gender",
                      hasInventory: {
                        $gt: [
                          {
                            $size: {
                              $filter: {
                                input: { $ifNull: [{ $arrayElemAt: ["$inventoryData.items", 0] }, []] },
                                as:    "inv",
                                cond:  { $eq: ["$$inv.articleName", "$$article.name"] },
                              },
                            },
                          },
                          0,
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      { $unset: "inventoryData" }
    );
 
    const results = await productModel.aggregate(pipeline);
 
    return res.status(200).json({
      result:  !!results.length,
      message: results.length ? "Products fetched" : "No products found",
      data:    results,
      pagination: {
        page:    pageNum,
        limit:   limitNum,
        hasMore: results.length === limitNum,
        count:   results.length,
      },
    });
  } catch (err) {
    res.status(500).json({ result: false, message: "Error fetching products", error: err.message });
  }
};
const getCombinedOffers = async (req, res) => {
    try {
        const currentDate = new Date();

        // Fetch active deals and festivals in parallel
        const [activeDeals, activeFestivals] = await Promise.all([
            // Get active deals that haven't expired
            dealsModel.find({
                isActive: true,
                endDate: { $gte: currentDate }
            })
            .select('image dealName startDate endDate')
            .sort({ startDate: -1 })
            .lean(),

            // Get active festivals that haven't expired
            Festive.find({
                endDate: { $gte: currentDate }
            })
            .select('image startDate endDate')
            .sort({ startDate: -1 })
            .lean()
        ]);

        // Transform deals data
        const dealsData = activeDeals.map(deal => ({
            image: deal.image,
            type: 'deal',
            name: deal.dealName,
            startDate: deal.startDate,
            endDate: deal.endDate,
            _id: deal._id
        }));

        // Transform festivals data
        const festivalsData = activeFestivals.map(festival => ({
            image: festival.image,
            type: 'festival',
            startDate: festival.startDate,
            endDate: festival.endDate,
            _id: festival._id
        }));

        // Combine both arrays
        const combinedOffers = [...dealsData, ...festivalsData];

        // Sort by startDate (newest first)
        combinedOffers.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

        return res.status(200).json({
            result: true,
            message: "Combined offers fetched successfully",
            data: combinedOffers,
            count: {
                deals: dealsData.length,
                festivals: festivalsData.length,
                total: combinedOffers.length
            }
        });

    } catch (error) {
  
        return res.status(500).json({
            result: false,
            message: "Failed to fetch offers",
            error: error.message
        });
    }
};

export {login, purchaseProduct, getAllProducts,fetchFilters, fetchProductData, fetchAllDealsImages, generateOrderPerforma, getDistributor, fetchArticleDetailsFromInventory, searchProducts, getPastOrders, getCombinedOffers}


