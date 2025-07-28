import { v2 as cloudinary } from 'cloudinary';
import fs from "fs";
import path from "path";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (filePath) => {
  try {
    const fileStat = fs.statSync(filePath);
    if (!fileStat.isFile()) {
      console.warn(`⏭️ Skipping upload: ${filePath} is not a file.`);
      return null;
    }

    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: "image"
    });

    const uploadsDir = path.resolve("Uploads");
    const relative = path.relative(uploadsDir, filePath);
    const isTempUpload = !relative.startsWith("..") && !path.isAbsolute(relative);

    if (isTempUpload) {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error(`⚠️ Error deleting temp file ${filePath}:`, err);
        } else {
          console.log(`🧹 Temporary file deleted: ${filePath}`);
        }
      });
    }

    return result;
  } catch (error) {
    console.error("❌ Cloudinary upload failed:", error.message || error);

    try {
      const uploadsDir = path.resolve("Uploads");
      const relative = path.relative(uploadsDir, filePath);
      const isTempUpload = !relative.startsWith("..") && !path.isAbsolute(relative);

      if (isTempUpload) {
        fs.unlink(filePath, (err) => {
          if (err) console.error(`⚠️ Cleanup error for ${filePath}:`, err);
        });
      }
    } catch (cleanupErr) {
      console.error(`⚠️ Secondary cleanup error:`, cleanupErr);
    }

    return null;
  }
};

export { uploadOnCloudinary };