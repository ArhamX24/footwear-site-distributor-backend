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
    sameSite: 'none'
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
      price: order.price,
      variant: order.variants[0],
      singlePrice: order.singlePrice
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
      downloadUrl: `http://localhost:8080/api/v1/distributor/orders/download-performa/${newPurchaseOrder._id}`,
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
    // Destructure pagination and search params.
    let { page = 1, limit = 10, search = "" } = req.query;
    // Get the filters as received (they could be JSON strings).
    let { filterName = "[]", filterOption = "[]" } = req.query;

    // Parse JSON filter values; if parsing fails, use empty arrays.
    try {
      filterName = JSON.parse(filterName);
      filterOption = JSON.parse(filterOption);
    } catch (error) {
      filterName = [];
      filterOption = [];
    }

    const skip = (page - 1) * limit;
    let query = {};

    // 🔹 Searching Logic (handles multi-word search properly)
    if (search) {
      const searchTerms = search.split(" ");
      query.$and = searchTerms.map((term) => ({
        $or: [
          { articleName: { $regex: term, $options: "i" } },
          { category: { $regex: term, $options: "i" } },
          { colors: { $regex: term, $options: "i" } },
          { sizes: { $regex: term, $options: "i" } },
          { type: { $regex: term, $options: "i" } },
          { variants: { $regex: term, $options: "i" } },
        ],
      }));
    }

    // 🔹 Handling Multiple Filters Correctly
    if (
      Array.isArray(filterName) &&
      Array.isArray(filterOption) &&
      filterName.length === filterOption.length
    ) {
      filterName.forEach((name, index) => {
        if (!query.$and) query.$and = [];

        // If the user has applied the price filter, handle it separately.
       if (name === "price") {
  // Extract the price value (if it's stored as an array, get its first element)
  let priceRange = filterOption[index];
  if (Array.isArray(priceRange)) {
    priceRange = priceRange[0];
  }
  priceRange = priceRange.trim();

  switch (priceRange) {
    case "Under ₹100":
      query.$and.push({ price: { $lt: 100 } });
      break;
    case "₹100 - ₹200":
      query.$and.push({ price: { $gte: 100, $lte: 200 } });
      break;
    case "₹200 - ₹300":
      query.$and.push({ price: { $gte: 200, $lte: 300 } });
      break;
    case "Above ₹300":
      query.$and.push({ price: { $gt: 300 } });
      break;
    default:
      break;
  }
}
        // For fields such as 'colors' and 'variants' (stored as arrays in our schema), use the $in operator.
        else if (["colors", "variants"].includes(name)) {
          query.$and.push({
            [name]: {
              $in: Array.isArray(filterOption[index])
                ? filterOption[index]
                : [filterOption[index]],
            },
          });
        }
        // For other fields do a direct match.
        else {
          query.$and.push({
            [name]: filterOption[index],
          });
        }
      });
    }

    // 🔹 Fetching Products
    const totalProducts = await productModel.countDocuments(query);
    // We add .sort({price: 1}) here to sort the products in ascending order by price.
    const products = await productModel
      .find(query)
      .sort({ price: 1 })
      .skip(skip)
      .limit(Number(limit));

    if (!products || products.length === 0) {
      return res.status(statusCodes.success).send({
        result: false,
        message: "Products Not Added Or Empty",
        data: null 
      });
    }

    return res.status(statusCodes.success).send({
      result: true,
      message: "Found All Products",
      data: products,
      totalPages: Math.ceil(totalProducts / limit),
      currentPage: Number(page),
    });
  } catch (error) {
    return res.status(statusCodes.serverError).send({
      result: false,
      message: "Error in Fetching Products. Please Try Again Later",
    });
  }
};

const fetchFilters = async (req,res) => {
  try {
    const colors = await productModel.distinct("colors"); // ✅ Fetch unique colors
    const sizes = await productModel.distinct("sizes"); // ✅ Fetch unique sizes
    const type = await productModel.distinct("type"); // ✅ Fetch unique product types
    const articles = await productModel.distinct("articleName");

    res.status(statusCodes.success).json({ result: true, message: "Filters Fetched", data:{colors, sizes, type, articles}});

  } catch (error) {
    res.status(500).json({ message: "Error fetching filters", error });
  }
}
 
const fetchProductData = async (req, res) => {
  try {
    // Extract articleName from the query; default is an empty string
    const { articleName = '' } = req.query;

    // Build the filter for products; if articleName is provided, use a regex filter
    const articleFilter = articleName
      ? { articleName: { $regex: articleName, $options: 'i' } }
      : {};

    // Get distinct article names using the filter (if empty, it returns all articles)
    const articles = await productModel.distinct("articleName", articleFilter);
    const allArticles = await productModel.distinct("articleName");

    // If articleName is provided (non-empty), fetch the corresponding variants;
    // otherwise, return an empty array for variants.
    let variants = [];
    if (articleName.trim() !== '') {
      variants = await Variants.distinct("variantName", { 
        articleName: { $regex: articleName, $options: 'i' } 
      });
    }

    return res.status(statusCodes.success).json({
      result: true,
      message: "Names Fetched",
      data: { articles, variants, allArticles }
    });
  } catch (error) {
    return res.status(statusCodes.serverError).json({
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

    if(!dealsImages){
      return res.status(statusCodes.badRequest).send({result: false, message: "No Deals Images Found"})
    }

    return res.status(statusCodes.success).send({result: true, message: "Images Fetched", data: dealsImages[0].allImages})
  } catch (error) {
    res.status(500).json({ message: "Error fetching Deals Images" });
  }
}



export {login, purchaseProduct, getAllProducts,fetchFilters, fetchProductData, fetchAllDealsImages, generateOrderPerforma, getDistributor}