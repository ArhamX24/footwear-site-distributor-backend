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
    const {
      segment,
      variant,
      articleName,
      gender,
      sizes,
      // ✅ keywords
      segmentKeywords,
      variantKeywords,
      articleKeywords,
    } = req.body;
 
    // ── Parse colors from formData (multer sends repeated fields as array) ──
    // req.body.colors can be:  undefined | string | string[]
    let colorsRaw = req.body.colors;
    let colorsArr = [];
    if (colorsRaw) {
      if (Array.isArray(colorsRaw)) {
        colorsArr = colorsRaw.map((c) => c.trim().toLowerCase()).filter(Boolean);
      } else {
        // single value sent as string
        colorsArr = colorsRaw
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
      }
    }
 
    // ── Parse gender ──────────────────────────────────────────────────────────
    let genderArr = [];
    if (gender) {
      genderArr = Array.isArray(gender) ? gender : [gender];
    }
 
    // ── Parse sizes ───────────────────────────────────────────────────────────
    let sizesArr = [];
    if (sizes) {
      sizesArr = Array.isArray(sizes) ? sizes : [sizes];
    }
 
    // ── Parse keywords ────────────────────────────────────────────────────────
    const parseKw = (raw) =>
      raw
        ? raw.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
        : [];
 
    const segKw = parseKw(segmentKeywords);
    const varKw = parseKw(variantKeywords);
    const artKw = parseKw(articleKeywords);
 
    // ── Upload images to ImgBB ────────────────────────────────────────────────
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map((file) => uploadOnImgBB(file.path));
      const results        = await Promise.all(uploadPromises);
      imageUrls            = results
        .filter((r) => r?.secure_url)
        .map((r) => r.secure_url);
    }
 
    if (imageUrls.length === 0) {
      return res.status(400).json({
        result:  false,
        message: 'At least one image is required',
      });
    }
 
    // ── Build article object ──────────────────────────────────────────────────
    const newArticle = {
      name:            articleName,
      images:          imageUrls,
      gender:          genderArr,
      colors:          colorsArr,       // ✅ stored
      sizes:           sizesArr,
      segmentKeywords: segKw,
      variantKeywords: varKw,
      articleKeywords: artKw,
    };
 
    let product = await productModel.findOne({
      segment: { $regex: `^${segment}$`, $options: 'i' },
    });

    // Added Fixes
 
    if (!product) {
      product = new productModel({ segment, variants: [] });
    }
 
    const variantName  = variant || 'General';
    let   variantDoc   = product.variants.find(
      (v) => v.name.toLowerCase() === variantName.toLowerCase()
    );
 
    if (!variantDoc) {
      product.variants.push({ name: variantName, articles: [newArticle] });
    } else {
      variantDoc.articles.push(newArticle);
    }
 
    await product.save();
 
    return res.status(200).json({
      result:  true,
      message: 'Product added successfully',
    });
  } catch (error) {
    console.error('addProduct error:', error);
    return res.status(500).json({
      result:  false,
      message: 'Failed to add product',
      error:   error.message,
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
    const { id } = req.params;
    const mongoose = await import('mongoose');
    const objectId = new mongoose.default.Types.ObjectId(id);
 
    const product = await Product.findOne({ 'variants.articles._id': objectId });
 
    if (!product) {
      return res.status(404).json({ result: false, message: 'Article not found' });
    }
 
    for (const variant of product.variants) {
      const idx = variant.articles.findIndex(
        (a) => a._id.toString() === objectId.toString()
      );
      if (idx !== -1) {
        variant.articles.splice(idx, 1);
        break;
      }
    }
 
    // Remove empty variants
    product.variants = product.variants.filter((v) => v.articles.length > 0);
 
    await product.save();
 
    return res.status(200).json({ result: true, message: 'Article deleted' });
  } catch (error) {
    return res.status(500).json({
      result:  false,
      message: 'Failed to delete product',
      error:   error.message,
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const {
      articleId,
      name,
      segment,
      variantName,
      existingImages,   // JSON string of already-stored image URLs to keep
      gender,
      segmentKeywords,
      variantKeywords,
      articleKeywords,
    } = req.body;
 
    if (!articleId) {
      return res.status(400).json({ result: false, message: 'articleId is required' });
    }
 
    // ── Parse colors ──────────────────────────────────────────────────────────
    let colorsRaw = req.body.colors;
    let colorsArr = [];
    if (colorsRaw) {
      if (Array.isArray(colorsRaw)) {
        colorsArr = colorsRaw.map((c) => c.trim().toLowerCase()).filter(Boolean);
      } else {
        colorsArr = colorsRaw
          .split(',')
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
      }
    }
 
    // ── Parse gender ──────────────────────────────────────────────────────────
    let genderArr = [];
    if (gender) {
      genderArr = Array.isArray(gender) ? gender : [gender];
    }
 
    // ── Parse keywords ────────────────────────────────────────────────────────
    const parseKw = (raw) =>
      raw
        ? raw.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean)
        : [];
 
    const segKw = parseKw(segmentKeywords);
    const varKw = parseKw(variantKeywords);
    const artKw = parseKw(articleKeywords);
 
    // ── Keep existing images + upload new ones ────────────────────────────────
    let keptImages = [];
    try {
      keptImages = existingImages ? JSON.parse(existingImages) : [];
    } catch {
      keptImages = [];
    }
 
    let newImageUrls = [];
    if (req.files && req.files.length > 0) {
      const results = await Promise.all(
        req.files.map((f) => uploadOnImgBB(f.path))
      );
      newImageUrls = results
        .filter((r) => r?.secure_url)
        .map((r) => r.secure_url);
    }
 
    const finalImages = [...keptImages, ...newImageUrls];
 
    if (finalImages.length === 0) {
      return res.status(400).json({
        result:  false,
        message: 'At least one image is required',
      });
    }
 
    // ── Find the product containing this article ──────────────────────────────
    const mongoose = await import('mongoose');
    const objectId = new mongoose.default.Types.ObjectId(articleId);
 
    const product = await productModel.findOne({
      'variants.articles._id': objectId,
    });
 
    if (!product) {
      return res.status(404).json({ result: false, message: 'Article not found' });
    }
 
    // ── Locate and update the article inside nested arrays ────────────────────
    let updated = false;
    for (const variant of product.variants) {
      const article = variant.articles.id(objectId);
      if (article) {
        article.name            = name            || article.name;
        article.gender          = genderArr.length ? genderArr : article.gender;
        article.colors          = colorsArr;           // ✅ always overwrite (even empty = clear)
        article.images          = finalImages;
        article.segmentKeywords = segKw;
        article.variantKeywords = varKw;
        article.articleKeywords = artKw;
 
        // Update variant name if changed
        if (variantName && variant.name !== variantName) {
          variant.name = variantName;
        }
 
        // Update segment if changed
        if (segment && product.segment !== segment) {
          product.segment = segment;
        }
 
        updated = true;
        break;
      }
    }
 
    if (!updated) {
      return res.status(404).json({ result: false, message: 'Article not found in variants' });
    }
 
    await product.save();
 
    return res.status(200).json({
      result:  true,
      message: 'Product updated successfully',
    });
  } catch (error) {
    console.error('updateProduct error:', error);
    return res.status(500).json({
      result:  false,
      message: 'Failed to update product',
      error:   error.message,
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
    const products = await Product.find({ 'variants.articles.indeal': true }).lean();
    const deals    = [];
 
    products.forEach((product) => {
      product.variants?.forEach((variant) => {
        variant.articles?.forEach((article) => {
          if (article.indeal) {
            deals.push({
              _id:        article._id,
              name:       article.name,
              segment:    product.segment,
              variantName:variant.name,
              images:     article.images || [],
              deal:       article.deal   || {},
            });
          }
        });
      });
    });
 
    return res.status(200).json({ result: true, data: deals });
  } catch (error) {
    return res.status(500).json({ result: false, message: 'Failed to fetch deals' });
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
