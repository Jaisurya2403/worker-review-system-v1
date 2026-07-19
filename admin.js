// ============================================================
// js/admin.js  –  Admin dashboard  (FIXED COMPLETE)
// ============================================================

let adminToken      = localStorage.getItem('adminToken');
let adminIsSuper    = localStorage.getItem('adminIsSuper') === '1';
let pieChartInst    = null;
let barChartInst    = null;
let adminReviewPage = 1;
let currentQRData   = null;
let confirmCallback = null;

function openConfirmModal(title, message, callback) {

    document.getElementById("confirm-title").innerHTML = title;

    document.getElementById("confirm-message").innerHTML =
        `<p style="line-height:1.6">${message}</p>`;

    confirmCallback = callback;

    document
      .getElementById("confirm-modal")
      .classList.remove("hidden");
}

function executeConfirmAction() {

    if(confirmCallback){
        confirmCallback();
    }

    closeModal("confirm-modal");
}

if (!adminToken) window.location.href = 'admin-login.html';

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` };
}

function handleAuthError(res) {
  if (res.status === 401) { localStorage.clear(); window.location.href = 'admin-login.html'; return true; }
  return false;
}

function logout() { localStorage.clear(); window.location.href = 'admin-login.html'; }

// ── Tab navigation ────────────────────────────────────────
function showTab(name, linkEl) {
  ['overview','stores','reviews','admins'].forEach(t =>
    document.getElementById(`tab-${t}`).classList.add('hidden')
  );
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  document.getElementById(`tab-${name}`).classList.remove('hidden');
  if (linkEl) linkEl.classList.add('active');

  if (name === 'stores')  loadStores();
  if (name === 'reviews') { loadAdminReviews(); loadStoreFilter(); }
  if (name === 'admins')  loadAdmins();
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  document.getElementById('admin-username').textContent = localStorage.getItem('adminUsername') || 'Admin';
  await loadStats();
}

// ── Stats ─────────────────────────────────────────────────
async function loadStats() {
  try {
    const res  = await fetch(`${API_BASE}/admin/stats`, { headers: authHeaders() });
    if (handleAuthError(res)) return;
    const data = await res.json();

    document.getElementById('s-stores').textContent   = data.total_stores    || 0;
    document.getElementById('s-active').textContent   = data.active_stores   || 0;
    document.getElementById('s-disabled').textContent = data.disabled_stores || 0;
    document.getElementById('s-reviews').textContent  = data.total_reviews   || 0;
    document.getElementById('s-good').textContent     = data.good_reviews    || 0;
    document.getElementById('s-bad').textContent      = data.bad_reviews     || 0;
    document.getElementById('s-workers').textContent  = data.total_workers   || 0;
    document.getElementById('s-admins').textContent   = data.total_admins    || 0;

    renderPieChart(data.good_reviews || 0, data.bad_reviews || 0);
    renderBarChart(data.active_stores || 0, data.disabled_stores || 0);
  } catch (err) {
    console.error('Stats error:', err);
    showAlert('alert-area', 'Failed to load stats.', 'danger');
  }
}

function renderPieChart(good, bad) {
  const ctx = document.getElementById('adminPieChart').getContext('2d');
  if (pieChartInst) pieChartInst.destroy();
  if (!good && !bad) { ctx.canvas.parentElement.innerHTML = '<p style="text-align:center;padding:60px;color:var(--gray-400);">No reviews yet</p>'; return; }
  pieChartInst = new Chart(ctx, {
    type: 'doughnut',
    data: { labels:['Good Reviews','Bad Reviews'], datasets:[{ data:[good,bad], backgroundColor:['#22C55E','#EF4444'], borderWidth:0 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } }
  });
}

function renderBarChart(active, disabled) {
  const ctx = document.getElementById('adminBarChart').getContext('2d');
  if (barChartInst) barChartInst.destroy();
  barChartInst = new Chart(ctx, {
    type: 'bar',
    data: { labels:['Active Stores','Disabled Stores'], datasets:[{ data:[active,disabled], backgroundColor:['#22C55E','#EF4444'], borderRadius:8, borderWidth:0 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true}, x:{grid:{display:false}} } }
  });
}

// ── Stores ────────────────────────────────────────────────
async function loadStores() {
  const container = document.getElementById('stores-list');
  container.innerHTML = `<div class="loading-state"><div class="spinner spinner-dark"></div><p>Loading stores...</p></div>`;
  try {
    const res  = await fetch(`${API_BASE}/admin/stores`, { headers: authHeaders() });
    if (handleAuthError(res)) return;
    const data = await res.json();

    if (!data.stores || !data.stores.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="bi bi-shop"></i></div><p>No stores yet. Create your first store!</p></div>`;
      return;
    }

    const rows = data.stores.map(s => {
      const end      = s.subscription_end ? new Date(s.subscription_end) : null;
      const daysLeft = (s.days_remaining !== null && s.days_remaining !== undefined)
                         ? parseInt(s.days_remaining) : null;

      let subBadge = '';
      if (!end) {
        subBadge = `<span class="badge badge-gray">No expiry set</span>`;
      } else if (daysLeft < 0) {
        subBadge = `<span class="badge badge-danger">Expired</span>`;
      } else if (daysLeft <= 7) {
        subBadge = `<span class="badge badge-warning"><i class="bi bi-exclamation-triangle"></i> ${daysLeft}d left</span>`;
      } else {
        subBadge = `<span class="badge badge-success">${daysLeft}d left</span>`;
      }

      const endStr = end ? end.toLocaleDateString() : '—';

      return `
        <tr>
          <td>
            <div style="font-weight:700;">${escapeHtml(s.store_name)}</div>
            <div style="font-size:.78rem;color:var(--gray-500);">${escapeHtml(s.store_address||'—')}</div>
          </td>
          <td><code style="font-size:.78rem;background:var(--gray-100);padding:3px 7px;border-radius:6px;">${escapeHtml(s.owner_username||'—')}</code></td>
          <td><span class="badge badge-${s.subscription_status==='active'?'success':'danger'}">${s.subscription_status}</span></td>
          <td>
            ${subBadge}
            <div style="font-size:.75rem;color:var(--gray-500);margin-top:3px;">Until: ${endStr}</div>
          </td>
          <td>${s.worker_count||0}</td>
          <td>${s.review_count||0}</td>
          <td>
           <div style="display:flex;gap:6px;flex-wrap:wrap;">

  <button class="btn btn-sm btn-outline"
    onclick="viewQR('${escapeHtml(s.qr_slug)}','${escapeHtml(s.store_name)}','${s.qr_code_path||''}')">
    <i class="bi bi-phone-fill"></i> QR
  </button>

  <button class="btn btn-sm btn-outline" 
    onclick="openSubscriptionModal(${s.id},'${escapeHtml(s.store_name)}','${s.subscription_end||''}')">
    <i class="bi bi-calendar-date-fill"></i> Sub
  </button>

  <button class="btn btn-sm btn-outline"
    onclick="openSendNotifModal(${s.id},'${escapeHtml(s.store_name)}')">
    <i class="bi bi-megaphone-fill"></i> Notify
  </button>

  <button class="btn btn-sm btn-outline"
    onclick="viewStoreNotifications(${s.id},'${escapeHtml(s.store_name)}')">
    <i class="bi bi-bell-fill"></i> View
  </button>

  <button class="btn btn-sm btn-outline"
    onclick="openEditStoreModal(
      ${s.id},
      '${escapeHtml(s.store_name)}',
      '${escapeHtml(s.store_address || '')}',
      '${escapeHtml(s.owner_username || '')}'
    )">
    <i class="bi bi-pencil-fill"></i> Edit
</button>

  ${s.subscription_status==='active'
    ? `<button class="btn btn-sm btn-outline"
         onclick="toggleStore(${s.id},'disabled','${escapeHtml(s.store_name)}')">
         <i class="bi bi-x-circle-fill"></i> Disable
       </button>`
    : `<button class="btn btn-sm btn-success"
         onclick="toggleStore(${s.id},'active','${escapeHtml(s.store_name)}')">
         <i class="bi bi-check-circle-fill"></i> Enable
       </button>`
  }

  <button class="btn btn-sm btn-danger"
    onclick="deleteStore(${s.id},'${escapeHtml(s.store_name)}')">
    <i class="bi bi-trash3-fill"></i>
  </button>

</div>
          </td>
        </tr>`;
    }).join('');

    container.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr>
        <th>Store</th><th>Owner</th><th>Status</th><th>Subscription</th>
        <th>Workers</th><th>Reviews</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } catch { container.innerHTML = `<div class="alert alert-danger">Failed to load stores.</div>`; }
}

function openEditStoreModal(
    id,
    name,
    address,
    username
){

    document.getElementById("edit-store-id").value = id;
    document.getElementById("edit-store-name").value = name;
    document.getElementById("edit-store-address").value = address;
    document.getElementById("edit-owner-username").value = username;
    document.getElementById("edit-owner-password").value = "";

    document
      .getElementById("edit-store-modal")
      .classList.remove("hidden");
}

async function updateStore(e){

    e.preventDefault();

    const id = document.getElementById("edit-store-id").value;

    const store_name =
      document.getElementById("edit-store-name").value.trim();

    const store_address =
      document.getElementById("edit-store-address").value.trim();

    const owner_username =
      document.getElementById("edit-owner-username").value.trim();

    const owner_password =
      document.getElementById("edit-owner-password").value.trim();

    try{

        const res = await fetch(
          `${API_BASE}/admin/stores/${id}`,
          {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({
              store_name,
              store_address,
              owner_username,
              owner_password
            })
          }
        );

        const data = await res.json();

        if(!res.ok){
            showAlert(
              "alert-area",
              data.error || "Failed",
              "danger"
            );
            return;
        }

        closeModal("edit-store-modal");

        showAlert(
          "alert-area",
          "Store updated successfully",
          "success"
        );

        loadStores();

    }
    catch(err){

        showAlert(
          "alert-area",
          "Connection error",
          "danger"
        );
    }
}

function openAddStoreModal() {
  ['new-store-name','new-store-address','new-owner-username','new-owner-password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('store-modal-alert').innerHTML = '';
  document.getElementById('add-store-modal').classList.remove('hidden');
}

async function createStore(e) {
  e.preventDefault();
  const alertEl = document.getElementById('store-modal-alert');
  const btn     = document.getElementById('create-store-btn');
  alertEl.innerHTML = '';

  const storeName    = document.getElementById('new-store-name').value.trim();
  const storeAddress = document.getElementById('new-store-address').value.trim();
  const ownerUser    = document.getElementById('new-owner-username').value.trim();
  const ownerPass    = document.getElementById('new-owner-password').value.trim();

  if (!storeName || !ownerUser || !ownerPass) {
    alertEl.innerHTML = `<div class="alert alert-danger">Store name, owner username, and password are required.</div>`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating...';

  try {
    const res  = await fetch(`${API_BASE}/admin/stores`, {
      method : 'POST',
      headers: authHeaders(),
      body   : JSON.stringify({
        store_name    : storeName,
        store_address : storeAddress,
        owner_username: ownerUser,
        owner_password: ownerPass
      })
    });
    const data = await res.json();
    if (!res.ok) { alertEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(data.error||'Failed.')}</div>`; return; }

    closeModal('add-store-modal');
    const base = window.location.origin;
    document.getElementById('created-store-name').textContent     = storeName;
    document.getElementById('created-owner-username').textContent  = ownerUser;
    document.getElementById('created-qr-url').textContent         = `${base}/customer-review.html?store=${data.store.qr_slug}`;
    document.getElementById('store-success-modal').classList.remove('hidden');
    loadStats();
  } catch { alertEl.innerHTML = `<div class="alert alert-danger">Connection error.</div>`; }
  finally { btn.disabled = false; btn.innerHTML = 'Create Store'; }
}

async function toggleStore(id, status, name) {
  const msg =
    status === 'active'
      ? `Enable "${name}"?\n\nThe store owner will regain access immediately.`
      : `Disable "${name}"?\n\nThe store owner will NOT be able to login and customers cannot submit reviews until re-enabled.`;
openConfirmModal(
  status === 'active'
    ? '<i class="bi bi-check-circle-fill text-success"></i> Enable Store'
    : '<i class="bi bi-x-circle-fill text-danger"></i> Disable Store',

  `
  <p>
    Store:
    <strong>${name}</strong>
  </p>
  `,

  async () => {
  try {
    const res  = await fetch(`${API_BASE}/admin/stores/${id}/status`, { method:'PUT', headers: authHeaders(), body: JSON.stringify({status}) });
    const data = await res.json();
    if (!res.ok) { showAlert('alert-area', data.error||'Failed.', 'danger'); return; }
    
    showAlert(
  'alert-area',
  status === 'active'
    ? `✅ ${name} has been enabled successfully.`
    : `⛔ ${name} has been disabled successfully.`,
  'success'
);

    loadStores(); loadStats();
  } catch { showAlert('alert-area', 'Connection error.', 'danger'); }
  });
}


async function deleteStore(id, name) {

openConfirmModal(
  '🗑 Delete Store',

  `
  <p>
    Are you sure you want to delete
    <strong>${name}</strong>?
  </p>

  <p>
    This will delete:
  </p>

  <ul>
    <li>Store</li>
    <li>Workers</li>
    <li>Reviews</li>
  </ul>

  This action CANNOT be undone.

Do you want to continue?
  `,

  async () => {
  try {
    const res  = await fetch(`${API_BASE}/admin/stores/${id}`, { method:'DELETE', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { showAlert('alert-area', data.error||'Failed.', 'danger'); return; }
    
    showAlert(
  'alert-area',
  `🗑️ "${name}" has been permanently deleted.`,
  'success'
);

    loadStores(); loadStats();
  } catch { showAlert('alert-area', 'Connection error.', 'danger'); }
  });
}

function viewQR(qrSlug, storeName, qrCodePath) {
  const reviewUrl = `${window.location.origin}/customer-review.html?store=${qrSlug}`;
  currentQRData   = { storeName, reviewUrl, qrCodePath };
  const content   = document.getElementById('qr-modal-content');
  if (qrCodePath) {
    const src = `${IMG_BASE}/${qrCodePath}`;
    content.innerHTML = `
      <p style="font-weight:700;margin-bottom:12px;">${escapeHtml(storeName)}</p>
      <img src="${src}" style="width:200px;height:200px;border:6px solid #fff;box-shadow:var(--shadow);border-radius:var(--radius);"
        onerror="this.style.display='none';document.getElementById('qr-err').style.display='block';" />
      <div id="qr-err" style="display:none;background:var(--gray-100);padding:20px;border-radius:var(--radius);margin-top:8px;font-size:.82rem;color:var(--gray-500);">QR image not found.</div>
      <p style="margin-top:12px;font-size:.78rem;word-break:break-all;">
        <a href="${reviewUrl}" target="_blank" style="color:var(--primary);">${reviewUrl}</a>
      </p>`;
  } else {
    content.innerHTML = `<p style="color:var(--gray-500);font-size:.9rem;margin:20px 0;">QR code not generated yet.</p>
      <p style="font-size:.82rem;word-break:break-all;"><a href="${reviewUrl}" target="_blank" style="color:var(--primary);">${reviewUrl}</a></p>`;
  }
  document.getElementById('qr-modal').classList.remove('hidden');
}

function printQRFromModal() {
  const img = document.querySelector('#qr-modal-content img');
  if (!img) { alert('QR image not available.'); return; }
  const w = window.open('');
  w.document.write(`<html><body style="text-align:center;padding:40px;font-family:sans-serif;">
    <h2>${escapeHtml(currentQRData?.storeName||'')}</h2>
    <p style="color:#666;">Scan to leave a review</p>
    <img src="${img.src}" style="width:250px;height:250px;"/>
    <p style="font-size:.8rem;color:#999;margin-top:12px;">Thank you for your feedback!</p>
  </body></html>`);
  w.document.close(); w.print();
}

// ── Reviews moderation ────────────────────────────────────
async function loadStoreFilter() {
  try {
    const res  = await fetch(`${API_BASE}/admin/stores`, { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    const sel  = document.getElementById('admin-filter-store');
    sel.innerHTML = '<option value="">All Stores</option>';
    (data.stores||[]).forEach(s => { sel.innerHTML += `<option value="${s.id}">${escapeHtml(s.store_name)}</option>`; });
  } catch {}
}

async function loadAdminReviews(page = 1) {
  adminReviewPage = page;
  const container = document.getElementById('admin-reviews-list');
  container.innerHTML = `<div class="loading-state"><div class="spinner spinner-dark"></div><p>Loading...</p></div>`;

  const params = new URLSearchParams({ page, limit: 20 });
  const sId = document.getElementById('admin-filter-store').value;
  const rt  = document.getElementById('admin-filter-type').value;
  if (sId) params.append('store_id',    sId);
  if (rt)  params.append('review_type', rt);

  try {
    const res  = await fetch(`${API_BASE}/admin/reviews?${params}`, { headers: authHeaders() });
    if (handleAuthError(res)) return;
    const data = await res.json();

    if (!data.reviews || !data.reviews.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><p>No reviews found.</p></div>`;
      document.getElementById('admin-reviews-pagination').innerHTML = '';
      return;
    }

    const rows = data.reviews.map(r => `
      <tr>
        <td>${escapeHtml(r.store_name)}</td>
        <td><div style="font-weight:600;">${escapeHtml(r.worker_name)}</div><div style="font-size:.78rem;color:var(--gray-500);">${escapeHtml(r.role||'')}</div></td>
        <td><span class="badge badge-${r.review_type==='good'?'success':'danger'}">${r.review_type==='good'?'<i class="bi bi-hand-thumbs-up-fill"></i> Good':'<i class="bi bi-hand-thumbs-down-fill"></i> Bad'}</span></td>
        <td><span style="color:var(--warning);">${starsHtml(r.rating)}</span></td>
        <td style="max-width:180px;font-size:.85rem;">${r.description ? escapeHtml(r.description).substring(0,100)+(r.description.length>100?'...':'') : '<span style="color:var(--gray-400);">—</span>'}</td>
        <td style="white-space:nowrap;">${new Date(r.created_at).toLocaleDateString()}</td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteReview(${r.id})"><i class="bi bi-trash3-fill"></i> Delete</button></td>
      </tr>`).join('');

    container.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Store</th><th>Worker</th><th>Type</th><th>Rating</th><th>Comment</th><th>Date</th><th>Action</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;

    const pag = document.getElementById('admin-reviews-pagination');
    pag.innerHTML = data.pages > 1
      ? Array.from({length:data.pages},(_,i)=>
          `<button class="btn ${i+1===page?'btn-primary':'btn-outline'} btn-sm" style="margin:2px;" onclick="loadAdminReviews(${i+1})">${i+1}</button>`
        ).join('')
      : '';
  } catch { container.innerHTML = `<div class="alert alert-danger">Failed to load reviews.</div>`; }
}

async function deleteReview(id) {
  openConfirmModal(
  '🗑 Delete Review',

  `
  <p>
    Are you sure you want to delete this review?
  </p>

  <p style="color:red;">
    This action cannot be undone.
  </p>
  `,

  async () => {
  try {
    const res  = await fetch(`${API_BASE}/admin/reviews/${id}`, { method:'DELETE', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { showAlert('alert-area', data.error||'Failed.', 'danger'); return; }
    showAlert('alert-area', 'Review deleted.', 'success');
    loadAdminReviews(adminReviewPage); loadStats();
  } catch { showAlert('alert-area', 'Connection error.', 'danger'); }
  });
}

function clearAdminFilters() {
  document.getElementById('admin-filter-store').value = '';
  document.getElementById('admin-filter-type').value  = '';
  loadAdminReviews();
}

// ── Admin Accounts ────────────────────────────────────────
async function loadAdmins() {
  const container = document.getElementById('admins-list');
  container.innerHTML = `<div class="loading-state"><div class="spinner spinner-dark"></div><p>Loading admins...</p></div>`;
  try {
    const res  = await fetch(`${API_BASE}/admin/admins`, { headers: authHeaders() });
    if (handleAuthError(res)) return;
    const data = await res.json();

    if (!data.admins || !data.admins.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="bi bi-person-fill"></i></div><p>No admin accounts found.</p></div>`;
      return;
    }

    const myUsername = localStorage.getItem('adminUsername');
    const rows = data.admins.map(a => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:50%;
                        background:${a.is_super?'var(--primary)':'var(--gray-300)'};
                        display:flex;align-items:center;justify-content:center;
                        color:#fff;font-size:1rem;flex-shrink:0;">
              ${a.is_super ? '👑' : '<i class="bi bi-person-badge-fill"></i>'}
            </div>
            <div>
              <div style="font-weight:700;">${escapeHtml(a.username)}</div>
              ${a.username === myUsername ? '<div style="font-size:.75rem;color:var(--primary);">← You</div>' : ''}
            </div>
          </div>
        </td>
        <td>${a.is_super ? '<span class="badge badge-primary">Super Admin</span>' : '<span class="badge badge-gray">Admin</span>'}</td>
        <td>${new Date(a.created_at).toLocaleDateString()}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${adminIsSuper
              ? `<button class="btn btn-warning btn-sm" onclick="openChangePassword(${a.id},'${escapeHtml(a.username)}')"><i class="bi bi-lock-fill"></i>Change Password</button>`
              : ''
            }
            ${adminIsSuper && !a.is_super && a.username !== myUsername
              ? `<button class="btn btn-danger btn-sm" onclick="deleteAdmin(${a.id},'${escapeHtml(a.username)}')"><i class="bi bi-trash3-fill"></i> Delete</button>`
              : ''
            }
          </div>
        </td>
      </tr>`).join('');

    container.innerHTML = `<div class="table-wrapper"><table>
      <thead><tr><th>Admin</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  } catch { container.innerHTML = `<div class="alert alert-danger">Failed to load admins.</div>`; }
}

function openAddAdminModal() {
  ['new-admin-username','new-admin-password','new-admin-password2'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('admin-modal-alert').innerHTML = '';
  document.getElementById('add-admin-modal').classList.remove('hidden');
}

async function createAdmin(e) {
  e.preventDefault();
  const alertEl = document.getElementById('admin-modal-alert');
  const btn     = document.getElementById('create-admin-btn');
  alertEl.innerHTML = '';

  const username  = document.getElementById('new-admin-username').value.trim();
  const password  = document.getElementById('new-admin-password').value.trim();
  const password2 = document.getElementById('new-admin-password2').value.trim();

  if (!username || !password) { alertEl.innerHTML = `<div class="alert alert-danger">Username and password are required.</div>`; return; }
  if (username.length < 3)    { alertEl.innerHTML = `<div class="alert alert-danger">Username must be at least 3 characters.</div>`; return; }
  if (password.length < 6)    { alertEl.innerHTML = `<div class="alert alert-danger">Password must be at least 6 characters.</div>`; return; }
  if (password !== password2) { alertEl.innerHTML = `<div class="alert alert-danger">Passwords do not match.</div>`; return; }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Creating...';
  try {
    const res  = await fetch(`${API_BASE}/admin/admins`, { method:'POST', headers: authHeaders(), body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { alertEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(data.error||'Failed.')}</div>`; return; }
    closeModal('add-admin-modal');
    showAlert('alert-area', `Admin "${username}" created successfully!`, 'success');
    loadAdmins(); loadStats();
  } catch { alertEl.innerHTML = `<div class="alert alert-danger">Connection error.</div>`; }
  finally { btn.disabled = false; btn.innerHTML = 'Create Admin'; }
}

function openChangePassword(id, username) {
  document.getElementById('change-pass-admin-id').value      = id;
  document.getElementById('change-pass-username').textContent = username;
  document.getElementById('new-pass-input').value  = '';
  document.getElementById('new-pass-input2').value = '';
  document.getElementById('change-pass-alert').innerHTML = '';
  document.getElementById('change-pass-modal').classList.remove('hidden');
}

async function submitChangePassword(e) {
  e.preventDefault();
  const alertEl = document.getElementById('change-pass-alert');
  const btn     = document.getElementById('change-pass-btn');
  alertEl.innerHTML = '';

  const id    = document.getElementById('change-pass-admin-id').value;
  const pass  = document.getElementById('new-pass-input').value.trim();
  const pass2 = document.getElementById('new-pass-input2').value.trim();

  if (pass.length < 6)  { alertEl.innerHTML = `<div class="alert alert-danger">Password must be at least 6 characters.</div>`; return; }
  if (pass !== pass2)   { alertEl.innerHTML = `<div class="alert alert-danger">Passwords do not match.</div>`; return; }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving...';
  try {
    const res  = await fetch(`${API_BASE}/admin/admins/${id}/password`, { method:'PUT', headers: authHeaders(), body: JSON.stringify({ new_password: pass }) });
    const data = await res.json();
    if (!res.ok) { alertEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(data.error||'Failed.')}</div>`; return; }
    closeModal('change-pass-modal');
    showAlert('alert-area', 'Password changed successfully!', 'success');
  } catch { alertEl.innerHTML = `<div class="alert alert-danger">Connection error.</div>`; }
  finally { btn.disabled = false; btn.innerHTML = 'Change Password'; }
}

async function deleteAdmin(id, username) {
  openConfirmModal(
  '<i class="bi bi-person-fill"></i> Delete Admin',

  `
  <p>
    Are you sure you want to delete
    <strong>${username}</strong>?
  </p>

  <p>
    This admin will immediately lose access
    to the dashboard.
  </p>

  <p style="color:red;">
    This action cannot be undone.
  </p>
  `,

  async () => {
  try {
    const res  = await fetch(`${API_BASE}/admin/admins/${id}`, { method:'DELETE', headers: authHeaders() });
    const data = await res.json();
    if (!res.ok) { showAlert('alert-area', data.error||'Failed.', 'danger'); return; }
    showAlert('alert-area', data.message, 'success');
    loadAdmins(); loadStats();
  } catch { showAlert('alert-area', 'Connection error.', 'danger'); }
  });
}

// ── Modal helpers ─────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function closeModalOutside(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

// ── Subscription ──────────────────────────────────────────
function openSubscriptionModal(storeId, storeName, currentEnd) {
  document.getElementById('sub-store-id').value          = storeId;
  document.getElementById('sub-store-name').textContent  = storeName;
  document.getElementById('sub-days').value              = 30;
  document.getElementById('sub-extend-from').value       = 'today';
  document.getElementById('sub-modal-alert').innerHTML   = '';

  if (currentEnd) {
    const end  = new Date(currentEnd);
    const left = Math.ceil((end - new Date()) / (1000*60*60*24));
    document.getElementById('sub-current-info').innerHTML =
      `Current expiry: <strong>${end.toLocaleDateString()}</strong>
       (${left > 0 ? left+' days remaining' : '<span style="color:var(--danger)">EXPIRED</span>'})`;
  } else {
    document.getElementById('sub-current-info').innerHTML = 'No subscription set yet.';
  }
  document.getElementById('sub-modal').classList.remove('hidden');
}

async function submitSubscription(e) {
  e.preventDefault();
  const alertEl = document.getElementById('sub-modal-alert');
  const btn     = document.getElementById('sub-save-btn');
  alertEl.innerHTML = '';

  const storeId    = document.getElementById('sub-store-id').value;
  const days       = document.getElementById('sub-days').value;
  const extendFrom = document.getElementById('sub-extend-from').value;

  if (!days || days < 1) { alertEl.innerHTML = `<div class="alert alert-danger">Please enter a valid number of days.</div>`; return; }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving...';
  try {
    const res  = await fetch(`${API_BASE}/admin/stores/${storeId}/subscription`, {
      method : 'PUT',
      headers: authHeaders(),
      body   : JSON.stringify({ subscription_days: parseInt(days), extend_from: extendFrom })
    });
    const data = await res.json();
    if (!res.ok) { alertEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(data.error||'Failed.')}</div>`; return; }
    closeModal('sub-modal');
    showAlert('alert-area', `✅ ${data.message}`, 'success');
    loadStores(); loadStats();
  } catch { alertEl.innerHTML = `<div class="alert alert-danger">Connection error.</div>`; }
  finally { btn.disabled = false; btn.innerHTML = 'Save Subscription'; }
}

document.addEventListener('DOMContentLoaded', () => {
  function updatePreview() {
    const days    = parseInt(document.getElementById('sub-days')?.value) || 0;
    const preview = document.getElementById('sub-preview');
    if (!preview || !days) return;
    const newEnd = new Date();
    newEnd.setDate(newEnd.getDate() + days);
    preview.textContent = ' ' + newEnd.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  }
  document.getElementById('sub-days')?.addEventListener('input', updatePreview);
  document.getElementById('sub-extend-from')?.addEventListener('change', updatePreview);
});

// ── Notifications (Admin side) ────────────────────────────
function openSendNotifModal(storeId, storeName) {
  document.getElementById('notif-store-id').value         = storeId;
  document.getElementById('notif-store-name').textContent = storeName;
  document.getElementById('notif-title').value            = '';
  document.getElementById('notif-message').value          = '';
  document.getElementById('notif-type').value             = 'admin_message';
  document.getElementById('notif-modal-alert').innerHTML  = '';
  document.getElementById('notif-char-count').textContent = '0';
  document.getElementById('notif-modal').classList.remove('hidden');
}

function useTemplate(type, title, message) {
  document.getElementById('notif-type').value             = type;
  document.getElementById('notif-title').value            = title;
  document.getElementById('notif-message').value          = message;
  document.getElementById('notif-char-count').textContent = message.length;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('notif-message')?.addEventListener('input', function () {
    document.getElementById('notif-char-count').textContent = this.value.length;
  });
});

async function submitNotification(e) {
  e.preventDefault();
  const alertEl = document.getElementById('notif-modal-alert');
  const btn     = document.getElementById('send-notif-btn');
  alertEl.innerHTML = '';

  const storeId = document.getElementById('notif-store-id').value;
  const type    = document.getElementById('notif-type').value;
  const title   = document.getElementById('notif-title').value.trim();
  const message = document.getElementById('notif-message').value.trim();

  if (!title || !message) { alertEl.innerHTML = `<div class="alert alert-danger">Title and message are required.</div>`; return; }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending...';
  try {
    const res  = await fetch(`${API_BASE}/notifications/admin/send`, {
      method : 'POST',
      headers: authHeaders(),
      body   : JSON.stringify({ store_id: storeId, type, title, message })
    });
    const data = await res.json();
    if (!res.ok) { alertEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(data.error||'Failed.')}</div>`; return; }
    closeModal('notif-modal');
    showAlert('alert-area', `📨 ${data.message}`, 'success');
  } catch { alertEl.innerHTML = `<div class="alert alert-danger">Connection error. Please try again.</div>`; }
  finally { btn.disabled = false; btn.innerHTML = '📨 Send Notification'; }
}


async function viewStoreNotifications(storeId, storeName) {

  document.getElementById(
    'view-notif-store-name'
  ).textContent = storeName;

  document
  .getElementById('view-notif-modal')
  .classList.remove('hidden');

  const container =
    document.getElementById('view-notif-list');

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner spinner-dark"></div>
    </div>
  `;

  try {

    const response = await fetch(
  `${API_BASE}/notifications/admin/store/${storeId}`,
  {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('adminToken')}`
    }
  }
);

if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}

const data = await response.json();

    const notifications =
      data.notifications || [];

    if (!notifications.length) {

      container.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-bell-slash"></i>
          <p>No notifications found.</p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      notifications.map(n => `

      <div class="card"
           style="margin-bottom:12px;padding:16px;">

        <h4>${escapeHtml(n.title)}</h4>

        <p>${escapeHtml(n.message)}</p>

        <small>
          ${new Date(n.created_at)
            .toLocaleString()}
        </small>

      </div>

    `).join('');

  } catch (err) {

    console.error(err);

    container.innerHTML = `
      <div class="empty-state">
        Failed to load notifications
      </div>
    `;
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// Start
init();
