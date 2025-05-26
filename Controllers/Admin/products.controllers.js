import categoryModel from "../../Models/Categories.model.js";
import dealsModel from "../../Models/Deals.Model.js";
import productModel from "../../Models/Product.model.js";
import purchaseProductModel from "../../Models/Purchasedproduct.model.js";
import Variants from "../../Models/Variants.Model.js";

import { uploadOnCloudinary } from "../../Utils/cloudinary.js";
import statusCodes from "../../Utils/statuscodes.js";
import zod from 'zod';

const imageExtensionRegex = /\.(jpe?g|png)$/i;
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const productValidationSchema = zod.object({
    name: zod.string().min(1, "Name is required"),
    price: zod.number().positive("Price must be a positive number"),
    category: zod.string().min(1, "Category is required"),
    type: zod.string().min(1, "Type is required"),
    colors: zod.union([
        zod.array(zod.string().min(1)), // ✅ Accepts array of colors
        zod.string().min(1).transform((str) => [str]) // ✅ Converts single value to array
      ]),
      sizes: zod.union([
        zod.array(zod.string().min(1)), // ✅ Accepts array of sizes
        zod.string().min(1).transform((str) => [str]) // ✅ Converts single size to array
      ]),
});

const dealsValidationSchema = zod.object({
  articleName: zod.string().min(1, "Article name is required"),
  startDate: zod.coerce.date(),
  endDate: zod.coerce.date(),
  reward: zod.string().min(1, "Reward field is required"),
});

let updateDealValidationSchema = zod.object({
    startDate: zod
      .union([zod.string(), zod.date()])
      .transform((val) => (typeof val === 'string' ? new Date(val) : val))
      .refine((date) => !isNaN(date.getTime()), {
        message: "Invalid start date",
      }),
  
    endDate: zod
      .union([zod.string(), zod.date()])
      .transform((val) => (typeof val === 'string' ? new Date(val) : val))
      .refine((date) => !isNaN(date.getTime()), {
        message: "Invalid end date",
      }),
  }).refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  });

const prodcutIdValidationSchema = zod.object({
    productsId:zod.string().regex(objectIdRegex, "Invalid product ID format")
    .min(1, "At least one product ID is required"),
})


const addProduct = async (req, res) => {
  try {
    // Extract fields from the request body
    let { name, price, category, type, colors, sizes, variant } = req.body;
    let numPrice = Number(price);

    // Convert type and colors to lowercase for consistency
    let formattedType = type?.toLowerCase();
    let formattedColors = Array.isArray(colors)
      ? colors.map(color => color.toLowerCase())
      : colors?.toLowerCase();

    // Validate using your validation schema (for example, using Zod or Yup)
    let validationCheckData = productValidationSchema.safeParse({
      name,
      price: numPrice,
      category,
      type: formattedType,
      colors: formattedColors,
      sizes,
    });

    if (!validationCheckData.success) {
      return res
        .status(statusCodes.badRequest)
        .send({ result: false, message: validationCheckData.error.errors[0].message });
    }

    // Ensure at least one image has been uploaded
    if (!req.files || req.files.length === 0) {
      return res
        .status(statusCodes.badRequest)
        .send({ result: false, message: "Please Upload At Least One Image" });
    }

    // Upload all images
    const uploadPromises = req.files.map((file) => uploadOnCloudinary(file.path));

    let uploadResults;
    try {
      uploadResults = await Promise.all(uploadPromises);
    } catch (uploadError) {
      return res
        .status(statusCodes.badRequest)
        .send({ result: false, message: "One or more images failed to upload. Please try again later" });
    }
    let imageUrls = uploadResults.map((file) => file.secure_url);

    // Create a new product document in the products collection.
    // Even if variant information is provided, we allow many products with the same articleName.
    let newProduct = await productModel.create({
      articleName: name,
      price: numPrice,
      category,
      type: formattedType,
      colors: formattedColors,
      sizes,
      images: imageUrls,
      // variants field may be omitted or empty by default.
    });

    // If a variant is provided, handle the variant details.
    if (variant) {
      // Check if any product with the same articleName already has the variant in its variants array.
      let productWithVariant = await productModel.findOne({
        articleName: name,
        variants: { $in: [variant] }
      });

      // If no product (with that articleName) already includes this variant,
      // update the newly created product to add the variant name to its variants array.
      if (!productWithVariant) {
        await productModel.findByIdAndUpdate(newProduct._id, { $push: { variants: variant } });
      }
      
      // In any case, create a Variant document with the provided details.
      await Variants.create({
        articleName: name,
        variantName: variant,
        imagesUrls: imageUrls,
        category,
        type: formattedType,
        price: numPrice,
        sizes,
        colors: formattedColors,
      });
    }

    return res.status(statusCodes.success).send({ result: true, message: "Product Added" });
  } catch (error) {
    return res
      .status(statusCodes.serverError)
      .send({ result: false, message: "Error in Adding Product. Please Try Again Later" });
  }
};

const updateProduct = async (req,res) => {
  try {
    
  } catch (error) {
    return res
        .status(statusCodes.serverError)
        .send({ result: false, message: "Error in Updating Product. Please Try Again Later"});
  }
}

const deleteProduct = async (req,res) => {
    try {
        let {productid} = req?.params;        

        let productInDb = await productModel.findById(productid)

        if(!productInDb){
            return res.status(statusCodes.notFound).send({result: false, message: "Can't Find Product You Are Looking For"})
        }

        await productModel.findByIdAndDelete(productid)

        return res.status(statusCodes.success).send({result: true, message: "Product Deleted"})
    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: "Error in Deleting Product. Please Try Again Later"})
    }
}

const getAllProdcuts = async (req,res) => {
    try {
      let products = await productModel.find({})

      if(!products){
        return res.status(statusCodes.notFound).send({result: false, message: "No Products"})
      }

      return res.status(statusCodes.success).send({result: true, message: "Products Retrieved", data: products})
    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: "Error in Deleting Product. Please Try Again Later"})
    }
}

const addBestDeals = async (req,res) => {
    try {
      let {articleId, articleName, noOfPurchase, start, end, reward} = req?.body

      let startDate = new Date(start)
      let endDate = new Date(end)

      let validateData = dealsValidationSchema.safeParse({
        articleName,
        startDate,
        endDate,
        reward,
      })

      if(!validateData.success){
        return res.status(statusCodes.badRequest).send({result: false, message: "Invalid Data", error: validateData.error})
      }

      if (!req.files || req.files.length === 0) {
      return res
        .status(statusCodes.badRequest)
        .send({ result: false, message: "Please Upload At Least One Image" });
      }

    const uploadPromises = req.files.map((file) => uploadOnCloudinary(file.path));

    let uploadResults;
    try {
      uploadResults = await Promise.all(uploadPromises);
    } catch (uploadError) {
      return res
        .status(statusCodes.badRequest)
        .send({ result: false, message: "Image Failed to upload. Please try again later" });
    }

    let imageUrl = uploadResults.map((file) => file.secure_url); 
    
    let dealAlreadyExits = await dealsModel.find({articleId: articleId})

    if(dealAlreadyExits.length > 0){
      return res.status(statusCodes.badRequest).send({result: false, message: "Deal Already Exits Of This Article"})
    }

    await dealsModel.create({
      articleId,
      articleName,
      startDate,
      endDate,
      image: imageUrl[0],
      noOfPurchase: noOfPurchase,
      reward,
      expireAt: endDate
    })

    await productModel.findByIdAndUpdate(
          articleId, // Correctly passing the ID
          { $set: { "deal.minQuantity": noOfPurchase , "deal.reward": reward , indeal: true} }, // ✅ Using $set to update
          { new: true, upsert: true } // ✅ Ensures it updates or creates if missing
  );
      
    return res.status(statusCodes.success).send({result: true, message: "Deals Added"})
    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: "Error in Adding Deals. Please Try Again Later"})
    }
}

const getDeals = async (req,res) => {
    try {
        let allDeals = await dealsModel.find({})

        if(!allDeals){
            return res.status(statusCodes.badRequest).send({result: false, message: "Deals Not Found or Not Added Yet"})
        }

        return res.status(statusCodes.success).send({result: true, message: "Found All Deals", data: allDeals})
    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: "Error in Getting Deals. Please Try Again Later"})
    }
}

const deleteDeals = async (req,res) => {
    try {
        let {productid} = req?.params;

        if(!productid){
          return res.status(statusCodes.badRequest).send({result: false, message: "Product Id Invalid"})
        }
        
        let checkId = prodcutIdValidationSchema.safeParse({productsId: productid})

        if(!checkId.success){
            return res.status(statusCodes.badRequest).send({result: false, message: checkId.error.errors[0].message, error: "eror"})
        }

        let dealInTable = await dealsModel.findById(productid)

        if(!dealInTable){
            return res.status(statusCodes.badRequest).send({result: false, message: "Deal Not Found"})
        }

        await dealsModel.findByIdAndDelete(productid)

        return res.status(statusCodes.success).send({result: true, message: "Deleted Deal"})
    } catch (error) {
      return res.status(statusCodes.serverError).send({result: false, message: "Error in Deleting Deals. Please Try Again Later"})
    }
}

const updateDeal = async (req,res) => {
  try {
    let dealId = req?.params.id;

    if(!dealId){
        return res.status(statusCodes.badRequest).send({result: false, message: "Product Id Invalid"})
    }
    
    let newData= req?.body;

    let dealInDb = await dealsModel.findById(dealId);

    if(!dealInDb){
      return res.status(statusCodes.badRequest).send({result: false, message: "Deal Not Found"})
    }

    let validateData = updateDealValidationSchema.safeParse(newData);

    if(!validateData.success){
      return res.status(statusCodes.badRequest).send({result: false, message: validateData.error.errors[0].message, error: validateData.error})
    }

    await dealsModel.findByIdAndUpdate(dealId, newData, {new: true});

    let productid = dealInDb.productsId;

    await productModel.findByIdAndUpdate(productid, {discount: newData.discount}, {new: true});

    return res.status(statusCodes.success).send({result: true, message: "Deal Updated"})

  } catch (error) {
    
    return res.status(statusCodes.serverError).send({result: false, message: "Error in Updating Deals. Please Try Again Later"})
  }
}

const getPurchases = async (req,res) => {
  try {
    let allPurchases = await purchaseProductModel.find({})

    if(!allPurchases){
            return res.status(statusCodes.success).send({result: true, message: "Orders Not Placed"})
    }

    return res.status(statusCodes.success).send({result: true, message: "Found All Purchases", data: allPurchases})

  } catch (error) {
    return res.status(statusCodes.serverError).send({result: false, message: "Error in Fetching Purchases. Please Try Again Later"})
  }
}

const markPurchaseConfirm = async (req,res) => {
  try {
    let productid = req?.params?.id

    if(!productid){
      return res.status(statusCodes.badRequest).send({result: false, message: "Product Id Invalid"})
    }

    let purchase = await purchaseProductModel.findById(productid)
    purchase.isFulfiled = true
    await purchase.save()

    return res.status(statusCodes.success).send({result: true, message: "Purchase Confirm"})

  } catch (error) {
    return res.status(statusCodes.serverError).send({result: false, message: "Error in Marking Purchase. Please Try Again Later"})
  }
}

const addCategories = async (req,res) => {
  try {
    let category = req?.body.category;

    if(!category){
      return res.status(statusCodes.badRequest).send({result: false, message: "Category Not Found"});
    }

    let categoryInLowerCase = category.toLowerCase()

    let categoryInDb = await categoryModel.findOne({category: categoryInLowerCase})

    if(categoryInDb){
      return res.status(statusCodes.success).send({result: true, message: "Category Already Exists"})
    }

    await categoryModel.create({category: categoryInLowerCase})

    return res.status(statusCodes.success).send({result: true, message: "Category Added Successfully"})

  } catch (error) {
    return res.status(statusCodes.serverError).send({result: false, message: "Error in Adding Category. Please Try Again Later"})
  }
}

const getCategories = async (req,res) => {
  try {
    let categories = await categoryModel.find({})

    if(!categories){
      return res.status(statusCodes.badRequest).send({result: false, message: "No Categories Added Yet"})
    }

    return res.status(statusCodes.success).send({result: true, message: "Categories Retrieved Successfully", data: categories})

  } catch (error) {
    return res.status(statusCodes.serverError).send({result: false, message: "Error in Fetching Category. Please Try Again Later"})
  }
}



export {addProduct, deleteProduct, getAllProdcuts, addBestDeals, getDeals, deleteDeals, updateDeal, getPurchases, markPurchaseConfirm, addCategories, getCategories}

