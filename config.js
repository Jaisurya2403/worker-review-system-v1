// ============================================================
// js/config.js
// Change API_BASE here when you deploy to production.
// All other JS files import from this constant.
// ============================================================

// LOCAL development:
const API_BASE = 'http://localhost:5000/api';

// PRODUCTION (uncomment and replace when deploying to Render):
// const API_BASE = 'https://your-app.onrender.com/api';

// Image base URL for local images (not needed for Cloudinary URLs)
const IMG_BASE = API_BASE.replace('/api', '');
