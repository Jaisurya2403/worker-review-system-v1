# QR-Based Worker Review System v2

**Features:** Cloudinary image storage · Keep-alive cron · Multi-admin accounts · Aiven MySQL SSL · Render + Vercel deployment

---

## 📁 Project Structure

```
worker-review-system-v2/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env                  ← Edit this!
│   ├── .env.example
│   ├── config/
│   │   ├── db.js             ← MySQL connection (SSL-aware)
│   │   ├── cloudinary.js     ← Cloudinary upload helpers
│   │   └── keepAlive.js      ← Cron jobs (server + DB ping)
│   ├── controllers/
│   │   ├── adminController.js
│   │   ├── storeController.js
│   │   └── publicController.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── subscriptionMiddleware.js
│   │   └── uploadMiddleware.js  ← memoryStorage for Cloudinary
│   ├── routes/
│   │   ├── adminRoutes.js    ← includes /admins endpoints
│   │   ├── storeRoutes.js
│   │   └── publicRoutes.js
│   ├── uploads/qrcodes/      ← QR code PNGs saved here
│   └── database/
│       ├── schema.sql
│       └── seedAdmin.js
└── frontend/
    ├── index.html
    ├── customer-review.html
    ├── store-login.html
    ├── store-dashboard.html
    ├── admin-login.html
    ├── admin-dashboard.html  ← has Manage Admins tab
    ├── css/style.css
    └── js/
        ├── config.js         ← Change API_BASE here for deployment
        ├── utils.js          ← getImageUrl, escapeHtml, starsHtml
        ├── customer.js
        ├── store.js
        └── admin.js
```

---

## 🚀 LOCAL SETUP (VS Code)

### Prerequisites
- Node.js v18+: https://nodejs.org
- MySQL 8: https://dev.mysql.com/downloads/installer/
- VS Code + Live Server extension

### Step 1 — Set up MySQL database
Open MySQL Workbench → File → Open SQL Script → select `backend/database/schema.sql` → Execute All (⚡)

### Step 2 — Configure .env
Open `backend/.env` and set:
```
DB_PASSWORD=your_mysql_root_password
IMAGE_STORAGE=local         ← use "local" for dev without Cloudinary
```

### Step 3 — Install packages
```bash
cd backend
npm install
```

### Step 4 — Seed admin & start backend
```bash
node database/seedAdmin.js
npm start
```
You should see:
```
✅ Database connected successfully!
🚀 Worker Review System Backend started!
```

### Step 5 — Start frontend
Right-click `frontend/index.html` in VS Code → **Open with Live Server**

### Step 6 — Login
| Role | URL | Username | Password |
|------|-----|----------|----------|
| Admin | `/admin-login.html` | admin | Admin@123 |
| Store Owner (sample) | `/store-login.html` | coffeepalace | Admin@123 |
| Customer | `/customer-review.html?store=coffee-palace-10001` | — | — |

---

## ☁️ CLOUDINARY SETUP (Free — for worker images)

### Create free Cloudinary account
1. Go to https://cloudinary.com → Sign Up Free
2. Verify your email
3. Login → you land on the **Dashboard**
4. Note down these 3 values:
   - **Cloud Name** (shown top-left, e.g. `dxyz123`)
   - **API Key** (shown on dashboard)
   - **API Secret** (click "Reveal" next to API Secret)

### Add to .env (local)
```env
CLOUDINARY_CLOUD_NAME=dxyz123
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz
IMAGE_STORAGE=cloudinary
```

### How it works
- Worker images are uploaded to Cloudinary via `config/cloudinary.js`
- The full `https://res.cloudinary.com/...` URL is stored in MySQL `workers.image_path`
- `js/utils.js → getImageUrl()` detects if path starts with `https://` → uses directly
- Old local paths (`uploads/abc.jpg`) still work — backward compatible

### Free tier limits
- 25 GB storage
- 25 GB bandwidth/month
- Enough for thousands of worker profile photos

---

## 🔁 KEEP-ALIVE (Prevent Render from sleeping)

The free Render tier sleeps after 15 min of inactivity.
`config/keepAlive.js` runs two cron jobs automatically:

1. **Self-ping every 14 min** → hits `/api/health` to keep Render awake
2. **DB ping every 10 min** → runs `SELECT 1` to keep Aiven connection alive

### Setup
Set `BACKEND_URL` in your Render environment variables:
```
BACKEND_URL=https://your-app.onrender.com
```
That's it — the cron starts automatically when the server boots.

---

## 👤 MULTI-ADMIN MANAGEMENT

The Admin Dashboard now has a **"Manage Admins"** tab.

### Features
- **Super Admin** (original `admin` account) → marked with 👑
- Super Admin can create new admin accounts
- Super Admin can delete any non-super admin
- Any admin can change their own password
- Super Admin can change anyone's password
- Cannot delete the super admin account
- Admin usernames must be unique across both admins and store owners

### Add a new admin
1. Login as admin → Manage Admins tab
2. Click **+ Add Admin**
3. Enter username (min 3 chars) + password (min 6 chars) + confirm password
4. Click **Create Admin**

### Change a password
1. Go to Manage Admins tab
2. Find the admin → click **🔑 Change Password**
3. Enter new password twice → Save

### Admin API endpoints
```
GET    /api/admin/admins              → List all admins
POST   /api/admin/admins              → Create admin
PUT    /api/admin/admins/:id/password → Change password
DELETE /api/admin/admins/:id          → Delete admin (super only)
```

---

## ☁️ FREE DEPLOYMENT (Render + Vercel + Aiven)

### STEP 1 — Aiven MySQL (free managed MySQL)

1. Go to https://aiven.io → Sign up free
2. Create project → **New Service** → MySQL
3. Choose free plan (or lowest paid if free unavailable) → Create
4. After creation, click your service → **Overview** tab
5. Note down:
   - **Host** (e.g. `mysql-xyz.aivencloud.com`)
   - **Port** (e.g. `14699`)
   - **User** (`avnadmin`)
   - **Password** (shown in overview)
   - **Database** (`defaultdb` or create `worker_review_db`)
6. Under **Quick Connect** → download the **CA Certificate** (ca.pem)
7. Connect with MySQL Workbench:
   - Host, Port, User, Password from above
   - SSL: require + upload ca.pem
8. Run your `schema.sql` in Workbench

### STEP 2 — Render (backend)

1. Push your `backend/` folder to a **GitHub repository**
   ```bash
   cd worker-review-system-v2
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/your-repo.git
   git push -u origin main
   ```

2. Go to https://render.com → Sign up → **New Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Free plan**

5. Add Environment Variables in Render → Your Service → **Environment**:
   ```
   DB_HOST=mysql-xyz.aivencloud.com
   DB_PORT=14699
   DB_USER=avnadmin
   DB_PASSWORD=your_aiven_password
   DB_NAME=worker_review_db
   DB_SSL=true
   JWT_SECRET=a_very_long_random_secret_string_here_min_32_chars
   PORT=5000
   FRONTEND_URL=https://your-app.vercel.app
   BASE_URL=https://your-app.vercel.app
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   IMAGE_STORAGE=cloudinary
   BACKEND_URL=https://your-app.onrender.com
   ```
   *(Fill BACKEND_URL after Render gives you the URL)*

6. Deploy → wait 2-3 min → you get: `https://your-app.onrender.com`
7. Test: visit `https://your-app.onrender.com/api/health` → should return `{"status":"ok",...}`

8. Run seed in Render Shell (Render → Your Service → Shell tab):
   ```bash
   node database/seedAdmin.js
   ```

### STEP 3 — Vercel (frontend)

1. Before deploying, update `frontend/js/config.js`:
   ```js
   const API_BASE = 'https://your-app.onrender.com/api';
   const IMG_BASE = 'https://your-app.onrender.com';
   ```
   (Comment out the localhost line, uncomment the production line)

2. Push updated code to GitHub

3. Go to https://vercel.com → Sign up → **Import Project** → your repo
4. Settings:
   - **Root Directory:** `frontend`
   - **Framework:** Other (no framework)
5. Deploy → you get: `https://your-app.vercel.app`

6. Update Render env var `FRONTEND_URL` and `BASE_URL` to your Vercel URL
7. Redeploy Render service

### STEP 4 — Print QR codes for stores
1. Login as Admin → Stores tab
2. Click **📱 QR** next to each store
3. Click **🖨️ Print QR Code** → print and place at store counter

---

## 🐛 COMMON ERRORS & FIXES

### "Invalid username or password" at admin login
1. Check you ran `node database/seedAdmin.js` successfully
2. Make sure you see `✅ Password verification PASSED` in its output
3. Username is exactly: `admin` (no spaces)
4. Password is exactly: `Admin@123` (capital A, @ symbol)
5. Try resetting: `ADMIN_PASS=NewPass@123 node database/seedAdmin.js`

### "EADDRINUSE: port 5000" on npm start
Port is busy. Fix: `DB_PORT` is not the issue. Change server port:
```
PORT=5001
```
Also update `config.js`: `const API_BASE = 'http://localhost:5001/api';`

### Images not showing
- Cloudinary: check all 3 env vars are correct, `IMAGE_STORAGE=cloudinary`
- Local: `IMAGE_STORAGE=local`, images in `backend/uploads/`
- The `getImageUrl()` in `utils.js` handles both automatically

### "CORS error" in browser console
- Check `FRONTEND_URL` in `.env` matches your exact Live Server address
- Common: `http://localhost:5500` vs `http://127.0.0.1:5500` — pick one and use consistently
- Restart backend after changing `.env`

### Render server going to sleep despite keep-alive
- Ensure `BACKEND_URL` is set in Render environment (not just `.env` file)
- Check Render logs for `🏓 Keep-alive ping →` messages every 14 min
- Free Render tier: keep-alive works, but cold start may still take ~30s if it somehow sleeps

### Aiven MySQL SSL error
```
DB_SSL=true
```
This sets `{ rejectUnauthorized: false }` which works with Aiven's self-signed cert.

### QR code not showing in modal
- The QR image is saved at `backend/uploads/qrcodes/store-{id}.png` on the server
- On Render (ephemeral disk), QR files may disappear after redeploy
- Fix: after redeploying, re-create the store OR run admin → Stores → the QR URL still works even without the image

---

## 📋 QUICK REFERENCE — All Credentials

| Role | Username | Password | Notes |
|------|----------|----------|-------|
| Super Admin | `admin` | `Admin@123` | Created by seedAdmin.js |
| Sample Store 1 | `coffeepalace` | `Admin@123` | From schema.sql seed data |
| Sample Store 2 | `techhub` | `Admin@123` | From schema.sql seed data |

---

## 🔌 API ENDPOINTS

### Admin
```
POST   /api/admin/login
GET    /api/admin/admins
POST   /api/admin/admins
PUT    /api/admin/admins/:id/password
DELETE /api/admin/admins/:id
GET    /api/admin/stores
POST   /api/admin/stores
PUT    /api/admin/stores/:id/status
DELETE /api/admin/stores/:id
GET    /api/admin/stats
GET    /api/admin/reviews
DELETE /api/admin/reviews/:id
```

### Store Owner
```
POST   /api/store/login
GET    /api/store/dashboard
GET    /api/store/workers
POST   /api/store/workers
PUT    /api/store/workers/:id
DELETE /api/store/workers/:id
GET    /api/store/reviews
GET    /api/store/reviews/stats
```

### Public (Customer — no auth)
```
GET    /api/public/store/:qrSlug
GET    /api/public/store/:qrSlug/workers
POST   /api/public/store/:qrSlug/reviews
GET    /api/health
```
