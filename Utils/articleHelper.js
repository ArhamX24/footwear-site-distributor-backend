// services/ArticleMatcher.js
import Product from "../Models/Product.model.js";

class ArticleMatcher {
  // Find best matching article name from database
  static async findBestMatch(contractorArticleName) {
    const allProducts = await Product.find({});
    const allArticles = [];

    // Extract all articles from all products/variants
    allProducts.forEach(product => {
      product.variants.forEach(variant => {
        variant.articles.forEach(article => {
          allArticles.push({
            productId: product._id,
            variantName: variant.name,
            articleName: article.name,
            segment: product.segment
          });
        });
      });
    });

    // 1. Try exact match first
    const exactMatch = allArticles.find(article => 
      article.articleName.toLowerCase() === contractorArticleName.toLowerCase()
    );
    
    if (exactMatch) {
      return { 
        match: exactMatch, 
        confidence: 100, 
        type: 'exact',
        needsValidation: false 
      };
    }

    // 2. Try fuzzy matching using Levenshtein distance
    const fuzzyMatches = allArticles
      .map(article => ({
        ...article,
        similarity: this.calculateSimilarity(contractorArticleName, article.articleName)
      }))
      .filter(article => article.similarity > 0.6) // 60% similarity threshold
      .sort((a, b) => b.similarity - a.similarity);

    if (fuzzyMatches.length > 0) {
      return {
        match: fuzzyMatches[0],
        confidence: Math.round(fuzzyMatches[0].similarity * 100),
        type: 'fuzzy',
        needsValidation: fuzzyMatches[0].similarity < 0.85, // Need validation if < 85% match
        alternatives: fuzzyMatches.slice(1, 4) // Show top 3 alternatives
      };
    }

    // 3. No match found
    return { 
      match: null, 
      confidence: 0, 
      type: 'no_match',
      needsValidation: true 
    };
  }

  // Calculate similarity between two strings
  static calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  // Levenshtein distance algorithm
  static levenshteinDistance(str1, str2) {
    const matrix = [];

    // Initialize first row and column
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    // Fill the matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1).toLowerCase() === str1.charAt(j - 1).toLowerCase()) {
          matrix[i][j] = matrix[i - 1][j - 1]; // No operation needed
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // Substitution
            matrix[i][j - 1] + 1,     // Insertion
            matrix[i - 1][j] + 1      // Deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }
}

// Helper function to create new article
const createNewArticle = async (articleName, colors, sizes, userId) => {
  try {
    // Find or create "New Articles" product
    let product = await Product.findOne({ segment: 'New Articles' });
    
    if (!product) {
      // Create new product for contractor-added articles
      product = new Product({
        segment: 'New Articles',
        variants: [{
          name: 'Contractor Additions',
          articles: []
        }]
      });
    }

    // Ensure the "Contractor Additions" variant exists
    let variant = product.variants.find(v => v.name === 'Contractor Additions');
    if (!variant) {
      product.variants.push({
        name: 'Contractor Additions',
        articles: []
      });
      variant = product.variants.find(v => v.name === 'Contractor Additions');
    }

    // Add new article to the variant
    const newArticle = {
      name: articleName,
      colors: Array.isArray(colors) ? colors : [colors],
      sizes: Array.isArray(sizes) ? sizes : [sizes],
      images: ['placeholder-image.jpg'], // Default image
      gender: 'Unspecified',
      indeal: false,
      deal: { minQuantity: '', reward: '' },
      allColorsAvailable: true,
      qrTracking: {
        totalQRsGenerated: 0,
        activeQRs: 0,
        manufacturedQRs: 0,
        receivedQRs: 0,
        shippedQRs: 0,
        lastQRGenerated: new Date()
      }
    };

    variant.articles.push(newArticle);
    await product.save();

    console.log(`✅ New article created: "${articleName}" in "New Articles/Contractor Additions"`);

    return {
      productId: product._id,
      variantName: 'Contractor Additions',
      articleName: articleName
    };

  } catch (error) {
    console.error('Error creating new article:', error);
    throw new Error('Failed to create new article');
  }
};

// Helper function to update article statistics
const updateArticleStats = async (productId, variantName, articleName, numberOfQRs) => {
  try {
    await Product.updateOne(
      { 
        _id: productId,
        'variants.name': variantName,
        'variants.articles.name': articleName
      },
      {
        $inc: {
          'variants.$[variant].articles.$[article].qrTracking.totalQRsGenerated': numberOfQRs,
          'variants.$[variant].articles.$[article].qrTracking.activeQRs': numberOfQRs,
          'variants.$[variant].articles.$[article].qrTracking.manufacturedQRs': numberOfQRs
        },
        $set: {
          'variants.$[variant].articles.$[article].qrTracking.lastQRGenerated': new Date()
        }
      },
      {
        arrayFilters: [
          { 'variant.name': variantName },
          { 'article.name': articleName }
        ]
      }
    );
  } catch (updateError) {
    console.log('Stats update failed:', updateError.message);
  }
};

export {ArticleMatcher, updateArticleStats, createNewArticle};
