// ============================================================
// js/utils.js  –  shared helpers used across all pages
// ============================================================

/**
 * getImageUrl
 * Returns a usable <img src> for a worker's image_path.
 * - Cloudinary URLs start with https:// → use as-is
 * - Local paths like "uploads/abc.jpg" → prepend IMG_BASE
 * - null/empty → return null (caller shows placeholder)
 */
function getImageUrl(imagePath) {
  if (!imagePath) return null;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath; // Cloudinary or any absolute URL
  }
  return `${IMG_BASE}/${imagePath}`; // local file
}

/**
 * workerAvatarHtml
 * Returns the HTML for a worker avatar (img or emoji placeholder).
 * @param {string|null} imagePath  worker.image_path from DB
 * @param {string}      name       worker name (for alt text)
 * @param {string}      cssClass   CSS class on <img>
 * @param {string}      size       inline style size e.g. "72px"
 */
function workerAvatarHtml(imagePath, name = '', cssClass = 'worker-avatar', size = '72px') {
  const url = getImageUrl(imagePath);
  if (url) {
    return `<img
      src="${url}"
      class="${cssClass}"
      alt="${escapeHtml(name)}"
      style="width:${size};height:${size};border-radius:50%;object-fit:cover;"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
    /><div class="worker-avatar-placeholder" style="display:none;width:${size};height:${size};">👤</div>`;
  }
  return `<div class="worker-avatar-placeholder" style="width:${size};height:${size};">👤</div>`;
}

/** escapeHtml – prevent XSS */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** starsHtml – render ★☆ stars */
function starsHtml(rating) {
  const r = parseInt(rating) || 0;
  return '★'.repeat(r) + '☆'.repeat(Math.max(0, 5 - r));
}

/** showAlert – render an alert into a container element */
function showAlert(containerId, message, type = 'success', autoDismiss = 4000) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
  if (autoDismiss > 0) setTimeout(() => { el.innerHTML = ''; }, autoDismiss);
}
