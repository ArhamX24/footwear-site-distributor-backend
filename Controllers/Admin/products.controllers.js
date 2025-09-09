import categoryModel from "../../Models/Categories.model.js";
import dealsModel from "../../Models/Deals.model.js";
import Festive from "../../Models/Festivle.model.js";
import productModel from "../../Models/Product.model.js";
import purchaseProductModel from "../../Models/Purchasedproduct.model.js";
import { uploadOnCloudinary } from "../../Utils/cloudinary.js";
import statusCodes from "../../Utils/statusCodes.js";
import zod from 'zod';
import xlsx from "xlsx";
import path from 'path';
import fs from 'fs'

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
    let { segment, gender, articleName, colors, sizes, variant } = req.body;

    segment = segment?.trim().toLowerCase();
    variant = variant?.trim().toLowerCase();
    articleName = articleName?.trim().toLowerCase();

    // --- detect "all colors"
    let rawColors = Array.isArray(colors) ? colors : [colors];
    let isAllColorsAvailable = false;
    let formattedColors;

    if (rawColors.some(c => c?.trim().toLowerCase() === "all colors" || c?.trim().toLowerCase() === "all" || c?.trim().toLowerCase() === "allColors" || c?.trim().toLowerCase() === "allolors" )) {
      isAllColorsAvailable = true;
      formattedColors = [];
    } else {
      formattedColors = rawColors.map(color => color?.trim().toLowerCase()).filter(Boolean);
    }

    // --- image upload section
    if (!req.files || req.files.length === 0) {
      return res.status(statusCodes.badRequest)
        .send({ result: false, message: "Please Upload At Least One Image" });
    }

    const uploadPromises = req.files.map((file) => uploadOnCloudinary(file.path));

    let uploadResults;
    try {
      uploadResults = await Promise.all(uploadPromises);
    } catch (uploadError) {
      return res.status(statusCodes.badRequest)
        .send({ result: false, message: "One or more images failed to upload. Please try again later" });
    }

    const imageUrls = uploadResults.map((file) => file.secure_url);

    // --- fetch existing segment
    let existingSegment = await productModel.findOne({ segment });

    const newArticle = {
      name: articleName,
      colors: formattedColors,
      sizes,
      images: imageUrls,
      gender,
      allColorsAvailable: isAllColorsAvailable
    };

    if (!existingSegment) {
      await productModel.create({
        segment,
        variants: [{
          name: variant,
          articles: [newArticle]
        }]
      });

      return res.status(statusCodes.success)
        .send({ result: true, message: "Segment, variant, and article created" });
    }

    // --- Segment exists. Find or create variant
    let variantIndex = existingSegment.variants.findIndex(v => v.name === variant);

    if (variantIndex === -1) {
      existingSegment.variants.push({
        name: variant,
        articles: [newArticle]
      });
    } else {
      existingSegment.variants[variantIndex].articles.push(newArticle);
    }

    await existingSegment.save();

    return res.status(statusCodes.success)
      .send({ result: true, message: "Variant and/or article added to existing segment" });

  } catch (error) {
    return res.status(statusCodes.serverError)
      .send({ result: false, message: "Error in Adding Product. Please Try Again Later", error });
  }
};


// Upload Data using excel 

const importProductsFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({ result: false, message: 'No Excel file uploaded' });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    for (const row of rows) {
      let {
        Segment,
        Variant,
        ArticleName,
        Gender,
        Colors,
        Sizes,
        ImagePaths
      } = row;

      Segment = Segment?.trim().toLowerCase();
      Variant = typeof(Variant) == 'string' ? Variant?.trim().toLowerCase() : Variant ;
      ArticleName = typeof(ArticleName) == 'string' ? ArticleName?.trim().toLowerCase() : ArticleName;

      // --- Colors logic with allColorsAvailable check
      let isAllColorsAvailable = false;
      let formattedColors = Colors
        ? Colors.split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
        : [];

      if (formattedColors.includes("all colors")) {
        isAllColorsAvailable = true;
        formattedColors = [];
      }

      const formattedSizes = Sizes
        ? Sizes.split(',').map(s => s.trim())
        : [];

      const localPaths = ImagePaths
        ? ImagePaths.split(',').map(p => p.trim())
        : [];

      const imageUrls = [];

      for (const localPath of localPaths) {
        const resolvedPath = path.resolve(localPath);
        const result = await uploadOnCloudinary(resolvedPath);
        imageUrls.push(result?.secure_url);
      }

      const newArticle = {
        name: ArticleName,
        colors: formattedColors,
        sizes: formattedSizes,
        images: imageUrls,
        gender: Gender?.trim().toLowerCase(),
        allColorsAvailable: isAllColorsAvailable
      };

      let existingSegment = await productModel.findOne({ segment: Segment });

      if (!existingSegment) {
        await productModel.create({
          segment: Segment,
          variants: [{
            name: Variant,
            articles: [newArticle]
          }]
        });
      } else {
        const variantIndex = existingSegment.variants.findIndex(v => v.name === Variant);

        if (variantIndex === -1) {
          existingSegment.variants.push({
            name: Variant,
            articles: [newArticle]
          });
        } else {
          existingSegment.variants[variantIndex].articles.push(newArticle);
        }

        await existingSegment.save();
      }
    }

    fs.unlinkSync(req.file.path);

    res.status(201).send({ result: true, message: 'Excel data imported successfully' });

  } catch (err) {
    res.status(500).send({ result: false, message: 'Failed to import products', error: err });
  }
};


// DELETE /api/v1/admin/products/deleteproduct/:productid
// Now handles both top‐level product deletes AND nested article deletes
const deleteProduct = async (req, res) => {
  try {
    const { productid } = req.params;

    // 1) Is it a top‐level product?
    const productDoc = await productModel.findById(productid);
    if (productDoc) {
      // remove the entire product document
      await productModel.findByIdAndDelete(productid);
      return res
        .status(statusCodes.success)
        .send({ result: true, message: "Product deleted" });
    }

    // 2) Otherwise, try to delete a nested article by its _id
    //    Find the product that contains this article
    const parent = await productModel.findOne({
      "variants.articles._id": productid,
    });
    if (!parent) {
      return res
        .status(statusCodes.notFound)
        .send({ result: false, message: "No product or article found" });
    }

    // Pull out the matching article from its variant
    await productModel.updateOne(
      { _id: parent._id },
      {
        $pull: {
          "variants.$[v].articles": { _id: productid },
        },
      },
      {
        arrayFilters: [{ "v.articles._id": productid }],
        // safe by default, no upsert
      }
    );

    return res
      .status(statusCodes.success)
      .send({ result: true, message: "Article deleted" });
  } catch (error) {
    return res
      .status(statusCodes.serverError)
      .send({
        result: false,
        message: "Error deleting. Please try again later.",
      });
  }
};

const getAllProdcuts = async (req, res) => {
  try {
    const products = await productModel.find({});
    if (!products || products.length === 0) {
      return res
        .status(statusCodes.notFound)
        .send({ result: false, message: "No products found" });
    }

    // flatten to articles with context
    const articles = products.flatMap((product) =>
      (product.variants || []).flatMap((variant) =>
        (variant.articles || []).map((article) => ({
          ...article.toObject(),
          variantId: variant._id,
          variantName: variant.name,
          productId: product._id,
          productName: product.name || product.articleName,
          segment: product.segment,
        }))
      )
    );

    // group by segment
    const grouped = articles.reduce((acc, article) => {
      const seg = article.segment || "Unknown";
      if (!acc[seg]) acc[seg] = [];
      acc[seg].push(article);
      return acc;
    }, {});

    return res.status(statusCodes.success).send({
      result: true,
      totalCount: articles.length,
      groupedData: grouped,
      data: articles
    });
  } catch (error) {
    console.error(error);
    return res
      .status(statusCodes.serverError)
      .send({ result: false, message: "Internal Server Error" });
  }
};


const addBestDeals = async (req,res) => {
    try {
      let {articleId, articleName, noOfPurchase, start, end, reward} = req?.body

      let startDate = new Date(start)
      let endDate = new Date(end)
      articleName = articleName ? articleName.trim() : ""
      reward = reward ? reward.trim() : ""

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

// 4) Mark that article as "in deal" and set its minQuantity & reward
      await productModel.findOneAndUpdate(
        { "variants.articles._id": articleId },        // find the product containing that article
        {
          $set: {
            // for the matching variant (v) and article (a) set these fields
            "variants.$[v].articles.$[a].deal.minQuantity": noOfPurchase,
            "variants.$[v].articles.$[a].deal.reward": reward,
            "variants.$[v].articles.$[a].indeal": true
          }
        },
        {
          arrayFilters: [
            { "v.articles._id": articleId },  // pick the variant whose articles[] has our ID
            { "a._id": articleId }            // pick the article subdoc by ID
          ],
          new: true
        }
      );
            
    return res.status(statusCodes.success).send({result: true, message: "Deals Added"})
    } catch (error) {
        return res.status(statusCodes.serverError).send({result: false, message: "Error in Adding Deals. Please Try Again Later"})
    }
}

const getDeals = async (req, res) => {
  try {
    const allDeals = await dealsModel.find({});

    // Get festive images regardless of deal presence
    const festiveImages = await Festive.find({}, "image");
    const imageUrls = festiveImages.map(festival => festival.image);

    const dealImages = allDeals.map(deal => deal.image);
    const allImages = [...imageUrls, ...dealImages];

    return res.status(statusCodes.success).send({
      result: true,
      message: allDeals.length ? "Found All Deals" : "No Deals Added Yet",
      data: allDeals, // always an array
      images: allImages
    });
  } catch (error) {
    return res.status(statusCodes.serverError).send({
      result: false,
      message: "Error in Getting Deals. Please Try Again Later"
    });
  }
};
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
        await productModel.findByIdAndUpdate(
          dealInTable.articleId, // Correctly passing the ID
          { $set: { "deal": null , "indeal": false} }, // ✅ Using $set to update
          { new: true, upsert: true } // ✅ Ensures it updates or creates if missing
        
  );

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

// Add this to products.controllers.js
// Add this new function to your products.controllers.js
const getArticlesForDropdown = async (req, res) => {
  try {
    // Use aggregation to flatten the nested structure and get articles with their IDs
    const articles = await productModel.aggregate([
      { $unwind: "$variants" },
      { $unwind: "$variants.articles" },
      {
        $project: {
          articleId: "$variants.articles._id",
          articleName: "$variants.articles.name", 
          colors: "$variants.articles.colors",
          sizes: "$variants.articles.sizes",
          images: "$variants.articles.images",
          variantId: "$variants._id",
          variantName: "$variants.name", 
          productId: "$_id",
          segment: "$segment",
          allColorsAvailable: "$variants.articles.allColorsAvailable"
        }
      },
      { $sort: { articleName: 1 } }
    ]);

    return res.status(200).json({
      result: true,
      message: "Articles retrieved successfully",
      data: articles
    });

  } catch (error) {
    console.error('Error fetching articles:', error);
    return res.status(500).json({
      result: false,
      message: "Error fetching articles",
      error: error.message
    });
  }
};


export {addProduct,importProductsFromExcel ,deleteProduct, getAllProdcuts, addBestDeals, getDeals, deleteDeals, updateDeal, getPurchases, markPurchaseConfirm, addCategories, getCategories, getArticlesForDropdown}

