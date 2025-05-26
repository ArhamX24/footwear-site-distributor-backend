import { v2 as cloudinary } from 'cloudinary';
import fs from "fs"

cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (filePath) => {
    try {
        const result = await cloudinary.uploader.upload(filePath, { resource_type: "image" });
        fs.unlink(filePath, (err) => {
          if (err) console.error(`Error deleting local file ${filePath}:`, err);
          else console.log(`Successfully removed local file: ${filePath}`);
        });
        return result;
      } catch (error) {
        // Delete the local file if upload fails
        fs.unlink(filePath, (err) => {
          if (err)
            console.error(`Error deleting local file ${filePath} after failure:`, err);
        });
        console.error("Error uploading file to Cloudinary:", error);
        // Pass the error up so that the route handler can respond appropriately.
        throw new Error("Image upload failed on Cloudinary");
      }
};

export {uploadOnCloudinary}
            

