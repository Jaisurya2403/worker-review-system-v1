// ============================================================
// middleware/uploadMiddleware.js
//
// Uses multer memoryStorage so the file stays in RAM as
// req.file.buffer — storeController uploads it to Cloudinary
// OR saves to local disk depending on IMAGE_STORAGE env var.
// Nothing is written to disk here.
// ============================================================

const multer = require('multer');
const path   = require('path');

// memoryStorage keeps file in req.file.buffer (no disk writes)
const storage = multer.memoryStorage();

// Only allow image file types
function fileFilter(req, file, cb) {
  const allowedExts  = /jpeg|jpg|png|gif|webp/;
  const allowedMimes = /image\/(jpeg|jpg|png|gif|webp)/;

  const extOk  = allowedExts.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowedMimes.test(file.mimetype);

  if (extOk && mimeOk) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
}

const upload = multer({
  storage,
  limits    : { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter
});

module.exports = upload;
