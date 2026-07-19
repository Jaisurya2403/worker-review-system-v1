// ============================================================
// js/store.js  –  Store owner dashboard
// ============================================================

let storeToken     = localStorage.getItem('storeToken');
window.addEventListener("pageshow", function () {

    const token = localStorage.getItem("storeToken");

    if (!token) {
        window.location.replace("store-login.html");
    }

});
let pieChartInst   = null;
let lineChartInst  = null;
let editingWorkerId = null;

let confirmCallback = null;

function openConfirmModal(title, message, callback) {

    document.getElementById("confirm-title").innerHTML = title;

    document.getElementById("confirm-message").innerHTML =
        `<div style="line-height:1.6">${message}</div>`;

    confirmCallback = callback;

    document
      .getElementById("confirm-modal")
      .classList.remove("hidden");
}

function executeConfirmAction() {

    if (confirmCallback) {
        confirmCallback();
    }

    closeModal("confirm-modal");
}

if (!storeToken) window.location.href = 'store-login.html';

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${storeToken}` };
}

function handleAuthError(res) {
  if (res.status === 401 || res.status === 403) {
    const data = res.clone().json().catch(() => ({}));
    // Only redirect if it's a real auth error, not subscription
    if (res.status === 401) { localStorage.clear(); window.location.href = 'store-login.html'; return true; }
  }
  return false;
}

function logout() {
    localStorage.removeItem("storeToken");
    localStorage.removeItem("storeName");
    localStorage.removeItem("storeUsername");

    window.location.replace("store-login.html");
}

// ── Tab navigation ────────────────────────────────────────
function showTab(name, linkEl) {
  ['overview','workers','reviews','qr','analytics'].forEach(t =>
    document.getElementById(`tab-${t}`).classList.add('hidden')
  );
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.remove('hidden');
  if (linkEl) linkEl.classList.add('active');

  if (name === 'workers') loadWorkers();
  if (name === 'reviews') { loadWorkers(true); loadReviews(); }
  if (name === 'qr')      loadQRCode();
  if (name === 'analytics') loadAnalytics();   
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  document.getElementById('username-display').textContent = localStorage.getItem('storeUsername') || '';
  document.getElementById('store-name-nav').textContent   = localStorage.getItem('storeName') || 'My Store';
  await loadDashboard();
  await loadUnreadCount();              // ← ADD THIS

  // Refresh unread count every 60 seconds
  setInterval(loadUnreadCount, 60000); // ← ADD THIS
}

// ── Dashboard ─────────────────────────────────────────────
async function loadDashboard() {
  try {
    const res  = await fetch(`${API_BASE}/store/dashboard`, { headers: authHeaders() });

    if (res.status === 401) { localStorage.clear(); window.location.href = 'store-login.html'; return; }

    if (res.status === 403) {
      const data = await res.json();
      if (data.error === 'subscription_expired') { showSubscriptionExpired(data.message); return; }
    }

    const data = await res.json();

    document.getElementById('stat-total').textContent = data.stats.total_reviews || 0;
    document.getElementById('stat-good').textContent  = data.stats.good_reviews   || 0;
    document.getElementById('stat-bad').textContent   = data.stats.bad_reviews    || 0;
    document.getElementById('stat-avg').textContent   = data.stats.avg_rating      || '—';
    document.getElementById('stat-today').textContent = data.stats.today_reviews || 0;

    if (data.best_worker && data.best_worker.total_reviews > 0) {
      document.getElementById('best-worker-content').innerHTML = workerMiniCard(data.best_worker, 'success');
    }
    if (data.worker_needs_improvement && data.worker_needs_improvement.bad_reviews > 0) {
      document.getElementById('improve-worker-content').innerHTML = workerMiniCard(data.worker_needs_improvement, 'danger');
    }

    renderPieChart(data.stats.good_reviews || 0, data.stats.bad_reviews || 0);
    renderLineChart(data.monthly_trend || []);
  
    // Show subscription warning if expiring soon
if (data.store.subscription_end) {
  const daysLeft = data.store.days_remaining;
  const endDate  = new Date(data.store.subscription_end).toLocaleDateString('en-IN');

 if (daysLeft <= 0) {
  document.getElementById('alert-area').innerHTML = `
    <div class="alert alert-danger subscription-alert">
      <div>
        <i class="bi bi-x-octagon-fill"></i> <strong>Subscription Expired</strong>
        Your subscription expired on <strong>${endDate}</strong>.
        Please contact the admin to renew.
      </div>

      <button class="alert-close"
              onclick="closeSubscriptionAlert()">
        ✕
      </button>
    </div>`;
}
else if (daysLeft <= 7) {
  document.getElementById('alert-area').innerHTML = `
    <div class="alert alert-warning subscription-alert">
      <div>
        <i class="bi bi-exclamation-triangle-fill"></i> <strong>Subscription Expiring Soon!</strong>
        Your subscription ends on <strong>${endDate}</strong>
        (${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining).
        Please contact the admin to renew.
      </div>

      <button class="alert-close"
              onclick="closeSubscriptionAlert()">
        ✕
      </button>
    </div>`;
}


}
  
  } catch (err) {
    console.error('Dashboard error:', err);
    showAlert('alert-area', 'Failed to load dashboard.', 'danger');
  }


}

function workerMiniCard(worker, type) {
  const colors = { success: 'var(--success-light)', danger: 'var(--danger-light)' };
  const imgHtml = workerAvatarHtml(worker.image_path, worker.worker_name, '', '44px');
  return `<div style="display:flex;align-items:center;gap:12px;">
    <div style="width:44px;height:44px;border-radius:50%;background:${colors[type]};display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">
      ${imgHtml}
    </div>
    <div>
      <div style="font-weight:700;">${escapeHtml(worker.worker_name)}</div>
      <div style="font-size:.8rem;color:var(--gray-500);">
        ${type === 'success' ? (worker.good_reviews||0)+' good' : (worker.bad_reviews||0)+' bad'} reviews
      </div>
    </div>
  </div>`;
}

function showSubscriptionExpired(msg) {
  document.querySelector('.dashboard-layout').innerHTML = `
    <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:40px;">
      <div class="auth-card" style="text-align:center;max-width:480px;">
        <div style="font-size:3.5rem;margin-bottom:16px;"><i class="bi bi-exclamation-triangle-fill"></i></div>
        <h2 style="font-size:1.4rem;font-weight:800;margin-bottom:10px;">Subscription Expired</h2>
        <p style="color:var(--gray-500);font-size:.95rem;">${escapeHtml(msg || 'Your subscription has expired. Please contact the application admin.')}</p>
        <button class="btn btn-outline mt-3" onclick="logout()">Sign Out</button>
      </div>
    </div>`;
}

// ── Charts ────────────────────────────────────────────────
function renderPieChart(good, bad) {
  const ctx = document.getElementById('pieChart').getContext('2d');
  if (pieChartInst) pieChartInst.destroy();
  if (good === 0 && bad === 0) {
    ctx.canvas.parentElement.innerHTML = '<p style="text-align:center;padding:60px;color:var(--gray-400);">No reviews yet</p>';
    return;
  }
  pieChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['Good','Bad'], datasets: [{ data: [good,bad], backgroundColor: ['#22C55E','#EF4444'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

function renderLineChart(trend) {
  const ctx = document.getElementById('lineChart').getContext('2d');
  if (lineChartInst) lineChartInst.destroy();
  if (!trend || trend.length === 0) {
    ctx.canvas.parentElement.innerHTML = '<p style="text-align:center;padding:60px;color:var(--gray-400);">No monthly data yet</p>';
    return;
  }
  lineChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map(t => t.month),
      datasets: [
        { label: 'Good', data: trend.map(t => t.good), borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,.08)', tension: 0.4, fill: true },
        { label: 'Bad',  data: trend.map(t => t.bad),  borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,.08)',  tension: 0.4, fill: true }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
  });
}

// ── Workers ───────────────────────────────────────────────
let workersCache = [];

async function loadWorkers(forFilter = false) {
  try {
    const res  = await fetch(`${API_BASE}/store/workers`, { headers: authHeaders() });
    if (res.status === 401) { localStorage.clear(); window.location.href = 'store-login.html'; return; }
    const data = await res.json();
    workersCache = data.workers || [];

    if (forFilter) {
      // Only update the filter dropdown
      const sel = document.getElementById('filter-worker');
      sel.innerHTML = '<option value="">All Workers</option>';
      workersCache.forEach(w => { sel.innerHTML += `<option value="${w.id}">${escapeHtml(w.worker_name)}</option>`; });
      return;
    }

    const container = document.getElementById('workers-list');
    if (!workersCache.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="bi bi-person-check-fill"></i></div><p>No workers yet. Add your first team member!</p></div>`;
      return;
    }

    const rows = workersCache.map(w => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:38px;height:38px;border-radius:50%;overflow:hidden;flex-shrink:0;">

<img 
  src="${getImageUrl(w.image_path)}"
  alt="${escapeHtml(w.worker_name)}"
  style="width:38px;height:38px;border-radius:50%;object-fit:cover;cursor:pointer;"
  onclick="openImageModal('${getImageUrl(w.image_path)}')"
/>

            </div>
            <span style="font-weight:600;">${escapeHtml(w.worker_name)}</span>
          </div>
        </td>
        <td>${escapeHtml(w.role || '—')}</td>
        <td><span class="badge badge-${w.status === 'active' ? 'success' : 'gray'}">${w.status}</span></td>
        <td>${new Date(w.created_at).toLocaleDateString()}</td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-outline btn-sm" onclick="openEditWorkerModal(${w.id})"><i class="bi bi-pencil-fill"></i> Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deactivateWorker(${w.id},'${escapeHtml(w.worker_name)}')"><i class="bi bi-trash3-fill"></i></button>
          </div>
        </td>
      </tr>`).join('');

    container.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Worker</th><th>Role</th><th>Status</th><th>Added</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } catch (err) { 
    if (!forFilter) document.getElementById('workers-list').innerHTML = `<div class="alert alert-danger">Failed to load workers.</div>`;
  }
}

function openAddWorkerModal() {
  editingWorkerId = null;
  document.getElementById('modal-title-text').textContent = 'Add Worker';
  document.getElementById('worker-form').reset();
  document.getElementById('image-preview-img').style.display = 'none';
  document.getElementById('upload-placeholder').style.display = 'flex';
  document.getElementById('status-group').style.display = 'none';
  document.getElementById('modal-alert').innerHTML = '';
  document.getElementById('edit-worker-id').value = '';
  document.getElementById('worker-modal').classList.remove('hidden');
}

function openEditWorkerModal(id) {
  const w = workersCache.find(x => x.id === id);
  if (!w) return;
  editingWorkerId = id;
  document.getElementById('modal-title-text').textContent = 'Edit Worker';
  document.getElementById('edit-worker-id').value = id;
  document.getElementById('worker-name').value   = w.worker_name;
  document.getElementById('worker-role').value   = w.role || '';
  document.getElementById('worker-status').value = w.status;
  document.getElementById('status-group').style.display = 'block';
  document.getElementById('modal-alert').innerHTML = '';

  // Show existing image preview
  const imgUrl = getImageUrl(w.image_path);
  if (imgUrl) {
    const preview = document.getElementById('image-preview-img');
    preview.src = imgUrl;
    preview.style.display = 'block';
    document.getElementById('upload-placeholder').style.display = 'none';
  } else {
    document.getElementById('image-preview-img').style.display = 'none';
    document.getElementById('upload-placeholder').style.display = 'flex';
  }

  document.getElementById('worker-modal').classList.remove('hidden');
}

function previewImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = document.getElementById('image-preview-img');
    img.src = ev.target.result;
    img.style.display = 'block';
    document.getElementById('upload-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function saveWorker(e) {
  e.preventDefault();
  const alertEl = document.getElementById('modal-alert');
  const btn     = document.getElementById('save-worker-btn');
  alertEl.innerHTML = '';

  const name      = document.getElementById('worker-name').value.trim();
  const role      = document.getElementById('worker-role').value.trim();
  const status    = document.getElementById('worker-status').value;
  const imageFile = document.getElementById('worker-image').files[0];

  if (!name) { alertEl.innerHTML = `<div class="alert alert-danger">Worker name is required.</div>`; return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving...';

  try {
    const formData = new FormData();
    formData.append('worker_name', name);
    formData.append('role', role);
    if (status) formData.append('status', status);
    if (imageFile) formData.append('image', imageFile);

    const isEdit = !!editingWorkerId;
    const url    = isEdit ? `${API_BASE}/store/workers/${editingWorkerId}` : `${API_BASE}/store/workers`;
    const method = isEdit ? 'PUT' : 'POST';

    const res  = await fetch(url, { method, headers: { 'Authorization': `Bearer ${storeToken}` }, body: formData });
    const data = await res.json();

    if (!res.ok) { alertEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(data.error || 'Failed to save.')}</div>`; return; }

    closeModal('worker-modal');
    showAlert('alert-area', isEdit ? 'Worker updated successfully!' : 'Worker added successfully!', 'success');
    loadWorkers();
  } catch {
    alertEl.innerHTML = `<div class="alert alert-danger">Connection error. Please try again.</div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Save Worker';
  }
}

async function deactivateWorker(id, name) {

  openConfirmModal(
    "Delete Worker",
    `Are you sure you want to permanently delete <strong>${name}</strong>?<br><br>
     This action cannot be undone.`,
    async () => {

      try {

        const res = await fetch(`${API_BASE}/store/workers/${id}`, {
          method: 'DELETE',
          headers: authHeaders()
        });

        const data = await res.json();

        if (!res.ok) {
          showAlert(
            'alert-area',
            data.error || 'Failed to delete worker.',
            'danger'
          );
          return;
        }

        showAlert(
          'alert-area',
          'Worker deleted successfully.',
          'success'
        );

        loadWorkers();

      } catch (err) {

        showAlert(
          'alert-area',
          'Connection error while deleting worker.',
          'danger'
        );

      }

    }
  );
}

// ── Reviews ───────────────────────────────────────────────
async function loadReviews(page = 1) {
  const container = document.getElementById('reviews-list');
  container.innerHTML = `<div class="loading-state"><div class="spinner spinner-dark"></div><p>Loading reviews...</p></div>`;

  const params = new URLSearchParams({ page, limit: 15 });
  const wId = document.getElementById('filter-worker').value;
  const rt  = document.getElementById('filter-type').value;
  const rg  = document.getElementById('filter-rating').value;
  const df  = document.getElementById('filter-from').value;
  const dt  = document.getElementById('filter-to').value;
  if (wId) params.append('worker_id',   wId);
  if (rt)  params.append('review_type', rt);
  if (rg)  params.append('rating',      rg);
  if (df)  params.append('date_from',   df);
  if (dt)  params.append('date_to',     dt);

  try {
    const res  = await fetch(`${API_BASE}/store/reviews?${params}`, { headers: authHeaders() });
    const data = await res.json();

    if (!data.reviews || data.reviews.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon"> <i class="bi bi-chat-left-text-fill"></i></div><p>No reviews match your filters.</p></div>`;
      document.getElementById('reviews-pagination').innerHTML = '';
      return;
    }

    container.innerHTML = data.reviews.map(r => `
      <div class="review-item">
        <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--primary-light);display:flex;align-items:center;justify-content:center;">
          ${workerAvatarHtml(r.image_path, r.worker_name, '', '40px')}
        </div>
        <div class="review-body">
          <div class="review-name">${escapeHtml(r.worker_name)} <span style="font-weight:400;color:var(--gray-500);font-size:.82rem;">${escapeHtml(r.role||'')}</span></div>
          <div class="review-meta">
            <span class="badge badge-${r.review_type==='good'?'success':'danger'}">${r.review_type==='good'?'<i class="bi bi-hand-thumbs-up-fill"></i> Good':'<i class="bi bi-hand-thumbs-down-fill"></i> Bad'}</span>
            <span class="stars-display" style="margin-left:8px;">${starsHtml(r.rating)}</span>
            <span style="margin-left:8px;">${new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          ${r.description ? `<div class="review-desc">"${escapeHtml(r.description)}"</div>` : ''}
        </div>
      </div>`).join('');

    const pag = document.getElementById('reviews-pagination');
    if (data.pages > 1) {
      pag.innerHTML = Array.from({length:data.pages},(_,i)=>
        `<button class="btn ${i+1===page?'btn-primary':'btn-outline'} btn-sm" style="margin:2px;" onclick="loadReviews(${i+1})">${i+1}</button>`
      ).join('');
    } else pag.innerHTML = '';
  } catch { container.innerHTML = `<div class="alert alert-danger">Failed to load reviews.</div>`; }
}

function clearFilters() {
  ['filter-worker','filter-type','filter-rating'].forEach(id => document.getElementById(id).value = '');
  ['filter-from','filter-to'].forEach(id => document.getElementById(id).value = '');
  loadReviews();
}

// ── QR Code ───────────────────────────────────────────────
async function loadQRCode() {
  try {
    const res  = await fetch(`${API_BASE}/store/dashboard`, { headers: authHeaders() });
    const data = await res.json();
    const store = data.store;
    const reviewUrl = `${window.location.origin}/customer-review.html?store=${store.qr_slug}`;

    const qrDisplay = document.getElementById('qr-display');
    if (store.qr_code_path) {
      const qrImgUrl = `${IMG_BASE}/${store.qr_code_path}`;
      qrDisplay.innerHTML = `<img src="${qrImgUrl}" alt="QR Code" style="width:200px;height:200px;border:6px solid white;box-shadow:var(--shadow);border-radius:var(--radius);" onerror="this.parentElement.innerHTML='<p style=color:var(--gray-500)>QR image not found on server.</p>'" />`;
    } else {
      qrDisplay.innerHTML = `<p style="color:var(--gray-500);">QR code not generated yet.</p>`;
    }

    document.getElementById('qr-url-display').innerHTML = `
      <p style="font-size:.82rem;color:var(--gray-500);word-break:break-all;">
        Customer Review URL:<br/>
        <a href="${reviewUrl}" target="_blank" style="color:var(--primary);">${reviewUrl}</a>
      </p>`;
  } catch { document.getElementById('qr-display').innerHTML = `<p style="color:var(--danger);">Failed to load QR code.</p>`; }
}

function printQR() {
  const qrImg = document.querySelector('#qr-display img');
  if (!qrImg) { alert('No QR code to print.'); return; }
  const w = window.open('');
  w.document.write(`<html><body style="text-align:center;padding:40px;font-family:sans-serif;">
    <h2>${escapeHtml(localStorage.getItem('storeName')||'')}</h2>
    <p style="color:#666;">Scan to leave a review</p>
    <img src="${qrImg.src}" style="width:250px;height:250px;" />
    <p style="font-size:.8rem;color:#999;margin-top:12px;">Thank you for your feedback!</p>
  </body></html>`);
  w.document.close(); w.print();
}

// ── Modal helpers ─────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeModalOutside(e, id) { if (e.target===document.getElementById(id)) closeModal(id); }


// Image Preview Modal
function openImageModal(imageUrl) {
  let modal = document.getElementById("image-view-modal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "image-view-modal";

    modal.innerHTML = `
      <div class="image-modal-overlay" onclick="closeImageModal()">
        <img id="image-modal-img" class="image-modal-img">
        <span class="image-modal-close">&times;</span>
      </div>
    `;

    document.body.appendChild(modal);
  }

  document.getElementById("image-modal-img").src = imageUrl;
  modal.style.display = "flex";
}

function closeImageModal() {
  const modal = document.getElementById("image-view-modal");
  if (modal) modal.style.display = "none";
}

// ── Notifications (Store Side) ────────────────────────────
let notifPanelOpen = false;

async function loadUnreadCount() {
  try {
    const res  = await fetch(`${API_BASE}/notifications/store/unread-count`, {
      headers: authHeaders()
    });
        console.log("Unread API status:", res.status);
    const data = await res.json();
    console.log("Unread API data:", data);

    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    if (data.count > 0) {
      badge.textContent    = data.count > 99 ? '99+' : data.count;
      badge.style.display  = 'flex';           // ← force show
      badge.classList.remove('hidden');
    } else {
      badge.style.display  = 'none';           // ← force hide
      badge.classList.add('hidden');
    }
  } catch (err) {
    console.warn('Could not load unread count:', err.message);
  }
}

async function toggleNotifPanel() {
  notifPanelOpen = !notifPanelOpen;

  const panel = document.getElementById('notif-panel');
  const overlay = document.getElementById('notif-overlay');

  if (notifPanelOpen) {
    panel.style.display = 'flex';
    overlay.style.display = 'block';

    await loadNotifications();
  } else {
    panel.style.display = 'none';
    overlay.style.display = 'none';
  }
}

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  list.innerHTML = `
    <div style="text-align:center;padding:40px;color:rgba(255,255,255,.3);">
      <div class="spinner" style="width:28px;height:28px;margin:0 auto 10px;
        border:2.5px solid rgba(255,255,255,.15);border-top-color:#A78BFA;
        border-radius:50%;animation:spin .7s linear infinite;"></div>
      <p style="font-size:.85rem;">Loading...</p>
    </div>`;

  try {
    const res  = await fetch(`${API_BASE}/notifications/store/my`, { headers: authHeaders() });
    const data = await res.json();

    if (!data.notifications || !data.notifications.length) {
      list.innerHTML = `
        <div style="text-align:center;padding:48px 20px;color:rgba(255,255,255,.3);">
          <div style="font-size:2.5rem;margin-bottom:10px;"><i class="bi bi-bell"></i></div>
          <p style="font-size:.9rem;">No notifications yet</p>
          <p style="font-size:.78rem;margin-top:4px;color:rgba(255,255,255,.2);">
            Messages from admin will appear here
          </p>
        </div>`;
      document.getElementById('notif-unread-text').textContent = 'All caught up!';
      return;
    }

    const unread = data.notifications.filter(n => !n.is_read).length;
    document.getElementById('notif-unread-text').textContent =
      unread > 0 ? `${unread} unread` : 'All caught up!';

    const typeIcon = {
  admin_message        : '<i class="bi bi-megaphone-fill"></i>',
  subscription_warning : '<i class="bi bi-exclamation-triangle-fill"></i>',
  subscription_expired : '<i class="bi bi-x-octagon-fill"></i>',
  system               : '<i class="bi bi-gear-fill"></i>'
};

    // Border color per type
    const typeBorder = {
      admin_message        : '#6C47FF',
      subscription_warning : '#F59E0B',
      subscription_expired : '#EF4444',
      system               : '#64748B'
    };

    list.innerHTML = data.notifications.map(n => `
      <div id="notif-item-${n.id}"
        onclick="markOneRead(${n.id}, this)"
        style="padding:14px 20px;
               border-bottom:1px solid rgba(255,255,255,.06);
               cursor:pointer;
               border-left:3px solid ${n.is_read ? 'transparent' : (typeBorder[n.type] || '#6C47FF')};
               background:${n.is_read ? 'transparent' : 'rgba(108,71,255,.08)'};
               transition:background .2s;">

        <div style="display:flex;gap:12px;align-items:flex-start;">
          <!-- Icon -->
          <div style="font-size:1.3rem;flex-shrink:0;margin-top:2px;">
            ${typeIcon[n.type] || '<i class="bi bi-megaphone-fill"></i>'}
          </div>

          <div style="flex:1;min-width:0;">
            <!-- Title row -->
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
              <div style="font-weight:${n.is_read ? '500' : '700'};
                          font-size:.88rem;
                          color:${n.is_read ? 'rgba(255,255,255,.6)' : '#fff'};
                          line-height:1.3;">
                ${escapeHtml(n.title)}
              </div>
              ${!n.is_read
                ? `<div style="width:7px;height:7px;border-radius:50%;
                               background:#A78BFA;flex-shrink:0;margin-top:4px;"></div>`
                : ''}
            </div>

            <!-- Meta -->
            <div style="font-size:.75rem;color:rgba(255,255,255,.35);margin:4px 0 6px;">
              ${timeAgo(n.created_at)} · ${escapeHtml(n.sent_by)}
            </div>

            <!-- Message -->
            <div style="font-size:.83rem;
                        color:${n.is_read ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.75)'};
                        line-height:1.55;">
              ${escapeHtml(n.message)}
            </div>
          </div>
        </div>
      </div>`).join('');

    loadUnreadCount();

  } catch {
    list.innerHTML = `
      <div style="padding:20px;">
        <div style="background:rgba(239,68,68,.15);border-left:3px solid #EF4444;
                    padding:12px 16px;border-radius:8px;color:#FCA5A5;font-size:.875rem;">
          Failed to load notifications.
        </div>
      </div>`;
  }
}

async function markOneRead(id, el) {
  try {
    await fetch(`${API_BASE}/notifications/store/${id}/read`, {
      method : 'PUT',
      headers: authHeaders()
    });
    // Change background to white (read style)
    el.style.background = 'white';
    const dot = el.querySelector('[style*="border-radius:50%"]');
    if (dot) dot.remove();
    const title = el.querySelector('[style*="font-weight"]');
    if (title) title.style.fontWeight = '600';

    loadUnreadCount();
  } catch {}
}

async function markAllRead() {
  try {
    await fetch(`${API_BASE}/notifications/store/read-all`, {
      method : 'PUT',
      headers: authHeaders()
    });
    await loadNotifications();
    loadUnreadCount();
  } catch {}
}


function closeSubscriptionAlert() {
  document.getElementById('alert-area').innerHTML = '';
}

// ── Helper: time ago ──────────────────────────────────────
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}






// ── ADVANCED ANALYTICS ────────────────────────────────────
let analyticsData    = null;
let trendChartInst   = null;
let satisfChartInst  = null;
let compareChartInst = null;

async function loadAnalytics() {
  document.getElementById('analytics-loading').style.display = 'block';
  document.getElementById('analytics-content').classList.add('hidden');

  try {
    const res  = await fetch(`${API_BASE}/store/analytics`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed');
    analyticsData = await res.json();
    console.log('daily_trend:', JSON.stringify(analyticsData.daily_trend, null, 2));
    renderKPICards();
    renderLeaderboard();
    renderWorkerMatrix();
    renderTrendChart('daily');
    renderRatingDist();
    renderSatisfactionChart();
    renderWorkerCompareChart();
    renderHeatmaps();
    renderAIInsights();
    renderForecast();
    renderSummary();

    document.getElementById('analytics-loading').style.display = 'none';
    document.getElementById('analytics-content').classList.remove('hidden');
  } catch (err) {
    document.getElementById('analytics-loading').innerHTML =
      `<div class="alert alert-danger">Failed to load analytics. Make sure backend is running.</div>`;
  }
}

// ── KPI Cards ─────────────────────────────────────────────
function renderKPICards() {
  const d  = analyticsData;
  const tm = d.this_month  || {};
  const lm = d.last_month  || {};

  // const totalReviews = parseInt(tm.count || 0) + parseInt(lm.count || 0) || 
  //                    d.daily_trend.reduce((s,r) => s + parseInt(r.total||0), 0);
// WITH this:
const totalReviews = parseInt(d.all_time?.total_all_time || tm.count || 0);
const now = new Date();
const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
// After building todayStr, add:
console.log('Looking for today:', todayStr);
console.log('All days in trend:', d.daily_trend.map(r => r.day));
const todayRow = d.daily_trend.find(r => {
  if (!r.day) return false;
  // r.day may come as "2026-07-12T00:00:00.000Z" or "2026-07-12"
  const dayStr = typeof r.day === 'string' ? r.day.substring(0, 10) : new Date(r.day).toISOString().substring(0, 10);
  return dayStr === todayStr;
});
const todayReviews = todayRow ? parseInt(todayRow.total) : 0;
  const thisGood      = parseInt(tm.good || 0);
  const thisTotal     = parseInt(tm.count || 0);
  const lastTotal     = parseInt(lm.count || 0);
  const positiveRate  = thisTotal > 0 ? Math.round(thisGood / thisTotal * 100) : 0;
  const negativeRate  = 100 - positiveRate;
  const avgRating     = parseFloat(tm.avg_rating || 0);
  const csat          = avgRating > 0 ? Math.round((avgRating / 5) * 100) : 0;
  
let growthRate = 0;
let growthLabel = 'vs last month';
if (lastTotal > 0) {
  growthRate = Math.round((thisTotal - lastTotal) / lastTotal * 100);
} else if (thisTotal > 0) {
  growthRate = 100;  // 100% growth from zero
  growthLabel = 'new this month';
}

  const activeWorkers = d.worker_perf.length;
  const lastMonthGood = parseInt(lm.good || 0);
  const lastTotal2    = parseInt(lm.count || 0);
  const lastPosPct    = lastTotal2 > 0 ? Math.round(lastMonthGood / lastTotal2 * 100) : 0;
  const satChange     = positiveRate - lastPosPct;

  const kpis = [
    { label:'Total Reviews',           value: totalReviews, change: growthRate, color:'kpi-blue',   icon:'bi-chat-left-text-fill' },
    { label:"Today's Reviews",         value: todayReviews, change: null,       color:'kpi-cyan',   icon:'bi-calendar-day' },
    { label:'Positive Rate',           value: positiveRate+'%', change: satChange, color:'kpi-green', icon:'bi-hand-thumbs-up-fill' },
    { label:'Negative Rate',           value: negativeRate+'%', change: -satChange, color:'kpi-red', icon:'bi-hand-thumbs-down-fill' },
    { label:'Avg Rating',              value: avgRating||'—', change: null,      color:'kpi-yellow', icon:'bi-star-fill' },
    { label:'CSAT Score',              value: csat+'%',     change: satChange,  color:'kpi-purple', icon:'bi-emoji-smile-fill' },
{ label:'Growth Rate', value: growthRate+'%', change: null, color:'kpi-blue', icon:'bi-graph-up-arrow' },    { label:'Active Workers',value: activeWorkers, change: null,      color:'kpi-cyan',   icon:'bi-people-fill' },
    { label:'This Month Reviews',      value: thisTotal,    change: growthRate, color:'kpi-green',  icon:'bi-calendar-month' },
    { label:'Last Month Reviews',      value: lastTotal,    change: null,       color:'kpi-yellow', icon:'bi-calendar2' },
  ];

  document.getElementById('kpi-grid').innerHTML = kpis.map(k => {

// REPLACE the changeHtml block:
let changeHtml = '';
if (k.change !== null) {
  const dir   = k.change > 0 ? 'up' : k.change < 0 ? 'down' : 'neutral';
  const arrow = k.change > 0 ? '▲'  : k.change < 0 ? '▼'   : '—';
  changeHtml  = `<div class="kpi-change ${dir}">${arrow} ${Math.abs(k.change)}% vs last month</div>`;
} else if (k.noData) {
  changeHtml = `<div class="kpi-change neutral">— no prior data</div>`;
}

    return `
      <div class="kpi-card ${k.color}">
        <div class="kpi-label"><i class="bi ${k.icon}"></i> ${k.label}</div>
        <div class="kpi-value">${k.value}</div>
        ${changeHtml}
      </div>`;
  }).join('');
}

// ── Leaderboard ───────────────────────────────────────────
function renderLeaderboard() {
  const workers = analyticsData.worker_perf;
  if (!workers.length) {
    document.getElementById('leaderboard-content').innerHTML =
      `<p style="color:rgba(255,255,255,.3);font-size:.85rem;padding:12px 0;">No workers yet.</p>`;
    return;
  }

  const maxScore = Math.max(...workers.map(w => parseFloat(w.performance_score || 0)));

  document.getElementById('leaderboard-content').innerHTML = workers.slice(0,6).map((w, i) => {
    const score  = parseFloat(w.performance_score || 0);
    const pct    = maxScore > 0 ? Math.round(score / maxScore * 100) : 0;
    const rankClass = i===0?'rank-1':i===1?'rank-2':i===2?'rank-3':'rank-n';
    const medal  = i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;

    return `
      <div class="leader-row">
        <div class="leader-rank ${rankClass}">${i < 3 ? medal : i+1}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:.875rem;color:#fff;">${escapeHtml(w.worker_name)}</div>
          <div style="font-size:.72rem;color:#71717a;">${w.total_reviews} reviews · ⭐${w.avg_rating||'—'}</div>
          <div class="perf-score-bar">
            <div class="perf-score-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div style="font-size:.82rem;font-weight:700;color:#a78bfa;min-width:36px;text-align:right;">
          ${score.toFixed(0)}
        </div>
      </div>`;
  }).join('');
}

// ── Worker Matrix ─────────────────────────────────────────
function renderWorkerMatrix() {
  const workers = analyticsData.worker_perf;
  if (!workers.length) {
    document.getElementById('worker-matrix-content').innerHTML =
      `<p style="color:rgba(255,255,255,.3);font-size:.85rem;padding:12px;">No workers yet.</p>`;
    return;
  }

  function getHealth(w) {
    const pos = w.total_reviews > 0 ? w.good_reviews / w.total_reviews * 100 : 0;
    const rating = parseFloat(w.avg_rating || 0);
    if (pos >= 80 && rating >= 4)   return ['Excellent','health-excellent'];
    if (pos >= 60 && rating >= 3)   return ['Good','health-good'];
    if (pos >= 40)                  return ['Needs Attention','health-attention'];
    return ['Critical','health-critical'];
  }

  const rows = workers.map(w => {
    const pos = w.total_reviews > 0 ? Math.round(w.good_reviews / w.total_reviews * 100) : 0;
    const [health, cls] = getHealth(w);
    return `<tr>
      <td style="font-weight:600;color:#fff;">${escapeHtml(w.worker_name)}</td>
      <td style="text-align:center;">${w.total_reviews}</td>
      <td style="text-align:center;color:#22c55e;">${w.good_reviews}</td>
      <td style="text-align:center;color:#ef4444;">${w.bad_reviews}</td>
      <td style="text-align:center;">${pos}%</td>
      <td style="text-align:center;">⭐${w.avg_rating||'—'}</td>
      <td style="text-align:center;font-weight:700;color:#a78bfa;">${parseFloat(w.performance_score||0).toFixed(0)}</td>
      <td><span class="${cls}">${health}</span></td>
    </tr>`;
  }).join('');

  document.getElementById('worker-matrix-content').innerHTML = `
    <table style="font-size:.78rem;">
      <thead><tr>
        <th>Worker</th><th>Total</th><th>Good</th><th>Bad</th>
        <th>Pos%</th><th>Rating</th><th>Score</th><th>Health</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Trend Chart ───────────────────────────────────────────
function switchTrend(type) {
  ['daily','weekly'].forEach(t => {
    const btn = document.getElementById(`btn-${t}`);
    if (btn) btn.classList.toggle('btn-primary', t===type);
  });
  renderTrendChart(type);
}

function renderTrendChart(type) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChartInst) trendChartInst.destroy();

  let labels, goodData, badData;

  if (type === 'daily') {
    const rows = analyticsData.daily_trend.slice(-14);
    labels  = rows.map(r => { const d=new Date(r.day); return `${d.getDate()}/${d.getMonth()+1}`; });
    goodData = rows.map(r => r.good);
    badData  = rows.map(r => r.bad);
  } else {
    // Group by week
    const weekly = {};
    analyticsData.daily_trend.forEach(r => {
      const d = new Date(r.day);
      const wk = `W${getWeekNumber(d)}`;
      if (!weekly[wk]) weekly[wk] = {good:0, bad:0};
      weekly[wk].good += parseInt(r.good);
      weekly[wk].bad  += parseInt(r.bad);
    });
    labels   = Object.keys(weekly).slice(-8);
    goodData = labels.map(k => weekly[k].good);
    badData  = labels.map(k => weekly[k].bad);
  }

  trendChartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Good', data:goodData, backgroundColor:'rgba(34,197,94,.7)', borderRadius:4 },
        { label:'Bad',  data:badData,  backgroundColor:'rgba(239,68,68,.7)',  borderRadius:4 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ position:'bottom', labels:{ color:'#a1a1aa' } } },
      scales: {
        x: { grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'#71717a' } },
        y: { beginAtZero:true, grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'#71717a' } }
      }
    }
  });
}

// ── Rating Distribution ───────────────────────────────────
function renderRatingDist() {
  const dist  = analyticsData.rating_dist;
  const total = dist.reduce((s,r) => s + parseInt(r.count), 0);

  if (!total) {
    document.getElementById('rating-dist-content').innerHTML =
      `<p style="color:rgba(255,255,255,.3);font-size:.85rem;padding:12px 0;">No rating data yet.</p>`;
    return;
  }

  const bars = [5,4,3,2,1].map(star => {
    const row = dist.find(r => parseInt(r.rating) === star);
    const cnt = row ? parseInt(row.count) : 0;
    const pct = total > 0 ? Math.round(cnt / total * 100) : 0;
    return `
      <div class="rating-bar-row">
        <span style="color:#f59e0b;min-width:40px;">★ ${star}</span>
        <div class="rating-bar-track">
          <div class="rating-bar-fill" style="width:${pct}%"></div>
        </div>
        <span style="color:#71717a;min-width:28px;text-align:right;">${cnt}</span>
      </div>`;
  }).join('');

  document.getElementById('rating-dist-content').innerHTML = bars;
}

// ── Satisfaction Chart ────────────────────────────────────
function renderSatisfactionChart() {
  const ctx  = document.getElementById('satisfactionChart').getContext('2d');
  if (satisfChartInst) satisfChartInst.destroy();

  const rows  = analyticsData.daily_trend.slice(-14);
  const labels = rows.map(r => { const d=new Date(r.day); return `${d.getDate()}/${d.getMonth()+1}`; });
  const pcts   = rows.map(r => r.total > 0 ? Math.round(r.good / r.total * 100) : 0);

  satisfChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Satisfaction %',
        data: pcts,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,.1)',
        tension: 0.4, fill: true,
        pointBackgroundColor: '#22c55e',
        pointRadius: 3
      }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ display:false } },
      scales: {
        y: { min:0, max:100, ticks:{ color:'#71717a', callback: v=>v+'%' }, grid:{ color:'rgba(255,255,255,.04)' } },
        x: { ticks:{ color:'#71717a' }, grid:{ display:false } }
      }
    }
  });
}

// ── Worker Comparison Chart ───────────────────────────────
function renderWorkerCompareChart() {
  const ctx = document.getElementById('workerCompareChart').getContext('2d');
  if (compareChartInst) compareChartInst.destroy();

  const workers = analyticsData.worker_perf.slice(0,6);
  const labels  = workers.map(w => w.worker_name.split(' ')[0]);

  compareChartInst = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Good Reviews','Bad Reviews','Avg Rating','Total Reviews','Score'],
      datasets: workers.slice(0,3).map((w,i) => {
        const colors = ['rgba(108,71,255,.7)','rgba(34,197,94,.7)','rgba(239,68,68,.7)'];
        const maxG = Math.max(...workers.map(x=>x.good_reviews||0))||1;
        const maxB = Math.max(...workers.map(x=>x.bad_reviews||0))||1;
        const maxT = Math.max(...workers.map(x=>x.total_reviews||0))||1;
        const maxS = Math.max(...workers.map(x=>parseFloat(x.performance_score||0)))||1;
        return {
          label: w.worker_name.split(' ')[0],
          data: [
            Math.round((w.good_reviews||0)/maxG*100),
            Math.round((w.bad_reviews||0)/maxB*100),
            Math.round((parseFloat(w.avg_rating||0)/5)*100),
            Math.round((w.total_reviews||0)/maxT*100),
            Math.round((parseFloat(w.performance_score||0))/maxS*100)
          ],
          backgroundColor: colors[i].replace('.7','.15'),
          borderColor: colors[i],
          pointBackgroundColor: colors[i]
        };
      })
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ position:'bottom', labels:{ color:'#a1a1aa', font:{ size:10 } } } },
      scales: { r: { ticks:{ display:false }, grid:{ color:'rgba(255,255,255,.08)' }, pointLabels:{ color:'#71717a', font:{ size:9 } } } }
    }
  });
}

// ── Heatmaps ──────────────────────────────────────────────
function renderHeatmaps() {
  // Weekday heatmap
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayData = analyticsData.weekday_dist || [];
  const maxDay  = Math.max(...dayData.map(d=>d.count), 1);
  const dayColors = ['rgba(239,68,68,', 'rgba(249,115,22,', 'rgba(234,179,8,', 'rgba(34,197,94,'];

  document.getElementById('weekday-heatmap').innerHTML = days.map(day => {
    const row = dayData.find(d => d.day_name === day);
    const cnt = row ? parseInt(row.count) : 0;
    const pct = Math.round(cnt / maxDay * 100);
    const intensity = pct > 75 ? 0 : pct > 50 ? 1 : pct > 25 ? 2 : 3;
    const color = `${dayColors[intensity]}0.8)`;
    return `
      <div class="heatmap-row">
        <div class="heatmap-label">${day.substring(0,3)}</div>
        <div class="heatmap-bar">
          <div class="heatmap-fill" style="width:${pct}%;background:${color};"></div>
        </div>
        <div class="heatmap-count">${cnt}</div>
      </div>`;
  }).join('');

  // Hourly heatmap
  const hourData = analyticsData.hourly_dist || [];
  const maxHour  = Math.max(...hourData.map(h=>h.count), 1);
  const peakHour = hourData.reduce((a,b) => parseInt(a.count||0)>parseInt(b.count||0)?a:b, {hour:0,count:0});

  const hourGroups = [
    { label:'12am–6am', hours:[0,1,2,3,4,5] },
    { label:'6am–12pm', hours:[6,7,8,9,10,11] },
    { label:'12pm–6pm', hours:[12,13,14,15,16,17] },
    { label:'6pm–12am', hours:[18,19,20,21,22,23] }
  ];

  document.getElementById('hourly-heatmap').innerHTML = hourGroups.map(g => {
    const cnt = g.hours.reduce((s,h) => {
      const row = hourData.find(r => parseInt(r.hour)===h);
      return s + (row ? parseInt(row.count) : 0);
    }, 0);
    const pct = Math.round(cnt / maxHour / g.hours.length * 100);
    return `
      <div class="heatmap-row">
        <div class="heatmap-label">${g.label}</div>
        <div class="heatmap-bar">
          <div class="heatmap-fill" style="width:${Math.min(pct*3,100)}%;background:rgba(168,85,247,0.7);"></div>
        </div>
        <div class="heatmap-count">${cnt}</div>
      </div>`;
  }).join('') + `<p style="font-size:.72rem;color:#71717a;margin-top:8px;">Peak hour: ${peakHour.hour}:00 (${peakHour.count||0} reviews)</p>`;
}

// ── AI Insights ───────────────────────────────────────────
function renderAIInsights() {
  const d       = analyticsData;
  const workers = d.worker_perf;
  const tm      = d.this_month || {};
  const lm      = d.last_month || {};
  const insights = [];

  // Best worker
  if (workers.length > 0) {
    const best = workers[0];
    insights.push({ icon:'🏆', text:`<strong>${escapeHtml(best.worker_name)}</strong> is the top performer with a score of <strong>${parseFloat(best.performance_score||0).toFixed(0)}</strong> and ${best.good_reviews} good reviews.` });
  }

  // Needs attention
  const critical = workers.find(w => {
    const pos = w.total_reviews > 0 ? w.good_reviews/w.total_reviews : 1;
    return pos < 0.4 && w.total_reviews > 2;
  });
  if (critical) {
    insights.push({ icon:'⚠️', text:`<strong>${escapeHtml(critical.worker_name)}</strong> is receiving more negative reviews than average. Consider additional training.` });
  }

  // Growth
  const thisCount = parseInt(tm.count||0);
  const lastCount = parseInt(lm.count||0);
  if (lastCount > 0) {
    const growth = Math.round((thisCount - lastCount)/lastCount*100);
    if (growth > 0) {
      insights.push({ icon:'📈', text:`Review volume <strong>grew by ${growth}%</strong> compared to last month. Customers are more engaged.` });
    } else if (growth < 0) {
      insights.push({ icon:'📉', text:`Review volume <strong>dropped by ${Math.abs(growth)}%</strong> vs last month. Consider placing QR codes in more visible spots.` });
    }
  }

  // Satisfaction
  const thisGood  = parseInt(tm.good||0);
  const lastGood  = parseInt(lm.good||0);
  const thisPos   = thisCount > 0 ? Math.round(thisGood/thisCount*100) : 0;
  const lastPos   = lastCount > 0 ? Math.round(lastGood/lastCount*100) : 0;
  const satChange = thisPos - lastPos;
  if (satChange > 0) {
    insights.push({ icon:'😊', text:`Customer satisfaction <strong>improved by ${satChange}%</strong> compared to last month.` });
  } else if (satChange < 0) {
    insights.push({ icon:'😟', text:`Customer satisfaction <strong>decreased by ${Math.abs(satChange)}%</strong>. Review recent negative feedback for clues.` });
  }

  // Peak day
  const dayData  = d.weekday_dist || [];
  const peakDay  = dayData.reduce((a,b)=>parseInt(a.count||0)>parseInt(b.count||0)?a:b, {day_name:'—',count:0});
  if (peakDay.count > 0) {
    insights.push({ icon:'📅', text:`<strong>${peakDay.day_name}</strong> is your busiest day with ${peakDay.count} reviews. Ensure full staffing on this day.` });
  }

  // Rating trend
  const avgRating = parseFloat(tm.avg_rating||0);
  if (avgRating >= 4.5) {
    insights.push({ icon:'⭐', text:`Excellent average rating of <strong>${avgRating}</strong>! Your team is delivering outstanding service.` });
  } else if (avgRating > 0 && avgRating < 3) {
    insights.push({ icon:'🔴', text:`Average rating of <strong>${avgRating}</strong> needs improvement. Focus on service quality training.` });
  }

  if (!insights.length) {
    insights.push({ icon:'ℹ️', text:'Not enough data yet to generate insights. Insights will appear as reviews come in.' });
  }

  document.getElementById('ai-insights-content').innerHTML = insights.map(i =>
    `<div class="insight-item">
      <div class="insight-icon">${i.icon}</div>
      <div class="insight-text">${i.text}</div>
    </div>`
  ).join('');
}

// ── Forecast ──────────────────────────────────────────────
function renderForecast() {
  const tm = analyticsData.this_month || {};
  const lm = analyticsData.last_month || {};
  const daily = analyticsData.daily_trend || [];

  // Simple linear regression for reviews
  const n = daily.length;
  let sumX=0, sumY=0, sumXY=0, sumX2=0;
  daily.forEach((r,i) => {
    sumX  += i; sumY  += parseInt(r.total);
    sumXY += i * parseInt(r.total); sumX2 += i*i;
  });
  const slope     = n > 1 ? (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX) : 0;
  const intercept = n > 0 ? (sumY - slope*sumX) / n : 0;
  const nextMonthDays = 30;
  const nextX     = n + nextMonthDays/2;
  const predicted = Math.max(0, Math.round((intercept + slope*nextX) * nextMonthDays));

  const confidence = Math.min(95, Math.max(50, 70 + (n > 20 ? 15 : n > 10 ? 5 : 0)));

  const thisCount  = parseInt(tm.count||0);
  const lastCount  = parseInt(lm.count||0);
  const growth     = lastCount > 0 ? (thisCount-lastCount)/lastCount : 0;
  const predictedRating = Math.min(5, Math.max(1, parseFloat(tm.avg_rating||3) + (growth*0.1))).toFixed(1);
  const thisGood   = parseInt(tm.good||0);
  const posPct     = thisCount > 0 ? Math.round(thisGood/thisCount*100) : 0;
  const predictedPos = Math.min(100, Math.max(0, posPct + Math.round(growth*10)));

  document.getElementById('forecast-content').innerHTML = `
    <div class="forecast-item">
      <div class="forecast-label">Expected Reviews Next Month</div>
      <div class="forecast-value">${predicted}</div>
      <div class="forecast-conf">Confidence: ${confidence}%</div>
      <div class="forecast-bar"><div class="forecast-bar-fill" style="width:${confidence}%"></div></div>
    </div>
    <div class="forecast-item">
      <div class="forecast-label">Expected Avg Rating</div>
      <div class="forecast-value">⭐ ${predictedRating}</div>
      <div class="forecast-conf">Based on current trend</div>
      <div class="forecast-bar"><div class="forecast-bar-fill" style="width:${Math.round(parseFloat(predictedRating)/5*100)}%"></div></div>
    </div>
    <div class="forecast-item">
      <div class="forecast-label">Expected Positive Rate</div>
      <div class="forecast-value">${predictedPos}%</div>
      <div class="forecast-conf">Linear trend projection</div>
      <div class="forecast-bar"><div class="forecast-bar-fill" style="width:${predictedPos}%"></div></div>
    </div>`;
}

// ── Management Summary ────────────────────────────────────
function renderSummary() {
  const tm      = analyticsData.this_month || {};
  const lm      = analyticsData.last_month || {};
  const workers = analyticsData.worker_perf;

  const thisCount = parseInt(tm.count||0);
  const lastCount = parseInt(lm.count||0);
  const growth    = lastCount > 0 ? Math.round((thisCount-lastCount)/lastCount*100) : 0;
  const thisGood  = parseInt(tm.good||0);
  const posPct    = thisCount > 0 ? Math.round(thisGood/thisCount*100) : 0;
  const needAttn  = workers.filter(w => {
    const pos = w.total_reviews > 0 ? w.good_reviews/w.total_reviews : 1;
    return pos < 0.5 && w.total_reviews > 1;
  });

  const perfTrend = growth > 0 ? 'good-trend' : growth < 0 ? 'bad-trend' : 'warn-trend';
  const satTrend  = posPct >= 70 ? 'good-trend' : posPct >= 50 ? 'warn-trend' : 'bad-trend';

  document.getElementById('summary-content').innerHTML = `
    <div class="summary-grid">
      <div class="summary-item ${perfTrend}">
        <div class="summary-q">Is performance improving?</div>
        <div class="summary-a">${growth > 5 ? '✅ Yes — review volume up '+growth+'%' : growth < -5 ? '❌ No — volume down '+Math.abs(growth)+'%' : '➡️ Stable this month'}</div>
      </div>
      <div class="summary-item ${satTrend}">
        <div class="summary-q">Is customer satisfaction good?</div>
        <div class="summary-a">${posPct >= 70 ? '✅ Yes — '+posPct+'% positive reviews' : posPct >= 50 ? '⚠️ Average — '+posPct+'% positive' : '❌ Low — only '+posPct+'% positive'}</div>
      </div>
      <div class="summary-item ${needAttn.length?'bad-trend':'good-trend'}">
        <div class="summary-q">Workers needing attention?</div>
        <div class="summary-a">${needAttn.length ? '⚠️ '+needAttn.map(w=>w.worker_name.split(' ')[0]).join(', ') : '✅ All workers performing well'}</div>
      </div>
      <div class="summary-item warn-trend">
        <div class="summary-q">Recommended action?</div>
        <div class="summary-a">${needAttn.length ? '🎯 Focus on training '+needAttn[0].worker_name.split(' ')[0]+' and review recent negative feedback.' : growth < 0 ? '📍 Move QR codes to more visible locations.' : '🚀 Keep up the great work and encourage more reviews!'}</div>
      </div>
    </div>`;
}

// ── Utility ───────────────────────────────────────────────
function getWeekNumber(d) {
  const s = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - s) / 86400000) + s.getDay() + 1) / 7);
}

// Start
init();
