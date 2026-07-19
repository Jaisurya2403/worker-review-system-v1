// ============================================================
// database/seedAdmin.js
//
// Creates / resets the super-admin account safely.
// Run AFTER schema.sql has been executed:
//   node database/seedAdmin.js
//
// You can also run it to CHANGE the super-admin password:
//   ADMIN_PASS=NewPass@456 node database/seedAdmin.js
// ============================================================

const bcrypt = require('bcryptjs');
require('dotenv').config();
const db = require('../config/db');

async function seedAdmin() {
  try {
    const username  = process.env.ADMIN_USER || 'admin';
    const plainPass = process.env.ADMIN_PASS || 'Admin@123';

    if (plainPass.length < 8) {
      console.error('❌ Password must be at least 8 characters.');
      process.exit(1);
    }

    // Generate a FRESH bcrypt hash every time this script runs
    console.log('🔐 Hashing password...');
    const passwordHash = await bcrypt.hash(plainPass, 12); // cost=12 for production

    // Check if super-admin already exists
    const [existing] = await db.query(
      'SELECT id FROM admins WHERE username = ?',
      [username]
    );

    if (existing.length > 0) {
      // UPDATE existing super-admin password
      await db.query(
        'UPDATE admins SET password_hash = ?, is_super = 1 WHERE username = ?',
        [passwordHash, username]
      );
      console.log('');
      console.log('✅ Super-admin password UPDATED successfully!');
    } else {
      // INSERT new super-admin
      await db.query(
        'INSERT INTO admins (username, password_hash, is_super) VALUES (?, ?, 1)',
        [username, passwordHash]
      );
      console.log('');
      console.log('✅ Super-admin account CREATED successfully!');
    }

    console.log(`   Username : ${username}`);
    console.log(`   Password : ${plainPass}`);
    console.log('');
    console.log('   ⚠️  Change this password after first login!');
    console.log('');

    // Verify the hash actually works before exiting
    const [row] = await db.query('SELECT password_hash FROM admins WHERE username = ?', [username]);
    const valid = await bcrypt.compare(plainPass, row[0].password_hash);
    if (valid) {
      console.log('✅ Password verification PASSED — login will work correctly.');
    } else {
      console.error('❌ Password verification FAILED — something went wrong!');
    }
    console.log('');
    process.exit(0);

  } catch (err) {
    console.error('');
    console.error('❌ seedAdmin error:', err.message);
    console.error('   Make sure MySQL is running and schema.sql has been executed first.');
    console.error('');
    process.exit(1);
  }
}

seedAdmin();
