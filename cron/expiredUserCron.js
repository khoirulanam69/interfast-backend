const { query } = require("../config/database");
const mikrotikService = require("../services/mikrotikService");
const logger = require("../utils/logger");
const { DateTime } = require("luxon");

/**
 * Update MikroTik status
 */
async function updateMikroTikStatus(username, status) {
  try {
    logger.info(`Updating MikroTik for user: ${username}`);
    await mikrotikService.updateUserStatus(username, status);
    logger.info(`✓ MikroTik updated for ${username}`);
  } catch (error) {
    logger.error(`✗ MikroTik update failed for ${username}`, {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Deactivate expired users
 */
async function deactivateExpiredUsers() {
  logger.info("=== Cron: Checking expired users ===");

  try {
    const today = DateTime.now().setZone("Asia/Jakarta").toFormat("yyyy-MM-dd");

    // Fetch expired active users from PostgreSQL
    const result = await query(
      `SELECT id, username_dial, name, expired_date 
       FROM users 
       WHERE user_status = 'Active' AND expired_date + INTERVAL '1 day' < $1`,
      [today]
    );

    const expiredUsers = result.rows;

    if (!expiredUsers || expiredUsers.length === 0) {
      logger.info("No expired users found.");
      return { status: "success", message: "No expired users." };
    }

    logger.info(`Found ${expiredUsers.length} expired users`, {
      users: expiredUsers,
    });

    const mikrotikQueue = [];

    for (const user of expiredUsers) {
      const { id, username_dial } = user;

      try {
        await query(
          `UPDATE users SET user_status = 'Inactive', updated_at = NOW() WHERE id = $1`,
          [id]
        );
        logger.info(`✓ User status set to Inactive in DB: ${username_dial}`);
        mikrotikQueue.push(updateMikroTikStatus(username_dial, "Inactive"));
      } catch (updateError) {
        logger.error(`DB update failed for ${username_dial}`, { error: updateError.message });
      }
    }

    await Promise.allSettled(mikrotikQueue);

    logger.info("=== Expired users deactivation complete ===");
    return { status: "success" };
  } catch (err) {
    logger.error("Fatal error in cron", { error: err.message, stack: err.stack });
    return { status: "error", message: err.message };
  }
}

module.exports = deactivateExpiredUsers;
