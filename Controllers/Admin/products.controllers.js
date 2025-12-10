import categoryModel from "../../Models/Categories.model.js";
import dealsModel from "../../Models/Deals.model.js";
import Festive from "../../Models/Festivle.model.js";
import productModel from "../../Models/Product.model.js";
import purchaseProductModel from "../../Models/Purchasedproduct.model.js";
import { uploadOnCloudinary } from "../../Utils/cloudinary.js";
import zod from 'zod';
import xlsx from "xlsx";
import path from 'path';
import fs from 'fs'
import mongoose from "mongoose";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

let statusCodes = {
    success: 200,
    noContent:204,
    badRequest: 400,
    unauthorized: 403,
    notFound: 404,
    serverError: 500,
    forbidden: 402
}


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
    let { 
      segment, 
      gender, 
      articleName, 
      colors, 
      sizes, 
      variant,
      segmentKeywords,
      variantKeywords,
      articleKeywords
    } = req.body;

    segment = segment?.trim().toLowerCase();
    variant = variant?.trim().toLowerCase();
    articleName = articleName?.trim().toLowerCase();

    // ✅ Process keywords
    let segmentKeywordsArr = [];
    let variantKeywordsArr = [];
    let articleKeywordsArr = [];

    if (segmentKeywords && Array.isArray(segmentKeywords)) {
      segmentKeywordsArr = segmentKeywords.map(k => k.trim().toLowerCase()).filter(Boolean);
    }

    if (variantKeywords && Array.isArray(variantKeywords)) {
      variantKeywordsArr = variantKeywords.map(k => k.trim().toLowerCase()).filter(Boolean);
    }

    if (articleKeywords && Array.isArray(articleKeywords)) {
      articleKeywordsArr = articleKeywords.map(k => k.trim().toLowerCase()).filter(Boolean);
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
      images: imageUrls,
      gender,
      keywords: articleKeywordsArr  // ✅ Add article keywords
    };

    if (!existingSegment) {
      // ✅ Create new segment with keywords
      await productModel.create({
        segment,
        keywords: segmentKeywordsArr,  // ✅ Segment keywords
        variants: [{
          name: variant,
          keywords: variantKeywordsArr,  // ✅ Variant keywords
          articles: [newArticle]
        }]
      });

      return res.status(statusCodes.success)
        .send({ result: true, message: "Segment, variant, and article created" });
    }

    // ✅ Update existing segment keywords (merge unique)
    const updatedSegmentKeywords = [...new Set([...existingSegment.keywords, ...segmentKeywordsArr])];
    existingSegment.keywords = updatedSegmentKeywords;

    // --- Segment exists. Find or create variant
    let variantIndex = existingSegment.variants.findIndex(v => v.name === variant);

    if (variantIndex === -1) {
      // ✅ Create new variant with keywords
      existingSegment.variants.push({
        name: variant,
        keywords: variantKeywordsArr,
        articles: [newArticle]
      });
    } else {
      // ✅ Update existing variant keywords (merge unique)
      const existingVariant = existingSegment.variants[variantIndex];
      const updatedVariantKeywords = [...new Set([...existingVariant.keywords, ...variantKeywordsArr])];
      existingSegment.variants[variantIndex].keywords = updatedVariantKeywords;
      existingSegment.variants[variantIndex].articles.push(newArticle);
    }

    await existingSegment.save();

    return res.status(statusCodes.success)
      .send({ result: true, message: "Variant and/or article added to existing segment" });

  } catch (error) {
    console.error(error);
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


const updateProduct = async (req, res) => {
  try {
    const { productid } = req.params;
    let { 
      name, 
      segment, 
      gender, 
      variantName, 
      existingImages,
      segmentKeywords,
      variantKeywords,
      articleKeywords
    } = req.body;

    // Normalize inputs
    name = name?.trim().toLowerCase();
    segment = segment?.trim().toLowerCase();
    gender = gender?.trim().toLowerCase();
    variantName = variantName?.trim().toLowerCase();

    // ✅ Process keywords
    let segmentKeywordsArr = [];
    let variantKeywordsArr = [];
    let articleKeywordsArr = [];

    if (segmentKeywords) {
      if (typeof segmentKeywords === 'string') {
        segmentKeywordsArr = segmentKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      } else if (Array.isArray(segmentKeywords)) {
        segmentKeywordsArr = segmentKeywords.map(k => k.trim().toLowerCase()).filter(Boolean);
      }
    }

    if (variantKeywords) {
      if (typeof variantKeywords === 'string') {
        variantKeywordsArr = variantKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      } else if (Array.isArray(variantKeywords)) {
        variantKeywordsArr = variantKeywords.map(k => k.trim().toLowerCase()).filter(Boolean);
      }
    }

    if (articleKeywords) {
      if (typeof articleKeywords === 'string') {
        articleKeywordsArr = articleKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      } else if (Array.isArray(articleKeywords)) {
        articleKeywordsArr = articleKeywords.map(k => k.trim().toLowerCase()).filter(Boolean);
      }
    }

    // Parse existing images if it's a string
    if (typeof existingImages === 'string') {
      try {
        existingImages = JSON.parse(existingImages);
      } catch (e) {
        existingImages = [];
      }
    }

    // Validate product ID
    if (!mongoose.Types.ObjectId.isValid(productid)) {
      return res.status(statusCodes.badRequest)
        .send({ result: false, message: "Invalid product ID" });
    }

    // Find the product and its location in the schema
    const allProducts = await productModel.find({});
    let targetProduct = null;
    let targetSegment = null;
    let targetVariant = null;
    let articleIndex = -1;

    for (const prod of allProducts) {
      for (const variant of prod.variants) {
        const artIndex = variant.articles.findIndex(
          art => art._id.toString() === productid
        );
        
        if (artIndex !== -1) {
          targetProduct = prod;
          targetSegment = prod;
          targetVariant = variant;
          articleIndex = artIndex;
          break;
        }
      }
      if (targetProduct) break;
    }

    if (!targetProduct || articleIndex === -1) {
      return res.status(statusCodes.notFound)
        .send({ result: false, message: "Product not found" });
    }

    // Handle new image uploads
    let newImageUrls = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map((file) => uploadOnCloudinary(file.path));
      
      try {
        const uploadResults = await Promise.all(uploadPromises);
        newImageUrls = uploadResults.map((file) => file.secure_url);
      } catch (uploadError) {
        console.error("Image upload error:", uploadError);
        return res.status(statusCodes.badRequest)
          .send({ result: false, message: "One or more images failed to upload" });
      }
    }

    // Combine existing and new images
    const allImages = [...(existingImages || []), ...newImageUrls];

    if (allImages.length === 0) {
      return res.status(statusCodes.badRequest)
        .send({ result: false, message: "At least one image is required" });
    }

    if (allImages.length > 10) {
      return res.status(statusCodes.badRequest)
        .send({ result: false, message: "Maximum 10 images allowed" });
    }

    // Check if we need to move the article to a different segment/variant
    const needsSegmentChange = segment !== targetSegment.segment;
    const needsVariantChange = variantName !== targetVariant.name;

    if (needsSegmentChange || needsVariantChange) {
      // Create updated article
      const updatedArticle = {
        ...targetVariant.articles[articleIndex].toObject(),
        name,
        gender,
        images: allImages,
        keywords: articleKeywordsArr  // ✅ Update article keywords
      };

      // Remove from old location
      targetVariant.articles.splice(articleIndex, 1);
      
      // If variant is now empty, remove it
      if (targetVariant.articles.length === 0) {
        targetSegment.variants = targetSegment.variants.filter(
          v => v._id.toString() !== targetVariant._id.toString()
        );
      }
      
      // If segment is now empty, delete it
      if (targetSegment.variants.length === 0) {
        await productModel.deleteOne({ _id: targetSegment._id });
      } else {
        await targetSegment.save();
      }

      // Find or create new segment
      let newSegment = await productModel.findOne({ segment });
      
      if (!newSegment) {
        // ✅ Create new segment with keywords
        await productModel.create({
          segment,
          keywords: segmentKeywordsArr,
          variants: [{
            name: variantName,
            keywords: variantKeywordsArr,
            articles: [updatedArticle]
          }]
        });
      } else {
        // ✅ Update segment keywords (merge)
        newSegment.keywords = [...new Set([...newSegment.keywords, ...segmentKeywordsArr])];
        
        // Find or create variant in existing segment
        let variantIndex = newSegment.variants.findIndex(v => v.name === variantName);
        
        if (variantIndex === -1) {
          // ✅ Create new variant with keywords
          newSegment.variants.push({
            name: variantName,
            keywords: variantKeywordsArr,
            articles: [updatedArticle]
          });
        } else {
          // ✅ Update variant keywords (merge)
          const existingVariant = newSegment.variants[variantIndex];
          existingVariant.keywords = [...new Set([...existingVariant.keywords, ...variantKeywordsArr])];
          existingVariant.articles.push(updatedArticle);
        }
        
        await newSegment.save();
      }

      return res.status(statusCodes.success)
        .send({ 
          result: true, 
          message: "Product updated and moved to new segment/variant successfully" 
        });
    } else {
      // ✅ Update in place (same segment and variant)
      targetVariant.articles[articleIndex].name = name;
      targetVariant.articles[articleIndex].gender = gender;
      targetVariant.articles[articleIndex].images = allImages;
      targetVariant.articles[articleIndex].keywords = articleKeywordsArr;  // ✅ Update keywords
      
      // ✅ Update segment keywords (merge)
      targetSegment.keywords = [...new Set([...targetSegment.keywords, ...segmentKeywordsArr])];
      
      // ✅ Update variant keywords (merge)
      targetVariant.keywords = [...new Set([...targetVariant.keywords, ...variantKeywordsArr])];
      
      await targetSegment.save();

      return res.status(statusCodes.success)
        .send({ 
          result: true, 
          message: "Product updated successfully" 
        });
    }

  } catch (error) {
    console.error("Error updating product:", error);
    return res.status(statusCodes.serverError)
      .send({ 
        result: false, 
        message: "Error updating product. Please try again later",
        error: error.message 
      });
  }
};


const getAllProducts = async (req, res) => {
  try {
    const { format } = req.query; // 'articles', 'segments', or 'both' (default)

    const products = await productModel.find({});
    
    if (!products || products.length === 0) {
      return res.status(statusCodes.notFound).send({ 
        result: false, 
        message: "No products found" 
      });
    }

    // ✅ Flatten to articles with context AND keywords
    const articles = products.flatMap((product) =>
      (product.variants || []).flatMap((variant) =>
        (variant.articles || []).map((article) => ({
          _id: article._id,
          name: article.name,
          colors: article.colors,
          sizes: article.sizes,
          images: article.images,
          gender: article.gender,
          indeal: article.indeal,
          deal: article.deal,
          allColorsAvailable: article.allColorsAvailable,
          createdAt: article.createdAt,
          updatedAt: article.updatedAt,
          // ✅ Include all keywords
          articleKeywords: article.keywords || [],
          // Context fields
          variantId: variant._id,
          variantName: variant.name,
          variantKeywords: variant.keywords || [],
          productId: product._id,
          segment: product.segment,
          segmentKeywords: product.keywords || []
        }))
      )
    );

    // If frontend only wants articles list
    if (format === 'articles') {
      return res.status(statusCodes.success).send({
        result: true,
        message: "Articles retrieved successfully",
        totalCount: articles.length,
        data: articles
      });
    }

    // Group by segment
    const groupedBySegment = articles.reduce((acc, article) => {
      const seg = article.segment || "Unknown";
      if (!acc[seg]) acc[seg] = [];
      acc[seg].push(article);
      return acc;
    }, {});

    // Get unique segments list
    const segments = Object.keys(groupedBySegment).filter(seg => seg !== "Unknown");

    // If frontend only wants segments
    if (format === 'segments') {
      return res.status(statusCodes.success).send({
        result: true,
        message: "Segments retrieved successfully",
        data: segments
      });
    }

    // Default: return everything (format === 'both' or no format specified)
    return res.status(statusCodes.success).send({
      result: true,
      message: "Products retrieved successfully",
      totalCount: articles.length,
      segments: segments,
      groupedData: groupedBySegment,
      data: articles
    });

  } catch (error) {
    console.error('Error in getAllProducts:', error);
    return res.status(statusCodes.serverError).send({ 
      result: false, 
      message: "Internal Server Error",
      error: error.message
    });
  }
};



const addBestDeals = async (req, res) => {
    try {
        let {
            dealType,
            segmentName,
            articleId,
            articleName,
            variantName,
            noOfPurchase,
            start,
            end,
            reward
        } = req?.body;

        let startDate = new Date(start);
        let endDate = new Date(end);
        
        articleName = articleName ? articleName.trim() : "";
        reward = reward ? reward.trim() : "";
        segmentName = segmentName ? segmentName.trim() : "";

        // Validate deal type
        if (!dealType || !['segment', 'article'].includes(dealType)) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "Invalid deal type. Must be 'segment' or 'article'"
            });
        }

        // Validate based on deal type
        if (dealType === 'segment' && !segmentName) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "Segment name is required for segment deals"
            });
        }

        if (dealType === 'article' && (!articleId || !articleName)) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "Article ID and name are required for article deals"
            });
        }

        // Validate dates
        if (startDate >= endDate) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "End date must be after start date"
            });
        }

        // Check for image upload
        if (!req.files || req.files.length === 0) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "Please Upload At Least One Image"
            });
        }

        // Upload image to cloudinary
        const uploadPromises = req.files.map((file) => uploadOnCloudinary(file.path));
        let uploadResults;
        
        try {
            uploadResults = await Promise.all(uploadPromises);
        } catch (uploadError) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "Image Failed to upload. Please try again later"
            });
        }

        let imageUrl = uploadResults.map((file) => file.secure_url);

        // Check if deal already exists
        let dealQuery = {};
        if (dealType === 'segment') {
            dealQuery = { segmentName: segmentName, dealType: 'segment', isActive: true };
        } else {
            dealQuery = { articleId: articleId, dealType: 'article', isActive: true };
        }

        let dealAlreadyExists = await dealsModel.findOne(dealQuery);

        if (dealAlreadyExists) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: `Active deal already exists for this ${dealType}`
            });
        }

        // Create the deal
        const newDeal = await dealsModel.create({
            dealType,
            segmentName: dealType === 'segment' ? segmentName : undefined,
            articleId: dealType === 'article' ? articleId : undefined,
            articleName,
            variantName: variantName || undefined,
            startDate,
            endDate,
            image: imageUrl[0],
            noOfPurchase: parseInt(noOfPurchase),
            reward,
            expireAt: endDate,
            isActive: true
        });

        // Update product/articles based on deal type
        if (dealType === 'segment') {
            // Update all articles in this segment
            await productModel.updateMany(
                { segment: segmentName },
                {
                    $set: {
                        "variants.$[].articles.$[].deal.minQuantity": parseInt(noOfPurchase).toString(),
                        "variants.$[].articles.$[].deal.reward": reward,
                        "variants.$[].articles.$[].indeal": true
                    }
                }
            );
        } else {
            // Update only the specific article
            await productModel.findOneAndUpdate(
                { "variants.articles._id": articleId },
                {
                    $set: {
                        "variants.$[v].articles.$[a].deal.minQuantity": parseInt(noOfPurchase).toString(),
                        "variants.$[v].articles.$[a].deal.reward": reward,
                        "variants.$[v].articles.$[a].indeal": true
                    }
                },
                {
                    arrayFilters: [
                        { "v.articles._id": articleId },
                        { "a._id": articleId }
                    ],
                    new: true
                }
            );
        }

        return res.status(statusCodes.success).send({
            result: true,
            message: `${dealType === 'segment' ? 'Segment-wide' : 'Article'} deal added successfully`,
            data: newDeal
        });

    } catch (error) {
        console.error('Error adding deal:', error);
        return res.status(statusCodes.serverError).send({
            result: false,
            message: "Error in Adding Deals. Please Try Again Later",
            error: error.message
        });
    }
};

const getDeals = async (req, res) => {
    try {
        const allDeals = await dealsModel.find({ isActive: true }).sort({ createdAt: -1 });

        return res.status(statusCodes.success).send({
            result: true,
            message: allDeals.length ? "Found All Deals" : "No Active Deals",
            data: allDeals
        });
    } catch (error) {
        console.error('Error getting deals:', error);
        return res.status(statusCodes.serverError).send({
            result: false,
            message: "Error in Getting Deals. Please Try Again Later"
        });
    }
};

const deleteDeals = async (req, res) => {
    try {
        let { productid } = req?.params;

        if (!productid) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "Deal ID Invalid"
            });
        }

        let dealInTable = await dealsModel.findById(productid);

        if (!dealInTable) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "Deal Not Found"
            });
        }

        // Delete the deal
        await dealsModel.findByIdAndDelete(productid);

        // Remove deal from products based on deal type
        if (dealInTable.dealType === 'segment') {
            // Remove deal from all articles in segment
            await productModel.updateMany(
                { segment: dealInTable.segmentName },
                {
                    $set: {
                        "variants.$[].articles.$[].deal": { minQuantity: null, reward: null },
                        "variants.$[].articles.$[].indeal": false
                    }
                }
            );
        } else {
            // Remove deal from specific article
            await productModel.findOneAndUpdate(
                { "variants.articles._id": dealInTable.articleId },
                {
                    $set: {
                        "variants.$[v].articles.$[a].deal": { minQuantity: null, reward: null },
                        "variants.$[v].articles.$[a].indeal": false
                    }
                },
                {
                    arrayFilters: [
                        { "v.articles._id": dealInTable.articleId },
                        { "a._id": dealInTable.articleId }
                    ],
                    new: true
                }
            );
        }

        return res.status(statusCodes.success).send({
            result: true,
            message: "Deal Deleted Successfully"
        });

    } catch (error) {
        console.error('Error deleting deal:', error);
        return res.status(statusCodes.serverError).send({
            result: false,
            message: "Error in Deleting Deals. Please Try Again Later"
        });
    }
};

const updateDeal = async (req, res) => {
    try {
        let dealId = req?.params.id;
        let { startDate, endDate } = req?.body;

        if (!dealId) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "Deal ID Invalid"
            });
        }

        let dealInDb = await dealsModel.findById(dealId);

        if (!dealInDb) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "Deal Not Found"
            });
        }

        // Validate dates
        const newStartDate = startDate ? new Date(startDate) : dealInDb.startDate;
        const newEndDate = endDate ? new Date(endDate) : dealInDb.endDate;

        if (newStartDate >= newEndDate) {
            return res.status(statusCodes.badRequest).send({
                result: false,
                message: "End date must be after start date"
            });
        }

        // Update deal
        await dealsModel.findByIdAndUpdate(
            dealId,
            {
                startDate: newStartDate,
                endDate: newEndDate,
                expireAt: newEndDate
            },
            { new: true }
        );

        return res.status(statusCodes.success).send({
            result: true,
            message: "Deal Updated Successfully"
        });

    } catch (error) {
        console.error('Error updating deal:', error);
        return res.status(statusCodes.serverError).send({
            result: false,
            message: "Error in Updating Deals. Please Try Again Later"
        });
    }
};


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
    return res.status(500).json({
      result: false,
      message: "Error fetching articles",
      error: error.message
    });
  }
}



export {addProduct,importProductsFromExcel ,deleteProduct, updateProduct , getAllProducts , addBestDeals, getDeals, deleteDeals, updateDeal, getPurchases, markPurchaseConfirm, addCategories, getCategories, getArticlesForDropdown}

