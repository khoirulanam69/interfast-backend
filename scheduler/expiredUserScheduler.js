const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const mikrotikService = require('../services/mikrotikService');

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
    await mikrotikService.updateUserStatus(username, status);
    console.log(`✓ MikroTik updated for user: ${username}`);
  } catch (error) {
    console.error(`✗ MikroTik update failed for ${username}:`, error.message);
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
    console.log('Starting expired users check...', new Date().toISOString());

    // Get all active users whose expired_date has passed
    const { data: expiredUsers, error: fetchError } = await supabase
      .from('users')
      .select('id, name, username_dial, expired_date')
      .eq('user_status', 'Active')
      .lt('expired_date', new Date().toISOString().split('T')[0]);

    if (fetchError) {
      console.error('Error fetching expired users:', fetchError);
      return;
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      console.log('No expired users found.');
      return;
    }

    console.log(`Found ${expiredUsers.length} expired users to deactivate.`);

    // Track results
    let dbSuccessCount = 0;
    let dbFailCount = 0;
    const mikrotikPromises = [];

    // Process all database updates first (fast and reliable)
    for (const user of expiredUsers) {
      try {
        console.log(`Deactivating user in DB: ${user.name} (${user.username_dial})`);

        // Update status in database to Inactive
        const { error: updateError } = await supabase
          .from('users')
          .update({ user_status: 'Inactive' })
          .eq('id', user.id);

        if (updateError) {
          console.error(`Failed to update database for user ${user.username_dial}:`, updateError);
          dbFailCount++;
          continue;
        }

        dbSuccessCount++;

        // Queue MikroTik update to run in background (non-blocking)
        // This won't stop the process if MikroTik is slow or fails
        mikrotikPromises.push(
          updateMikroTikStatus(user.username_dial, 'Inactive')
        );

      } catch (userError) {
        console.error(`Error processing user ${user.username_dial}:`, userError);
        dbFailCount++;
      }
    }

    console.log(`Database updates completed: ${dbSuccessCount} success, ${dbFailCount} failed`);
    console.log(`Queued ${mikrotikPromises.length} MikroTik updates to run in background...`);

    // Run all MikroTik updates in parallel (non-blocking)
    // Using Promise.allSettled to ensure all attempts complete regardless of failures
    if (mikrotikPromises.length > 0) {
      Promise.allSettled(mikrotikPromises)
        .then(results => {
          const successful = results.filter(r => r.status === 'fulfilled').length;
          const failed = results.filter(r => r.status === 'rejected').length;
          console.log(`MikroTik updates completed: ${successful} success, ${failed} failed`);
        })
        .catch(error => {
          console.error('Error in MikroTik batch update:', error);
        });
    }

    console.log('Expired users deactivation process completed.', new Date().toISOString());

  } catch (error) {
    console.error('Error in deactivateExpiredUsers:', error);
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

  console.log('Expired user scheduler initialized - will run daily at 00:30 Asia/Jakarta time');

  // Also run immediately on startup
  deactivateExpiredUsers();
}

module.exports = {
  initializeExpiredUserScheduler,
  deactivateExpiredUsers
};
