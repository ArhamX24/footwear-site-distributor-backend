import { inngest } from "../client.js";
import { EVENTS } from "../events.js";
import dealsModel from "../../Models/Deals.model.js";
import productModel from "../../Models/Product.model.js";
import mongoose from "mongoose";

export const checkExpiredDeals = inngest.createFunction(
  {
    id: "check-expired-deals",
    name: "Check and Process Expired Deals",
    // Run every minute
    cron: "*/1 * * * *"
  },
  { event: EVENTS.CLEANUP_EXPIRED_DEALS },
  async ({ event, step }) => {
    // Step 1: Find all expired deals
    const expiredDeals = await step.run("find-expired-deals", async () => {
      try {
        const deals = await dealsModel.find({
          expireAt: { $lt: new Date() },
          isActive: true
        }).lean();

        console.log(`🔍 Found ${deals.length} expired deals to process`);
        return deals;
      } catch (error) {
        console.error("Error finding expired deals:", error);
        throw error;
      }
    });

    if (!expiredDeals || expiredDeals.length === 0) {
      return { success: true, message: "No expired deals to process" };
    }

    // Step 2: Process each expired deal
    const results = await step.run("process-expired-deals", async () => {
      const processed = [];
      const failed = [];

      for (const deal of expiredDeals) {
        try {
          // Process based on deal type
          if (deal.dealType === 'segment') {
            // Remove deal from all articles in segment
            await productModel.updateMany(
              { segment: deal.segmentName },
              {
                $set: {
                  "variants.$[].articles.$[].indeal": false,
                  "variants.$[].articles.$[].deal.minQuantity": null,
                  "variants.$[].articles.$[].deal.reward": null
                }
              }
            );

            console.log(`✅ Removed segment deal from "${deal.segmentName}"`);
          } else if (deal.dealType === 'article') {
            // Validate articleId
            if (!deal.articleId || !mongoose.Types.ObjectId.isValid(deal.articleId)) {
              console.warn(`⚠️ Invalid articleId in deal ${deal._id}`);
              failed.push({ dealId: deal._id, reason: "Invalid articleId" });
              continue;
            }

            // Remove deal from specific article
            const updateResult = await productModel.updateOne(
              { "variants.articles._id": new mongoose.Types.ObjectId(deal.articleId) },
              {
                $set: {
                  "variants.$[v].articles.$[a].indeal": false,
                  "variants.$[v].articles.$[a].deal.minQuantity": null,
                  "variants.$[v].articles.$[a].deal.reward": null
                }
              },
              {
                arrayFilters: [
                  { "v.articles._id": new mongoose.Types.ObjectId(deal.articleId) },
                  { "a._id": new mongoose.Types.ObjectId(deal.articleId) }
                ]
              }
            );

            if (updateResult.modifiedCount > 0) {
              console.log(`✅ Removed article deal for article ${deal.articleId}`);
            }
          }

          // Delete the deal from deals collection
          await dealsModel.deleteOne({ _id: deal._id });

          processed.push({
            dealId: deal._id,
            type: deal.dealType,
            name: deal.articleName || deal.segmentName
          });
        } catch (dealError) {
          console.error(`❌ Error processing deal ${deal._id}:`, dealError.message);
          failed.push({
            dealId: deal._id,
            reason: dealError.message
          });
        }
      }

      return { processed, failed };
    });

    // Step 3: Return summary
    return {
      success: true,
      processedCount: results.processed.length,
      failedCount: results.failed.length,
      processed: results.processed,
      failed: results.failed,
      timestamp: new Date().toISOString()
    };
  }
);

/**
 * Background job for manual deal expiry trigger
 * Can be called via API or event
 */
export const expireDealManually = inngest.createFunction(
  {
    id: "expire-deal-manually",
    name: "Manually Expire a Deal"
  },
  { event: EVENTS.DEAL_EXPIRED },
  async ({ event, step }) => {
    const { dealId } = event.data;

    // Step 1: Find the deal
    const deal = await step.run("find-deal", async () => {
      return await dealsModel.findById(dealId).lean();
    });

    if (!deal) {
      throw new Error(`Deal ${dealId} not found`);
    }

    // Step 2: Remove deal from products
    await step.run("remove-deal-from-products", async () => {
      if (deal.dealType === 'segment') {
        await productModel.updateMany(
          { segment: deal.segmentName },
          {
            $set: {
              "variants.$[].articles.$[].indeal": false,
              "variants.$[].articles.$[].deal.minQuantity": null,
              "variants.$[].articles.$[].deal.reward": null
            }
          }
        );
      } else {
        await productModel.updateOne(
          { "variants.articles._id": new mongoose.Types.ObjectId(deal.articleId) },
          {
            $set: {
              "variants.$[v].articles.$[a].indeal": false,
              "variants.$[v].articles.$[a].deal.minQuantity": null,
              "variants.$[v].articles.$[a].deal.reward": null
            }
          },
          {
            arrayFilters: [
              { "v.articles._id": new mongoose.Types.ObjectId(deal.articleId) },
              { "a._id": new mongoose.Types.ObjectId(deal.articleId) }
            ]
          }
        );
      }
    });

    // Step 3: Delete the deal
    await step.run("delete-deal", async () => {
      await dealsModel.deleteOne({ _id: dealId });
    });

    return {
      success: true,
      message: `Deal ${dealId} expired successfully`,
      dealType: deal.dealType,
      dealName: deal.articleName || deal.segmentName
    };
  }
);
