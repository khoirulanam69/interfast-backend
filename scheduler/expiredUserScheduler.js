const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const mikrotikService = require('../services/mikrotikService');
const logger = require('../utils/logger');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Update user status in MikroTik (async, non-blocking)
 * This runs in background and won't block the main process
 */
async function updateMikroTikStatus(username, status) {
  try {
    logger.info(`Starting MikroTik update for user: ${username}`);
    await mikrotikService.updateUserStatus(username, status);
    logger.info(`✓ MikroTik updated successfully for user: ${username}`);
  } catch (error) {
    logger.error(`✗ MikroTik update failed for ${username}`, {
      error: error.message,
      stack: error.stack,
      username: username,
      status: status
    });
    // Log but don't throw - this shouldn't stop the process
  }
}

/**
 * Check and deactivate expired users
 * - Updates user_status to 'Inactive' in database (priority)
 * - Queues MikroTik updates to run asynchronously (non-blocking)
 */
async function deactivateExpiredUsers() {
  try {
    logger.info('=== Starting expired users check ===', { timestamp: new Date().toISOString() });

    // Get today's date (no grace period - disable exactly on expired date)
    const today = new Date().toISOString().split('T')[0];

    // Get all active users whose expired_date is today or in the past
    const { data: expiredUsers, error: fetchError } = await supabase
      .from('users')
      .select('id, name, username_dial, expired_date')
      .eq('user_status', 'Active')
      .lte('expired_date', today);

    if (fetchError) {
      logger.error('Error fetching expired users from database', {
        error: fetchError.message,
        details: fetchError
      });
      return;
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      logger.info('No expired users found.');
      return;
    }

    logger.info(`Found ${expiredUsers.length} expired users to deactivate`, {
      userCount: expiredUsers.length,
      users: expiredUsers.map(u => ({ id: u.id, username: u.username_dial, expired_date: u.expired_date }))
    });

    // Track results
    let dbSuccessCount = 0;
    let dbFailCount = 0;
    const mikrotikPromises = [];

    // Process all database updates first (fast and reliable)
    for (const user of expiredUsers) {
      try {
        logger.info(`Processing user: ${user.name} (${user.username_dial})`, {
          userId: user.id,
          username: user.username_dial,
          expiredDate: user.expired_date
        });

        // Update status in database to Inactive
        const { error: updateError } = await supabase
          .from('users')
          .update({ user_status: 'Inactive' })
          .eq('id', user.id);

        if (updateError) {
          logger.error(`Failed to update database for user ${user.username_dial}`, {
            error: updateError.message,
            details: updateError,
            userId: user.id,
            username: user.username_dial
          });
          dbFailCount++;
          continue;
        }

        logger.info(`✓ Database updated successfully for user: ${user.username_dial}`);
        dbSuccessCount++;

        // Queue MikroTik update to run in background (non-blocking)
        // This won't stop the process if MikroTik is slow or fails
        mikrotikPromises.push(
          updateMikroTikStatus(user.username_dial, 'Inactive')
        );

      } catch (userError) {
        logger.error(`Error processing user ${user.username_dial}`, {
          error: userError.message,
          stack: userError.stack,
          username: user.username_dial
        });
        dbFailCount++;
      }
    }

    logger.info(`Database updates completed`, {
      success: dbSuccessCount,
      failed: dbFailCount,
      total: expiredUsers.length
    });
    logger.info(`Queued ${mikrotikPromises.length} MikroTik updates to run in background`);

    // Run all MikroTik updates in parallel (non-blocking)
    // Using Promise.allSettled to ensure all attempts complete regardless of failures
    if (mikrotikPromises.length > 0) {
      Promise.allSettled(mikrotikPromises)
        .then(results => {
          const successful = results.filter(r => r.status === 'fulfilled').length;
          const failed = results.filter(r => r.status === 'rejected').length;
          logger.info(`MikroTik updates completed`, {
            successful: successful,
            failed: failed,
            total: results.length
          });
        })
        .catch(error => {
          logger.error('Error in MikroTik batch update', {
            error: error.message,
            stack: error.stack
          });
        });
    }

    logger.info('=== Expired users deactivation process completed ===', {
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Critical error in deactivateExpiredUsers', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Initialize the expired user scheduler
 * Runs every day at 00:30 (Jakarta time)
 */
function initializeExpiredUserScheduler() {
  // Schedule to run daily at 00:30 Asia/Jakarta time
  cron.schedule('30 0 * * *', deactivateExpiredUsers, {
    scheduled: true,
    timezone: 'Asia/Jakarta'
  });

  logger.info('Expired user scheduler initialized - will run daily at 00:30 Asia/Jakarta time');

  // Also run immediately on startup
  logger.info('Running expired user check on startup...');
  deactivateExpiredUsers();
}

module.exports = {
  initializeExpiredUserScheduler,
  deactivateExpiredUsers
};
