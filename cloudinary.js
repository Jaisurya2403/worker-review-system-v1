// ============================================================
// config/cloudinary.js
// Cloudinary helper – upload buffer, delete image, extract ID
// ============================================================

const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name : process.env.CLOUDINARY_CLOUD_NAME,
  api_key    : process.env.CLOUDINARY_API_KEY,
  api_secret : process.env.CLOUDINARY_API_SECRET
});

/**
 * uploadBuffer  –  uploads a Buffer to Cloudinary
 * @param {Buffer} buffer       req.file.buffer from multer memoryStorage
 * @param {string} folder       e.g. "worker-review/workers"
 * @param {string} [publicId]   pass existing public_id to overwrite in-place
 * @returns {Promise<{secure_url, public_id}>}
 */
function uploadBuffer(buffer, folder = 'worker-review/workers', publicId = null) {
  return new Promise((resolve, reject) => {
    const options = {
      folder,
      resource_type : 'image',
      transformation: [
        { width: 400, height: 400, crop: 'limit', quality: 'auto:good' }
      ]
    };

    if (publicId) {
      options.public_id  = publicId;
      options.overwrite  = true;
      options.invalidate = true;
    }

    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });

    stream.end(buffer);
  });
}

/**
 * deleteImage  –  removes an asset from Cloudinary
 * @param {string} publicId   e.g. "worker-review/workers/abc123"
 */
async function deleteImage(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.warn('Cloudinary delete warning (non-fatal):', err.message);
  }
}

/**
 * extractPublicId  –  gets public_id from a Cloudinary secure_url
 * e.g. "https://res.cloudinary.com/demo/image/upload/v123/folder/name.jpg"
 *  →  "folder/name"
 */
function extractPublicId(secureUrl) {
  if (!secureUrl || !secureUrl.startsWith('https://res.cloudinary.com')) return null;
  try {
    const match = secureUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z]+$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

module.exports = { uploadBuffer, deleteImage, extractPublicId };
