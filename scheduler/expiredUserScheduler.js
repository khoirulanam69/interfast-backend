const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const mikrotikService = require('../services/mikrotikService');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Check and deactivate expired users
 * - Updates user_status to 'Inactive' in database
 * - Disables user in MikroTik
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

    // Process each expired user
    for (const user of expiredUsers) {
      try {
        console.log(`Deactivating user: ${user.name} (${user.username_dial})`);

        // Update status in database to Inactive
        const { error: updateError } = await supabase
          .from('users')
          .update({ user_status: 'Inactive' })
          .eq('id', user.id);

        if (updateError) {
          console.error(`Failed to update database for user ${user.username_dial}:`, updateError);
          continue;
        }

        // Update status in MikroTik to Inactive
        try {
          await mikrotikService.updateUserStatus(user.username_dial, 'Inactive');
          console.log(`Successfully deactivated user in MikroTik: ${user.username_dial}`);
        } catch (mikrotikError) {
          console.error(`Failed to deactivate user in MikroTik ${user.username_dial}:`, mikrotikError.message);
          // Continue with next user even if MikroTik update fails
        }

      } catch (userError) {
        console.error(`Error processing user ${user.username_dial}:`, userError);
      }
    }

    console.log('Expired users deactivation completed.', new Date().toISOString());

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
