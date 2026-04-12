import categoryModel from '../../Models/Categories.model.js';
import dealsModel from '../../Models/Deals.model.js';
import Festive from '../../Models/Festivle.model.js';
import productModel from '../../Models/Product.model.js';
import purchaseProductModel from '../../Models/Purchasedproduct.model.js';
import { uploadOnImgBB } from '../../Utils/imgbb.js'; // ✅ NEW IMPORT
import * as zod from 'zod';
import * as xlsx from 'xlsx';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const statusCodes = {
  success: 200,
  noContent: 204,
  badRequest: 400,
  unauthorized: 403,
  notFound: 404,
  serverError: 500,
  forbidden: 402
};

const productValidationSchema = zod.object({
  name: zod.string().min(1, 'Name is required'),
  price: zod.number().positive('Price must be a positive number'),
  category: zod.string().min(1, 'Category is required'),
  type: zod.string().min(1, 'Type is required'),
  colors: zod.union([
    zod.array(zod.string().min(1)),
    zod.string().min(1).transform(str => [str])
  ]),
  sizes: zod.union([
    zod.array(zod.string().min(1)),
    zod.string().min(1).transform(str => [str])
  ])
});

const parseField = (field) => {
  if (!field) return [];

  if (Array.isArray(field)) {
    return field.map(v => v.trim().toLowerCase()).filter(Boolean);
  }

  if (typeof field === "string") {
    return field
      .split(",")
      .map(v => v.trim().toLowerCase())
      .filter(Boolean);
  }

  return [];
};

const addProduct = async (req, res) => {
  try {
    let { segment, articleName, colors, sizes, variant, segmentKeywords, variantKeywords, articleKeywords } = req.body;
    let { gender } = req.body;

    console.log(req.body);

const genderArr = Array.isArray(gender)
  ? gender.map(g => g.trim().toLowerCase()).filter(Boolean)
  : typeof gender === 'string'
    ? [gender.trim().toLowerCase()]
    : [];

    // Preserve casing, only trim
    segment = segment?.trim();
    variant = variant?.trim();
    articleName = articleName?.trim();

    const segmentKeywordsArr = parseField(req.body.segmentKeywords);
    const variantKeywordsArr = parseField(req.body.variantKeywords);
    const articleKeywordsArr = parseField(req.body.articleKeywords);

    const colorsArr = Array.isArray(colors)
      ? colors.map(c => c.trim()).filter(Boolean)
      : typeof colors === 'string'
        ? colors.split(',').map(c => c.trim()).filter(Boolean)
        : [];

    const sizesArr = Array.isArray(sizes)
      ? sizes.map(s => s.trim()).filter(Boolean)
      : typeof sizes === 'string'
        ? sizes.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    if (!req.files || req.files.length === 0) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Please Upload At Least One Image'
      });
    }

    const uploadPromises = req.files.map(file => uploadOnImgBB(file.path));
    let uploadResults;

    try {
      uploadResults = await Promise.all(uploadPromises);
    } catch (uploadError) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'One or more images failed to upload. Please try again later'
      });
    }

    const imageUrls = uploadResults
      .filter(result => result?.secure_url)
      .map(result => result.secure_url);

    if (imageUrls.length === 0) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'No valid images uploaded'
      });
    }

    // ✅ All keywords stored at article level only
    const newArticle = {
      name: articleName,
      images: imageUrls,
      gender: genderArr,
      colors: colorsArr,
      sizes: sizesArr,
      segmentKeywords: segmentKeywordsArr,
      variantKeywords: variantKeywordsArr,
      articleKeywords: articleKeywordsArr,
    };

    // Case-insensitive segment lookup
    let existingSegment = await productModel.findOne({
      segment: { $regex: new RegExp(`^${segment}$`, 'i') }
    });

    if (!existingSegment) {
      // Brand new segment
      await productModel.create({
        segment,
        variants: [{
          name: variant,
          articles: [newArticle]
        }]
      });
      return res.status(statusCodes.success).send({
        result: true,
        message: 'Segment, variant, and article created successfully'
      });
    }

    // Existing segment — find or create variant (case-insensitive)
    let variantIndex = existingSegment.variants.findIndex(
      v => v.name?.toLowerCase() === variant?.toLowerCase()
    );

    if (variantIndex === -1) {
      // New variant under existing segment
      existingSegment.variants.push({
        name: variant,
        articles: [newArticle]
      });
    } else {
      // Existing variant — just push the new article
      existingSegment.variants[variantIndex].articles.push(newArticle);
    }

    await existingSegment.save();
    return res.status(statusCodes.success).send({
      result: true,
      message: 'Article added successfully'
    });

  } catch (error) {
    console.error('Error in addProduct:', error);
    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error adding product. Please try again later',
      error: error.message
    });
  }
};


const importProductsFromExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send({
        result: false,
        message: 'No Excel file uploaded'
      });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    for (const row of rows) {
      let { Segment, Variant, ArticleName, Gender, Colors, Sizes, ImagePaths } = row;

      Segment = Segment?.trim().toLowerCase();
      Variant = typeof Variant === 'string' ? Variant?.trim().toLowerCase() : Variant;
      ArticleName = typeof ArticleName === 'string' ? ArticleName?.trim().toLowerCase() : ArticleName;

      // Colors logic with allColorsAvailable check
      let isAllColorsAvailable = false;
      let formattedColors = Colors ? Colors.split(',').map(c => c.trim().toLowerCase()).filter(Boolean) : [];
      if (formattedColors.includes('all colors')) isAllColorsAvailable = true;

      const formattedSizes = Sizes ? Sizes.split(',').map(s => s.trim()) : [];
      const localPaths = ImagePaths ? ImagePaths.split(',').map(p => p.trim()) : [];

      // ✅ IMG BB UPLOAD FROM LOCAL PATHS
      const imageUrls = [];
      for (const localPath of localPaths) {
        const resolvedPath = path.resolve(localPath);
        const result = await uploadOnImgBB(resolvedPath);
        if (result?.secure_url) {
          imageUrls.push(result.secure_url);
        }
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
    res.status(201).send({
      result: true,
      message: 'Excel data imported successfully'
    });

  } catch (err) {
    res.status(500).send({
      result: false,
      message: 'Failed to import products',
      error: err.message
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { productid } = req.params;

    // 1. Is it a top-level product?
    const productDoc = await productModel.findById(productid);
    if (productDoc) {
      // Remove the entire product document
      await productModel.findByIdAndDelete(productid);
      return res.status(statusCodes.success).send({
        result: true,
        message: 'Product deleted'
      });
    }

    // 2. Otherwise, try to delete a nested article by its id
    // Find the product that contains this article
    const parent = await productModel.findOne({ 'variants.articles._id': productid });

    if (!parent) {
      return res.status(statusCodes.notFound).send({
        result: false,
        message: 'No product or article found'
      });
    }

    // Pull out the matching article from its variant
    await productModel.updateOne(
      { _id: parent._id },
      { $pull: { 'variants.$[].articles': { _id: productid } } }
    );

    return res.status(statusCodes.success).send({
      result: true,
      message: 'Article deleted'
    });

  } catch (error) {
    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error deleting. Please try again later.',
      error: error.message
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    let productid = req.params.productid || req.params.id || req.params.articleId || req.body.articleId || req.body.id;

    if (!productid) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Article ID is required'
      });
    }

    let { name, variantName, existingImages, segmentKeywords, variantKeywords, articleKeywords } = req.body;
    let { gender } = req.body;

    console.log(req.body);

  const genderArr = Array.isArray(gender)
    ? gender.map(g => g.trim().toLowerCase()).filter(Boolean)
    : typeof gender === 'string'
      ? [gender.trim().toLowerCase()]
      : [];

    // Preserve casing, only trim
    name = name?.trim();
    variantName = variantName?.trim();

    const segmentKeywordsArr = parseField(req.body.segmentKeywords);
    const variantKeywordsArr = parseField(req.body.variantKeywords);
    const articleKeywordsArr = parseField(req.body.articleKeywords);

    // Parse existing images
    let existingImagesArr = [];
    if (existingImages) {
      if (typeof existingImages === 'string') {
        try {
          existingImagesArr = JSON.parse(existingImages);
        } catch (e) {
          existingImagesArr = [];
        }
      } else if (Array.isArray(existingImages)) {
        existingImagesArr = existingImages;
      }
    }

    // Find the article by ID across all products
    const allProducts = await productModel.find();
    let targetProduct = null;
    let targetVariantIndex = -1;
    let targetArticleIndex = -1;

    for (let pIndex = 0; pIndex < allProducts.length; pIndex++) {
      const product = allProducts[pIndex];
      for (let vIndex = 0; vIndex < product.variants.length; vIndex++) {
        const variant = product.variants[vIndex];
        for (let aIndex = 0; aIndex < variant.articles.length; aIndex++) {
          if (variant.articles[aIndex]._id.toString() === productid) {
            targetProduct = product;
            targetVariantIndex = vIndex;
            targetArticleIndex = aIndex;
            break;
          }
        }
        if (targetProduct) break;
      }
      if (targetProduct) break;
    }

    if (!targetProduct || targetVariantIndex === -1 || targetArticleIndex === -1) {
      return res.status(statusCodes.notFound).send({
        result: false,
        message: 'Article not found in database'
      });
    }

    // Handle new image uploads
    let newImageUrls = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => uploadOnImgBB(file.path));
      try {
        const uploadResults = await Promise.all(uploadPromises);
        newImageUrls = uploadResults
          .filter(result => result?.secure_url)
          .map(result => result.secure_url);
      } catch (uploadError) {
        return res.status(statusCodes.badRequest).send({
          result: false,
          message: 'Image upload failed'
        });
      }
    }

    const allImages = [...existingImagesArr, ...newImageUrls];
    if (allImages.length === 0) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'At least one image required'
      });
    }

    // ✅ Update article fields only — keywords fully scoped to this article
    const targetArticle = targetProduct.variants[targetVariantIndex].articles[targetArticleIndex];

    if (name) targetArticle.name = name;
    if (genderArr.length > 0) targetArticle.gender = genderArr;
    targetArticle.images = allImages;
    targetArticle.segmentKeywords = segmentKeywordsArr;
    targetArticle.variantKeywords = variantKeywordsArr;
    targetArticle.articleKeywords = articleKeywordsArr;

    // Update variant name if changed
    if (variantName) {
      targetProduct.variants[targetVariantIndex].name = variantName;
    }

    await targetProduct.save();

    return res.status(statusCodes.success).send({
      result: true,
      message: 'Article updated successfully!'
    });

  } catch (error) {
    console.error('Error in updateProduct:', error);
    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Server error',
      error: error.message
    });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const { format } = req.query; // articles, segments, or both (default)

    const products = await productModel.find();

    if (!products || products.length === 0) {
      return res.status(statusCodes.notFound).send({
        result: false,
        message: 'No products found'
      });
    }

    // Flatten to articles with context AND keywords
    const articles = products.flatMap(product =>
  product.variants.flatMap(variant =>
    variant.articles.map(article => ({
      id: article._id,
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
      articleKeywords: article.articleKeywords,
      variantKeywords: article.variantKeywords,
      segmentKeywords: article.segmentKeywords,
      // Context fields
      variantId: variant._id,
      variantName: variant.name,
      productId: product._id,
      segment: product.segment,
    }))
  )
);

    // If frontend only wants articles list
    if (format === 'articles') {
      return res.status(statusCodes.success).send({
        result: true,
        message: 'Articles retrieved successfully',
        totalCount: articles.length,
        data: articles
      });
    }

    // Group by segment
    const groupedBySegment = articles.reduce((acc, article) => {
      const seg = article.segment || 'Unknown';
      if (!acc[seg]) acc[seg] = [];
      acc[seg].push(article);
      return acc;
    }, {});

    // Get unique segments list
    const segments = Object.keys(groupedBySegment).filter(seg => seg !== 'Unknown');

    // If frontend only wants segments
    if (format === 'segments') {
      return res.status(statusCodes.success).send({
        result: true,
        message: 'Segments retrieved successfully',
        data: segments
      });
    }

    // Default: return everything (format=both or no format specified)
    return res.status(statusCodes.success).send({
      result: true,
      message: 'Products retrieved successfully',
      totalCount: articles.length,
      segments,
      groupedData: groupedBySegment,
      data: articles
    });

  } catch (error) {

    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

const addBestDeals = async (req, res) => {
  try {
    let { dealName, start, end } = req?.body;
    let startDate = new Date(start);
    let endDate = new Date(end);

    // Trim deal name
    dealName = dealName ? dealName.trim() : '';

    // ACTIVE VALIDATIONS
    // Validate deal name
    if (!dealName) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Deal name is required'
      });
    }

    // Validate dates
    if (startDate >= endDate) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'End date must be after start date'
      });
    }

    // Check for image upload
    if (!req.files || req.files.length === 0) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Please Upload An Offer Image'
      });
    }

    // Check if deal name already exists
    const existingDeal = await dealsModel.findOne({ dealName, isActive: true });
    if (existingDeal) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'A deal with this name already exists. Please use a different name.'
      });
    }

    // ✅ Single image upload to ImgBB
    const uploadResult = await uploadOnImgBB(req.files[0].path);
    if (!uploadResult?.secure_url) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Image Failed to upload. Please try again later'
      });
    }

    // Create the simplified deal
    const newDeal = await dealsModel.create({
      dealName,
      startDate,
      endDate,
      image: uploadResult.secure_url, // ✅ ImgBB URL
      expireAt: endDate,
      isActive: true
    });

    return res.status(statusCodes.success).send({
      result: true,
      message: `Offer ${dealName} added successfully`,
      data: newDeal
    });

  } catch (error) {

    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error in Adding Offer. Please Try Again Later',
      error: error.message
    });
  }
};

const getDeals = async (req, res) => {
  try {
    const allDeals = await dealsModel.find({ isActive: true }).sort({ createdAt: -1 });
    return res.status(statusCodes.success).send({
      result: true,
      message: allDeals.length ? 'Found All Offers' : 'No Active Offers',
      data: allDeals
    });
  } catch (error) {

    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error in Getting Offers. Please Try Again Later'
    });
  }
};

const deleteDeals = async (req, res) => {
  try {
    let { productid } = req?.params;
    if (!productid) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Offer ID Invalid'
      });
    }

    let dealInTable = await dealsModel.findById(productid);
    if (!dealInTable) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Offer Not Found'
      });
    }

    // Delete the deal
    await dealsModel.findByIdAndDelete(productid);

    return res.status(statusCodes.success).send({
      result: true,
      message: 'Offer Deleted Successfully'
    });

  } catch (error) {

    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error in Deleting Offer. Please Try Again Later'
    });
  }
};

const updateDeal = async (req, res) => {
  try {
    let { id: dealId } = req?.params;
    let { startDate, endDate } = req?.body;

    if (!dealId) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Offer ID Invalid'
      });
    }

    let dealInDb = await dealsModel.findById(dealId);
    if (!dealInDb) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Offer Not Found'
      });
    }

    // Validate dates
    const newStartDate = startDate ? new Date(startDate) : dealInDb.startDate;
    const newEndDate = endDate ? new Date(endDate) : dealInDb.endDate;

    if (newStartDate >= newEndDate) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'End date must be after start date'
      });
    }

    // Update deal
    await dealsModel.findByIdAndUpdate(dealId, {
      startDate: newStartDate,
      endDate: newEndDate,
      expireAt: newEndDate
    }, { new: true });

    return res.status(statusCodes.success).send({
      result: true,
      message: 'Offer Updated Successfully'
    });

  } catch (error) {

    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error in Updating Offer. Please Try Again Later'
    });
  }
};

const getPurchases = async (req, res) => {
  try {
    let allPurchases = await purchaseProductModel.find();
    if (!allPurchases || allPurchases.length === 0) {
      return res.status(statusCodes.success).send({
        result: true,
        message: 'Orders Not Placed'
      });
    }
    return res.status(statusCodes.success).send({
      result: true,
      message: 'Found All Purchases',
      data: allPurchases
    });
  } catch (error) {
    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error in Fetching Purchases. Please Try Again Later'
    });
  }
};

const markPurchaseConfirm = async (req, res) => {
  try {
    let { id: productid } = req?.params;
    

    
    if (!productid) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Product Id Invalid'
      });
    }

    // ✅ FIXED: Use correct field name from schema
    let purchase = await purchaseProductModel.findById(productid);
    

    
    if (!purchase) {
      return res.status(statusCodes.notFound).send({
        result: false,
        message: 'Purchase not found'
      });
    }

    // ✅ FIXED: Correct field name (matches schema)
    purchase.isFulfiled = true; 
    await purchase.save();



    return res.status(statusCodes.success).send({
      result: true,
      message: 'Purchase confirmed successfully'
    });
  } catch (error) {

    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error in Marking Purchase. Please Try Again Later',
      error: error.message
    });
  }
};


const addCategories = async (req, res) => {
  try {
    let { category } = req?.body;
    if (!category) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'Category Not Found'
      });
    }

    let categoryInLowerCase = category.toLowerCase();
    let categoryInDb = await categoryModel.findOne({ category: categoryInLowerCase });

    if (categoryInDb) {
      return res.status(statusCodes.success).send({
        result: true,
        message: 'Category Already Exists'
      });
    }

    await categoryModel.create({ category: categoryInLowerCase });
    return res.status(statusCodes.success).send({
      result: true,
      message: 'Category Added Successfully'
    });
  } catch (error) {
    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error in Adding Category. Please Try Again Later'
    });
  }
};

const getCategories = async (req, res) => {
  try {
    let categories = await categoryModel.find();
    if (!categories || categories.length === 0) {
      return res.status(statusCodes.badRequest).send({
        result: false,
        message: 'No Categories Added Yet'
      });
    }
    return res.status(statusCodes.success).send({
      result: true,
      message: 'Categories Retrieved Successfully',
      data: categories
    });
  } catch (error) {
    return res.status(statusCodes.serverError).send({
      result: false,
      message: 'Error in Fetching Category. Please Try Again Later'
    });
  }
};

const getArticlesForDropdown = async (req, res) => {
  try {
    const articles = await productModel.aggregate([
      { $unwind: "$variants" },                    // ✅ Already correct
      { $unwind: "$variants.articles" },           // ✅ FIXED: Added $
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
      message: 'Articles retrieved successfully',
      data: articles
    });
  } catch (error) {

    return res.status(500).json({
      result: false,
      message: 'Error fetching articles',
      error: error.message
    });
  }
};


export {
  addProduct,
  importProductsFromExcel,
  deleteProduct,
  updateProduct,
  getAllProducts,
  addBestDeals,
  getDeals,
  deleteDeals,
  updateDeal,
  getPurchases,
  markPurchaseConfirm,
  addCategories,
  getCategories,
  getArticlesForDropdown
};
