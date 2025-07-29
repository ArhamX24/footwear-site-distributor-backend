import jwt from "jsonwebtoken"
import userModel from "../../Models/distributor.model.js"
import statusCodes from "../../Utils/statuscodes.js"
import zod from 'zod'
import bcrypt from "bcrypt"
import productModel from "../../Models/Product.model.js"
import dealsModel from "../../Models/Deals.model.js"
import Variants from "../../Models/Variants.Model.js"
import generateOrderPerformaPDF from "../../Utils/orderPerformaGenerator.js"
import purchaseProductModel from "../../Models/Purchasedproduct.model.js"
import mongoose from "mongoose"

let cookieOption = {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: 'Lax'
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
    res.status(statusCodes.success).send({result: true, userdata: req?.distributor})
  } catch (error) {
    return res.status(500).send({result: false, message: "Error Getting Distributor"})
  }
}

const purchaseProduct = async (req,res) => {
   try {
    // Assume distributor details are attached to req (for example, via a middleware)
    const distributor = req.distributor; // distributor should include billNo, partyName, phoneNo, _id, etc.
    if (!distributor) {
      return res.status(400).json({ message: "Distributor details missing" });
    }
    
    // Expect an array of orders in the request body
    const orders = req?.body.items;
    const orderDate = req?.body.orderDate
  
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ message: "No orders provided" });
    }

    // Map the orders array to create an items array that includes distributor details.
    const items = orders.map((order) => ({
      articleName: order.articlename,
      articleImg: order.productImg,
      productid: order.productid,
      totalCartons: order.quantity,
      colors: order.colors,
      sizes: order.sizes,
      claimedDeal: order.dealClaimed,
      dealReward: order.dealReward,
      variant: order.variant,
      segment: order.segment
    }));

    // Create and save the purchase order to the database
    const newPurchaseOrder = await purchaseProductModel.create({
      distributorId: distributor._id,
      orderId: new mongoose.Types.ObjectId(), // your generated orderId
      orderDate: orderDate,
      billNo: distributor.billNo,           // from distributor details
      partyName: distributor.partyName,     // from distributor details
      phoneNo: distributor.phoneNo,                 // or set from req.body if provided
      items,                                // our mapped items array
      isFulfiled: false,                    // default, or update as needed
    });

    // Return success along with a download URL for the Order Performa PDF.
    // (Assuming you have an endpoint `/api/v1/distributor/orders/download/:orderId` for PDF download.)
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
}

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
    let { filterName = "[]", filterOption = "[]" } = req.query;

    try {
      filterName   = JSON.parse(filterName);
      filterOption = JSON.parse(filterOption);
    } catch {
      filterName = [];
      filterOption = [];
    }

    const skip = (page - 1) * limit;
    const match = {}; 

    // 1) Build your top-level match for segment, variant & gender:
    filterName.forEach((key, i) => {
      const vals = (Array.isArray(filterOption[i]) ? filterOption[i] : [filterOption[i]])
        .filter(v => v);
      if (!vals.length) return;

      if (key === "segment") {
        match.segment = { $in: vals };
      }
      else if (key === "variant" || key === "variants") {
        // ensure the document has at least one matching variant
        match["variants.name"] = match["variants.name"] || { $in: [] };
        match["variants.name"].$in.push(...vals);
      }
      else if (key === "gender") {
        // ensure the document has at least one article with matching gender
        match["variants.articles.gender"] = 
          match["variants.articles.gender"] || { $in: [] };
        match["variants.articles.gender"].$in.push(...vals);
      }
    });

    // 2) Aggregation pipeline
    const pipeline = [];

    // apply search if needed (matches article‐fields but still returns full docs)
    if (search.trim()) {
      const terms = search.trim().split(/\s+/);
      pipeline.push({
        $match: {
          $or: terms.flatMap(t => [
            { "variants.articles.name":   { $regex: t, $options: "i" } },
            { "variants.articles.gender": { $regex: t, $options: "i" } }
          ])
        }
      });
    }

    // apply our top‐level matches
    if (Object.keys(match).length) {
      pipeline.push({ $match: match });
    }

    // 3) Filter variants array to only those whose name matched
    if (match["variants.name"]) {
      pipeline.push({
        $addFields: {
          variants: {
            $filter: {
              input: "$variants",
              as:   "v",
              cond: { $in: ["$$v.name", match["variants.name"].$in] }
            }
          }
        }
      });
    }

    // 4) For each remaining variant, filter its articles by gender (and/or search)
    pipeline.push({
      $addFields: {
        variants: {
          $map: {
            input: "$variants",
            as:    "v",
            in: {
              name: "$$v.name",
              // keep only articles whose gender or name search matched
              articles: {
                $filter: {
                  input: "$$v.articles",
                  as:   "a",
                  cond: {
                    $and: [
                      // gender filter
                      ...(match["variants.articles.gender"]
                        ? [{ $in: ["$$a.gender", match["variants.articles.gender"].$in] }]
                        : []),
                      // search filter (optional)
                      ...(search.trim()
                        ? [{ 
                            $or: [
                              { $regexMatch: { input: "$$a.name",   regex: search, options: "i" } },
                              { $regexMatch: { input: "$$a.gender", regex: search, options: "i" } }
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

    // 5) Pagination
    pipeline.push({ $skip: skip }, { $limit: Number(limit) });

    // 6) (Optional) Count total matched docs via $facet
    // pipeline.push({
    //   $facet: {
    //     metadata: [ { $count: "total" } ],
    //     data:     [ { $skip: skip }, { $limit: Number(limit) } ]
    //   }
    // });

    const results = await productModel.aggregate(pipeline);
    // If you used $facet, extract results.data & results.metadata[0].total

    return res.status(200).json({
      result: !!results.length,
      message: results.length
        ? "Products fetched successfully"
        : "No products matched",
      data: results
    });

  } catch (err) {
    res.status(500).json({ result: false, message: "Error fetching products" });
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



export {login, purchaseProduct, getAllProducts,fetchFilters, fetchProductData, fetchAllDealsImages, generateOrderPerforma, getDistributor}