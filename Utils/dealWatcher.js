import mongoose from "mongoose";
import dealsModel from "../Models/Deals.model.js";
import productModel from "../Models/Product.model.js";

const watchDeals = () => {
  const dealStream = dealsModel.watch();

  dealStream.on("change", async (change) => {
    if (change.operationType === "delete") {
      const articleId = change.documentKey._id;

      await productModel.findByIdAndUpdate(articleId, {
        $unset: { deal: "", indeal: "" },
      });

      console.log(`✅ Expired deal removed & product updated: ${articleId}`);
    }
  });

};

export default watchDeals;