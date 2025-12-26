import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const IMGBB_API_KEY = process.env.IMGBB_API_KEY; // Add to .env

export const uploadOnImgBB = async (filePath) => {
  try {
    const fileStat = fs.statSync(filePath);
    if (!fileStat.isFile) {
      console.warn(`Skipping upload: ${filePath} is not a file.`);
      return null;
    }

    const form = new FormData();
    form.append('image', fs.createReadStream(filePath));
    form.append('key', IMGBB_API_KEY);
    form.append('album', 'articles'); // Organize uploads

    const response = await axios.post('https://api.imgbb.com/1/upload', form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    // Cleanup temp file
    const uploadsDir = path.resolve('Uploads');
    const relative = path.relative(uploadsDir, filePath);
    const isTempUpload = !relative.startsWith('..') && !path.isAbsolute(relative);
    
    if (isTempUpload) {
      fs.unlink(filePath, (err) => {
        if (err) console.error(`Error deleting temp file ${filePath}:`, err);
      });
    }

    return {
      secure_url: response.data.data.url,
      public_id: response.data.data.id
    };
  } catch (error) {
    console.error('ImgBB upload error:', error.message);
    
    // Cleanup on error
    try {
      const uploadsDir = path.resolve('Uploads');
      const relative = path.relative(uploadsDir, filePath);
      const isTempUpload = !relative.startsWith('..') && !path.isAbsolute(relative);
      if (isTempUpload) {
        fs.unlink(filePath, (err) => {
          if (err) console.error(`Cleanup error for ${filePath}:`, err);
        });
      }
    } catch (cleanupErr) {
      console.error('Secondary cleanup error:', cleanupErr);
    }
    return null;
  }
};
