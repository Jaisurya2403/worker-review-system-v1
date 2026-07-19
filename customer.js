// ============================================================
// js/customer.js  –  Customer review page
// ============================================================

let selectedWorkerId  = null;
let selectedRating    = 0;
let selectedReviewType = null;

const urlParams = new URLSearchParams(window.location.search);
const qrSlug    = urlParams.get('store');

// Character counter
document.getElementById('review-description').addEventListener('input', function () {
  document.getElementById('char-count').textContent = this.value.length;
});

// ── Init ──────────────────────────────────────────────────
async function init() {
  if (!qrSlug) {
    showError('❌', 'Invalid QR Code', 'No store identifier in the URL. Please scan the correct QR code.');
    return;
  }

  try {
    const res  = await fetch(`${API_BASE}/public/store/${qrSlug}`);
    const data = await res.json();

    if (!res.ok) {
      if (data.error === 'store_disabled') {
        showError('🔒', 'Store Unavailable', data.message || 'This store is not currently accepting reviews.');
      } else {
        showError('❌', 'Store Not Found', data.error || 'Could not find this store.');
      }
      return;
    }

    document.getElementById('store-name-badge').textContent = data.store.store_name;
    document.title = `Review – ${data.store.store_name}`;

    document.getElementById('loading-screen').style.display = 'none';
    const mp = document.getElementById('main-page');
    mp.classList.remove('hidden');
    mp.style.display = 'block';

    await loadWorkers();
  } catch (err) {
    showError('⚠️', 'Connection Error', 'Cannot reach the server. Please try again later.');
    console.error(err);
  }
}

// ── Load workers ──────────────────────────────────────────
async function loadWorkers() {
  try {
    const res  = await fetch(`${API_BASE}/public/store/${qrSlug}/workers`);
    const data = await res.json();

    document.getElementById('workers-loading').style.display = 'none';

    if (!res.ok || !data.workers || data.workers.length === 0) {
      document.getElementById('no-workers').classList.remove('hidden');
      return;
    }

    const container = document.getElementById('worker-cards');
    container.style.display = 'flex';
container.classList.add('worker-scroll-container');
    container.innerHTML = '';

    data.workers.forEach(worker => {
      const card = document.createElement('div');
      card.className = 'worker-card';
      card.onclick = () => selectWorker(worker.id, card);

      // getImageUrl handles both Cloudinary https:// URLs and local paths
const imageUrl = getImageUrl(worker.image_path);

const avatarHtml = imageUrl
 ? `<img src="${imageUrl}"
         class="worker-avatar clickable-avatar"
         style="width:120px;height:120px;border-radius:50%;object-fit:cover;cursor:pointer;"
         onclick="event.stopPropagation();openImageModal('${imageUrl}','${escapeHtml(worker.worker_name)}')">`
 : workerAvatarHtml(worker.image_path, worker.worker_name, 'worker-avatar', '120px');

      card.innerHTML = `
        <div style="margin-bottom:10px;">${avatarHtml}</div>
        <div class="worker-name">${escapeHtml(worker.worker_name)}</div>
        <div class="worker-role">${escapeHtml(worker.role || '')}</div>`;

      container.appendChild(card);
    });
  } catch (err) {
    document.getElementById('workers-loading').innerHTML =
      '<p style="color:var(--danger)">Failed to load workers. Please refresh.</p>';
  }
}

// ── Select worker ─────────────────────────────────────────
function selectWorker(workerId, cardEl) {
  selectedWorkerId = workerId;
  document.querySelectorAll('.worker-card').forEach(c => c.classList.remove('selected'));
  cardEl.classList.add('selected');
}

// ── Select review type ────────────────────────────────────
function selectReviewType(type) {
  selectedReviewType = type;
  document.getElementById('btn-good').classList.remove('selected');
  document.getElementById('btn-bad').classList.remove('selected');
  document.getElementById(`btn-${type}`).classList.add('selected');
  if (selectedRating === 0) selectRating(type === 'good' ? 5 : 1);
}

// ── Select star rating ────────────────────────────────────
function selectRating(value) {
  selectedRating = value;
  const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
  document.getElementById('rating-text').textContent = labels[value] || '';
  document.querySelectorAll('.star').forEach((star, i) => {
    star.classList.toggle('active', i < value);
  });
}

// ── Submit review ─────────────────────────────────────────
async function submitReview() {
  const alertArea = document.getElementById('alert-area');
  alertArea.innerHTML = '';

  if (!selectedWorkerId) {
    alertArea.innerHTML = `<div class="alert alert-danger">Please select the team member who served you.</div>`;
    document.querySelector('.review-step').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (!selectedReviewType) {
    alertArea.innerHTML = `<div class="alert alert-danger">Please select Good or Bad to rate your experience.</div>`;
    return;
  }

  const description = document.getElementById('review-description').value.trim();
  const submitBtn   = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';

  try {
    const res = await fetch(`${API_BASE}/public/store/${qrSlug}/reviews`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        worker_id  : selectedWorkerId,
        rating     : selectedRating || (selectedReviewType === 'good' ? 5 : 1),
        review_type: selectedReviewType,
        description: description || null
      })
    });

    const data = await res.json();
    if (!res.ok) {
      alertArea.innerHTML = `<div class="alert alert-danger">${escapeHtml(data.error || 'Failed to submit.')}</div>`;
      return;
    }

    document.getElementById('main-page').style.display   = 'none';
    document.getElementById('success-page').classList.remove('hidden');
    document.getElementById('success-page').style.display = 'flex';
  } catch (err) {
    alertArea.innerHTML = `<div class="alert alert-danger">Connection error. Please try again.</div>`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Submit Review';
  }
}

// ── Error screen helper ───────────────────────────────────
function showError(icon, title, message) {
  document.getElementById('loading-screen').style.display = 'none';
  const screen = document.getElementById('error-screen');
  screen.classList.remove('hidden');
  screen.style.display = 'flex';
  document.getElementById('error-icon').textContent = icon;
  document.getElementById('error-title').textContent = title;
  document.getElementById('error-msg').textContent   = message;
}

function openImageModal(imageUrl, workerName) {
    document.getElementById('modalImage').src = imageUrl;
    document.getElementById('modalWorkerName').textContent = workerName;
    document.getElementById('imageModal').style.display = 'flex';
}

function closeImageModal() {
    document.getElementById('imageModal').style.display = 'none';
}

init();
