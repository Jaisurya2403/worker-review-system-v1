// config/keepAlive.js
const cron = require('node-cron');
const db   = require('./db');
const { sendExpiryWarning } = require('./mailer'); // ← NEW import added

async function startKeepAlive() {
  const backendUrl = process.env.BACKEND_URL;

  // ── 1. Self-ping every 14 min (keep Render awake) ─────────
  if (backendUrl) {
    cron.schedule('*/14 * * * *', () => {
      const pingUrl   = `${backendUrl}/api/health`;
      const transport = pingUrl.startsWith('https') ? require('https') : require('http');
      console.log(`🏓 Keep-alive ping → ${pingUrl}`);
      transport.get(pingUrl, res => {
        console.log(`✅ Keep-alive: ${res.statusCode}`);
      }).on('error', err => {
        console.warn('⚠️  Keep-alive failed:', err.message);
      });
    });
    console.log('🔁 Keep-alive cron started (every 14 min)');
  } else {
    console.log('ℹ️  BACKEND_URL not set – keep-alive disabled (fine for local dev)');
  }

  // ── 2. DB keep-alive every 10 min ─────────────────────────
  cron.schedule('*/10 * * * *', async () => {
    try { await db.query('SELECT 1'); } catch (e) { console.warn('DB ping failed:', e.message); }
  });
  console.log('🔁 DB keep-alive cron started (every 10 min)');

  // ── 3. Subscription check — runs every day at 8:00 AM ─────
  // (replaced old hourly cron with this full version)
  cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Running daily subscription check...');
    try {
      // Get all stores with expiry info and owner email
      const [stores] = await db.query(`
        SELECT
          s.id,
          s.store_name,
          s.subscription_end,
          s.subscription_status,
          s.last_notified_days,
          su.email AS owner_email,
          DATEDIFF(s.subscription_end, CURDATE()) AS days_remaining
        FROM stores s
        LEFT JOIN store_users su ON su.store_id = s.id
        WHERE s.subscription_end IS NOT NULL
      `);

      for (const store of stores) {
        const days = parseInt(store.days_remaining);

        // ── Auto-disable if expired ──────────────────────────
        if (days < 0 && store.subscription_status === 'active') {
          await db.query(
            "UPDATE stores SET subscription_status = 'disabled' WHERE id = ?",
            [store.id]
          );
          console.log(`🔴 Auto-disabled expired store: ${store.store_name}`);

          // Insert expired in-app notification
          await db.query(
            `INSERT INTO notifications (store_id, type, title, message, sent_by)
             VALUES (?, 'subscription_expired',
               '🔴 Subscription Expired',
               'Your subscription has expired. Your store is now disabled. Customers cannot submit reviews. Please contact the admin to renew.',
               'System')`,
            [store.id]
          );

          // Send expired email if email exists
          if (store.owner_email) {
            await sendExpiryWarning(
              store.owner_email,
              store.store_name,
              0,
              store.subscription_end
            );
          }
        }

        // ── Send warning at 7, 3, 1 days before expiry ───────
        const notifyAt = [7, 3, 1];
        if (
          notifyAt.includes(days) &&
          store.last_notified_days !== days
        ) {
          // Insert in-app warning notification
          await db.query(
            `INSERT INTO notifications (store_id, type, title, message, sent_by)
             VALUES (?, 'subscription_warning', ?, ?, 'System')`,
            [
              store.id,
              `⚠️ Subscription expires in ${days} day${days === 1 ? '' : 's'}`,
              `Your subscription for "${store.store_name}" will expire on ${
                new Date(store.subscription_end).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })
              }. Please contact the admin to renew before service is interrupted.`
            ]
          );

          // Mark notified so we don't send again same day
          await db.query(
            'UPDATE stores SET last_notified_days = ? WHERE id = ?',
            [days, store.id]
          );

          // Send warning email if email exists
          if (store.owner_email) {
            await sendExpiryWarning(
              store.owner_email,
              store.store_name,
              days,
              store.subscription_end
            );
          }

          console.log(`📧 Notified store "${store.store_name}" — ${days} days left`);
        }
      }

      console.log(`✅ Subscription check complete (${stores.length} stores checked)`);
    } catch (err) {
      console.warn('⚠️ Subscription check error:', err.message);
    }
  });
  console.log('🔁 Subscription expiry cron started (daily at 8:00 AM)');
}

module.exports = { startKeepAlive };