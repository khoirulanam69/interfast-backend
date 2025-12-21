const { createClient } = require("@supabase/supabase-js");
const mikrotikService = require("../services/mikrotikService");
const logger = require("../utils/logger");

// --- Supabase Initialization ---
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    // Get today's date (no grace period - disable exactly on expired date)
    const today = new Date().toISOString().split("T")[0];

    // Ambil user expired (expired_date <= today)
    const { data: expiredUsers, error: fetchError } = await supabase
      .from("users")
      .select("id, username_dial, name, expired_date")
      .eq("user_status", "Active")
      .lte("expired_date", today);

    if (fetchError) {
      logger.error("DB error fetching expired users", { error: fetchError.message });
      return { status: "error", message: fetchError.message };
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      logger.info("No expired users found.");
      return { status: "success", message: "No expired users." };
    }

    logger.info(`Found ${expiredUsers.length} expired users`, {
      users: expiredUsers,
    });

    const mikrotikQueue = [];

    // Update DB + queue MikroTik
    for (const user of expiredUsers) {
      const { id, username_dial } = user;

      // Update DB
      const { error: updateError } = await supabase
        .from("users")
        .update({ user_status: "Inactive" })
        .eq("id", id);

      if (updateError) {
        logger.error(`DB update failed for ${username_dial}`, { error: updateError.message });
        continue;
      }

      logger.info(`✓ User status set to Inactive in DB: ${username_dial}`);

      // Tambahkan ke queue update MikroTik
      mikrotikQueue.push(updateMikroTikStatus(username_dial, "Inactive"));
    }

    // Jalankan update MikroTik paralel
    await Promise.allSettled(mikrotikQueue);

    logger.info("=== Expired users deactivation complete ===");

    return { status: "success" };
  } catch (err) {
    logger.error("Fatal error in cron", { error: err.message, stack: err.stack });
    return { status: "error", message: err.message };
  }
}

module.exports = deactivateExpiredUsers;
