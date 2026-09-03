const cron = require('node-cron');
const { query } = require('../config/database');
const mikrotikService = require('../services/mikrotikService');
const logger = require('../utils/logger');
const { DateTime } = require('luxon');

async function updateMikroTikStatus(username, status) {
  try {
    logger.info(`Starting MikroTik update for user: ${username}`);
    await mikrotikService.updateUserStatus(username, status);
    logger.info(`MikroTik updated successfully for user: ${username}`);
  } catch (error) {
    logger.error(`MikroTik update failed for ${username}`, {
      error: error.message,
      stack: error.stack,
      username: username,
      status: status
    });
  }
}

async function deactivateExpiredUsers() {
  try {
    logger.info('=== Starting expired users check ===', { timestamp: new Date().toISOString() });
    const today = DateTime.now().setZone('Asia/Jakarta').toFormat('yyyy-MM-dd');
    const result = await query(
      `SELECT id, name, username_dial, expired_date FROM users WHERE user_status = 'Active' AND expired_date < $1`,
      [today]
    );
    const expiredUsers = result.rows;
    if (!expiredUsers || expiredUsers.length === 0) {
      logger.info('No expired users found.');
      return { status: 'success', message: 'No expired users.' };
    }
    logger.info(`Found ${expiredUsers.length} expired users to deactivate`, {
      userCount: expiredUsers.length,
      users: expiredUsers.map(u => ({ id: u.id, username: u.username_dial, expired_date: u.expired_date }))
    });
    let dbSuccessCount = 0;
    let dbFailCount = 0;
    const mikrotikPromises = [];
    for (const user of expiredUsers) {
      try {
        await query(`UPDATE users SET user_status = 'Inactive', updated_at = NOW() WHERE id = $1`, [user.id]);
        logger.info(`Database updated successfully for user: ${user.username_dial}`);
        dbSuccessCount++;
        mikrotikPromises.push(updateMikroTikStatus(user.username_dial, 'Inactive'));
      } catch (error) {
        logger.error(`Failed to update database for user ${user.username_dial}`, { error: error.message, userId: user.id });
        dbFailCount++;
      }
    }
    logger.info(`Database updates completed`, { success: dbSuccessCount, failed: dbFailCount, total: expiredUsers.length });
    if (mikrotikPromises.length > 0) {
      Promise.allSettled(mikrotikPromises).then(results => {
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        logger.info(`MikroTik updates completed`, { successful, failed, total: results.length });
      });
    }
    logger.info('=== Expired users deactivation process completed ===', { timestamp: new Date().toISOString() });
    return { status: 'success', deactivated: dbSuccessCount };
  } catch (error) {
    logger.error('Critical error in deactivateExpiredUsers', { error: error.message, stack: error.stack });
    return { status: 'error', message: error.message };
  }
}

function initializeExpiredUserScheduler() {
  cron.schedule('30 0 * * *', deactivateExpiredUsers, {
    scheduled: true,
    timezone: 'Asia/Jakarta'
  });
  logger.info('Expired user scheduler initialized - will run daily at 00:30 Asia/Jakarta time');
  logger.info('Running expired user check on startup...');
  deactivateExpiredUsers();
}

module.exports = {
  initializeExpiredUserScheduler,
  deactivateExpiredUsers
};
