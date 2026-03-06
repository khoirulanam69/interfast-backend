const cron = require('node-cron');
const { query } = require('../config/database');
const { DateTime } = require('luxon');
const logger = require('../utils/logger');

/**
 * Reset payment_status to 'Unpaid' for active users only.
 * - Only affects users with user_status = 'Active' and payment_status = 'Paid'
 * - Uses a last_reset_date tracking to prevent duplicate runs on the same day
 * - Does NOT change user_status, expired_date, or any other fields
 */
async function resetMonthlyPaymentStatus() {
  const now = DateTime.now().setZone('Asia/Jakarta');
  const todayStr = now.toFormat('yyyy-MM-dd');

  try {
    logger.info(`[PaymentReset] Starting monthly payment status reset... (WIB: ${now.toFormat('dd-MM-yyyy HH:mm:ss')})`);

    // Guard: check if reset already ran today (prevent duplicate execution)
    const checkResult = await query(
      `SELECT value FROM app_settings WHERE key = 'last_payment_reset_date' LIMIT 1`
    );

    if (checkResult.rows.length > 0 && checkResult.rows[0].value === todayStr) {
      logger.info(`[PaymentReset] Already executed today (${todayStr}). Skipping.`);
      return { success: true, message: 'Already reset today, skipped', skipped: true };
    }

    // Reset payment_status to 'Unpaid' for active users who are currently 'Paid'
    const updateResult = await query(
      `UPDATE users 
       SET payment_status = 'Unpaid', updated_at = NOW() 
       WHERE user_status = 'Active' AND payment_status = 'Paid'`
    );

    const affectedCount = updateResult.rowCount || 0;
    logger.info(`[PaymentReset] Reset ${affectedCount} active user(s) payment status to Unpaid`);

    // Record that we ran today to prevent duplicates
    await query(
      `INSERT INTO app_settings (key, value, updated_at) 
       VALUES ('last_payment_reset_date', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [todayStr]
    );

    // Log total counts for visibility
    const countResult = await query(
      `SELECT 
         COUNT(*) FILTER (WHERE payment_status = 'Unpaid') as unpaid_count,
         COUNT(*) FILTER (WHERE user_status = 'Active') as active_count
       FROM users`
    );

    if (countResult.rows.length > 0) {
      const { unpaid_count, active_count } = countResult.rows[0];
      logger.info(`[PaymentReset] Summary — Active users: ${active_count}, Unpaid: ${unpaid_count}`);
    }

    return { success: true, message: `Payment status reset completed. ${affectedCount} user(s) updated.` };
  } catch (error) {
    logger.error('[PaymentReset] Failed to reset monthly payment status:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize payment scheduler
 * Runs every 1st day of the month at 00:00 WIB
 */
function initializePaymentScheduler() {
  cron.schedule('0 0 1 * *', async () => {
    logger.info('[PaymentReset] Cron job triggered: Monthly payment status reset');
    await resetMonthlyPaymentStatus();
  }, {
    timezone: 'Asia/Jakarta'
  });

  logger.info('[PaymentReset] Scheduler initialized — runs 1st of every month at 00:00 WIB');
}

module.exports = {
  initializePaymentScheduler,
  resetMonthlyPaymentStatus
};
