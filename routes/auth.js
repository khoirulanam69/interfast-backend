const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'interfast-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email dan password wajib diisi' });
    }

    const result = await db.query(
      'SELECT id, name, email, password, role FROM admin_users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info(`User logged in: ${user.email}`);

    res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      }
    });
  } catch (error) {
    logger.error('Login error:', error.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await db.query(
      'SELECT id, name, email, role FROM admin_users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User tidak ditemukan' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token tidak valid atau sudah expired' });
  }
});

// PUT /api/auth/account - Update account settings
router.put('/account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, currentPassword, newPassword } = req.body;

    if (!name && !email && !newPassword) {
      return res.status(400).json({ success: false, message: 'Tidak ada data yang diubah' });
    }

    // Get current user
    const userResult = await db.query('SELECT * FROM admin_users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }

    const currentUser = userResult.rows[0];

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Password saat ini wajib diisi untuk mengubah password' });
      }
      const isValid = await bcrypt.compare(currentPassword, currentUser.password);
      if (!isValid) {
        return res.status(401).json({ success: false, message: 'Password saat ini salah' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter' });
      }
    }

    // If changing email, check uniqueness
    const newEmail = email || currentUser.email;
    if (email && email !== currentUser.email) {
      const emailCheck = await db.query('SELECT id FROM admin_users WHERE email = $1 AND id != $2', [email, userId]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Email sudah digunakan oleh user lain' });
      }
    }

    // Build update
    const newName = name || currentUser.name;
    let passwordHash = currentUser.password;
    if (newPassword) {
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await db.query(
      'UPDATE admin_users SET name = $1, email = $2, password = $3 WHERE id = $4',
      [newName, newEmail, passwordHash, userId]
    );

    // Generate new token with updated info
    const updatedUser = { id: userId, name: newName, email: newEmail, role: currentUser.role };
    const token = jwt.sign(updatedUser, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    logger.info(`Account updated: ${newEmail}`);

    res.json({
      success: true,
      message: 'Akun berhasil diperbarui',
      data: { token, user: updatedUser }
    });
  } catch (error) {
    logger.error('Account update error:', error.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
});

// POST /api/auth/register - Register new admin user (protected)
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, dan password wajib diisi' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
    }

    // Check duplicate email
    const emailCheck = await db.query('SELECT id FROM admin_users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email sudah terdaftar' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userRole = role || 'admin';

    const result = await db.query(
      'INSERT INTO admin_users (name, email, password, role, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, name, email, role, created_at',
      [name, email, passwordHash, userRole]
    );

    logger.info(`New admin user registered: ${email} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'User berhasil dibuat',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Register error:', error.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email wajib diisi' });
    }

    const result = await db.query('SELECT id, email FROM admin_users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      // Don't reveal if email exists
      return res.json({ success: true, message: 'Jika email terdaftar, token reset telah dibuat' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Create password_resets table if not exists, then insert
    await db.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [result.rows[0].id, resetToken, resetExpiry]
    );

    logger.info(`Password reset token created for: ${email}, token: ${resetToken}`);

    res.json({
      success: true,
      message: 'Token reset password berhasil dibuat',
      data: { resetToken, expiresAt: resetExpiry }
    });
  } catch (error) {
    logger.error('Forgot password error:', error.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
});

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token dan password baru wajib diisi' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password minimal 6 karakter' });
    }

    const result = await db.query(
      'SELECT * FROM password_resets WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Token tidak valid atau sudah expired' });
    }

    const resetRecord = result.rows[0];
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await db.query('UPDATE admin_users SET password = $1 WHERE id = $2', [passwordHash, resetRecord.user_id]);
    await db.query('UPDATE password_resets SET used = TRUE WHERE id = $1', [resetRecord.id]);

    logger.info(`Password reset successful for user_id: ${resetRecord.user_id}`);

    res.json({ success: true, message: 'Password berhasil direset' });
  } catch (error) {
    logger.error('Reset password error:', error.message);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
});

module.exports = router;
