// config/mailer.js
// Placeholder — email not configured yet
async function sendExpiryWarning(toEmail, storeName, daysLeft, expiryDate) {
  console.log(`📧 [Email skipped] Would send to ${toEmail} — ${storeName} expires in ${daysLeft} days`);
}

module.exports = { sendExpiryWarning };