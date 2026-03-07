const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');

// ==================== USERS ====================

// Get all users
router.get('/users', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user by ID
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user by NIK
router.get('/users/nik/:nik', async (req, res) => {
  try {
    const { nik } = req.params;
    const result = await db.query('SELECT * FROM users WHERE nik = $1', [nik]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching user by NIK:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create user
router.post('/users', async (req, res) => {
  try {
    const {
      nik, name, address, rt_rw, village, city, province, country,
      phone, package: pkg, price, referred_by, installation_date,
      expired_date, username_dial, password_pppoe, payment_status, user_status
    } = req.body;

    const result = await db.query(
      `INSERT INTO users (
        nik, name, address, rt_rw, village, city, province, country,
        phone, package, price, referred_by, installation_date, expired_date,
        username_dial, password_pppoe, payment_status, user_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *`,
      [
        nik, name, address, rt_rw, village, city, province, country || 'Indonesia',
        phone, pkg, price, referred_by || null,
        installation_date, expired_date, username_dial, password_pppoe,
        payment_status || 'Unpaid', user_status || 'Active'
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update user
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Build dynamic update query
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    
    const result = await db.query(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk insert users (for import)
router.post('/users/bulk', async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    
    const users = req.body.users;
    const insertedUsers = [];

    for (const user of users) {
      const result = await client.query(
        `INSERT INTO users (
          nik, name, address, rt_rw, village, city, province, country,
          phone, package, price, installation_date, expired_date,
          username_dial, payment_status, user_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          user.nik, user.name, user.address, user.rt_rw, user.village,
          user.city, user.province, user.country || 'Indonesia', user.phone,
          user.package, user.price, user.installation_date, user.expired_date,
          user.username_dial, user.payment_status || 'Paid', user.user_status || 'Active'
        ]
      );
      insertedUsers.push(result.rows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: insertedUsers, count: insertedUsers.length });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error bulk inserting users:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// ==================== PACKAGES ====================

// Get all packages
router.get('/packages', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM packages ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching packages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create package
router.post('/packages', async (req, res) => {
  try {
    const { name, bandwidth, price } = req.body;
    const result = await db.query(
      'INSERT INTO packages (name, bandwidth, price) VALUES ($1, $2, $3) RETURNING *',
      [name, bandwidth, price]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating package:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update package
router.put('/packages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, bandwidth, price } = req.body;
    const result = await db.query(
      'UPDATE packages SET name = $1, bandwidth = $2, price = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
      [name, bandwidth, price, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating package:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete package
router.delete('/packages/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM packages WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error deleting package:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== FINANCIAL TRANSACTIONS ====================

// Get transactions by month/year
router.get('/transactions', async (req, res) => {
  try {
    const { month, year } = req.query;
    
    let query = 'SELECT * FROM financial_transactions';
    const params = [];
    
    if (month && year) {
      const m = parseInt(month);
      const y = parseInt(year);
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      // Calculate last day without toISOString to avoid timezone shift
      const lastDay = new Date(y, m, 0).getDate();
      const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      query += ' WHERE transaction_date >= $1 AND transaction_date <= $2';
      params.push(startDate, endDate);
    }
    
    query += ' ORDER BY transaction_date DESC';
    
    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create transaction
router.post('/transactions', async (req, res) => {
  try {
    const { transaction_type, category, amount, description, transaction_date, user_id } = req.body;
    
    const result = await db.query(
      `INSERT INTO financial_transactions 
        (transaction_type, category, amount, description, transaction_date, user_id) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [transaction_type, category, amount, description || null, transaction_date, user_id || null]
    );

    // Update financial summary
    const date = new Date(transaction_date);
    await updateFinancialSummary(date.getMonth() + 1, date.getFullYear());

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating transaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update transaction
router.put('/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { transaction_type, category, amount, description, transaction_date } = req.body;
    
    const result = await db.query(
      `UPDATE financial_transactions 
       SET transaction_type = $1, category = $2, amount = $3, description = $4, 
           transaction_date = $5, updated_at = NOW() 
       WHERE id = $6 RETURNING *`,
      [transaction_type, category, amount, description, transaction_date, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    // Update financial summary
    const date = new Date(transaction_date);
    await updateFinancialSummary(date.getMonth() + 1, date.getFullYear());

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating transaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete transaction
router.delete('/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get transaction date first for summary update
    const txResult = await db.query('SELECT transaction_date FROM financial_transactions WHERE id = $1', [id]);
    
    const result = await db.query('DELETE FROM financial_transactions WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }

    // Update financial summary
    if (txResult.rows.length > 0) {
      const date = new Date(txResult.rows[0].transaction_date);
      await updateFinancialSummary(date.getMonth() + 1, date.getFullYear());
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error deleting transaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== FINANCIAL SUMMARY ====================

// Get financial summary
router.get('/financial-summary', async (req, res) => {
  try {
    const { month, year } = req.query;
    
    let query = 'SELECT * FROM financial_summary';
    const params = [];
    
    if (month && year) {
      query += ' WHERE month = $1 AND year = $2';
      params.push(parseInt(month), parseInt(year));
    } else if (year) {
      query += ' WHERE year = $1 ORDER BY month ASC';
      params.push(parseInt(year));
    }
    
    const result = await db.query(query, params);
    
    // Return single object if month/year specified
    if (month && year) {
      res.json({ success: true, data: result.rows[0] || null });
    } else {
      res.json({ success: true, data: result.rows });
    }
  } catch (error) {
    logger.error('Error fetching financial summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to update financial summary
async function updateFinancialSummary(month, year) {
  try {
    const lastDay = new Date(year, month, 0).getDate();
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Calculate totals using single query for accuracy
    const result = await db.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)::bigint as total_income,
         COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)::bigint as total_expense
       FROM financial_transactions 
       WHERE transaction_date >= $1 AND transaction_date <= $2`,
      [startDate, endDate]
    );

    const totalIncome = parseInt(result.rows[0].total_income);
    const totalExpense = parseInt(result.rows[0].total_expense);
    const netProfit = totalIncome - totalExpense;

    // Upsert summary
    await db.query(
      `INSERT INTO financial_summary (month, year, total_income, total_expense, net_profit)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (month, year) DO UPDATE SET
         total_income = EXCLUDED.total_income,
         total_expense = EXCLUDED.total_expense,
         net_profit = EXCLUDED.net_profit,
         updated_at = NOW()`,
      [month, year, totalIncome, totalExpense, netProfit]
    );
  } catch (error) {
    logger.error('Error updating financial summary:', error);
  }
}

// ==================== ANALYTICS ====================

// Get analytics data
router.get('/analytics', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM analytics ORDER BY year, month');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching analytics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DASHBOARD STATS ====================

// Get dashboard statistics
router.get('/stats/dashboard', async (req, res) => {
  try {
    const usersResult = await db.query(
      `SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE user_status = 'Active') as active_users,
        COUNT(*) FILTER (WHERE user_status = 'Inactive') as inactive_users,
        COALESCE(SUM(price) FILTER (WHERE user_status = 'Active' AND payment_status = 'Paid'), 0) as total_revenue
       FROM users`
    );

    res.json({
      success: true,
      data: {
        totalUsers: parseInt(usersResult.rows[0].total_users),
        activeUsers: parseInt(usersResult.rows[0].active_users),
        inactiveUsers: parseInt(usersResult.rows[0].inactive_users),
        totalRevenue: parseInt(usersResult.rows[0].total_revenue)
      }
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CRON JOBS ====================

// Reset monthly payment status
router.post('/cron/reset-payment-status', async (req, res) => {
  try {
    await db.query("UPDATE users SET payment_status = 'Unpaid' WHERE payment_status = 'Paid'");
    res.json({ success: true, message: 'Payment status reset completed' });
  } catch (error) {
    logger.error('Error resetting payment status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update expired users
router.post('/cron/update-expired-users', async (req, res) => {
  try {
    await db.query(
      "UPDATE users SET user_status = 'Inactive' WHERE expired_date < CURRENT_DATE AND user_status = 'Active'"
    );
    res.json({ success: true, message: 'Expired users updated' });
  } catch (error) {
    logger.error('Error updating expired users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
