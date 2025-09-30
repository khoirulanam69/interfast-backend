const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://zughojwkppzecdejdwuk.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Reset all users' payment status to 'Unpaid'
 * This function is called automatically every month
 */
async function resetMonthlyPaymentStatus() {
  try {
    logger.info('Starting monthly payment status reset...');
    
    // Call the database function
    const { data, error } = await supabase.rpc('reset_monthly_payment_status');
    
    if (error) {
      logger.error('Error resetting payment status:', error);
      throw error;
    }
    
    logger.info('Successfully reset all payment statuses to Unpaid');
    
    // Optional: Get count of affected users
    const { count, error: countError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('payment_status', 'Unpaid');
    
    if (!countError) {
      logger.info(`Total users with Unpaid status: ${count}`);
    }
    
    return { success: true, message: 'Payment status reset completed' };
  } catch (error) {
    logger.error('Failed to reset monthly payment status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize payment scheduler
 * Runs every 1st day of the month at 00:00 (midnight)
 */
function initializePaymentScheduler() {
  // Cron expression: '0 0 1 * *' = At 00:00 on day 1 of every month
  // Format: second minute hour day-of-month month day-of-week
  const cronExpression = '0 0 1 * *';
  
  cron.schedule(cronExpression, async () => {
    logger.info('Cron job triggered: Monthly payment status reset');
    await resetMonthlyPaymentStatus();
  }, {
    timezone: "Asia/Jakarta" // Set to your timezone
  });
  
  logger.info('Payment scheduler initialized - Will run on 1st of every month at 00:00 WIB');
  
  // Optional: Run immediately on server start for testing (comment out in production)
  // logger.info('Running initial payment status check...');
  // resetMonthlyPaymentStatus();
}

module.exports = {
  initializePaymentScheduler,
  resetMonthlyPaymentStatus
};
