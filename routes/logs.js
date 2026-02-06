const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Get error logs
router.get('/error', (req, res) => {
  try {
    const logPath = path.join(__dirname, '../logs/error.log');
    
    if (!fs.existsSync(logPath)) {
      return res.json({ 
        success: true, 
        logs: [],
        message: 'No error logs found yet' 
      });
    }

    const logContent = fs.readFileSync(logPath, 'utf-8');
    const logs = logContent.split('\n').filter(line => line.trim()).reverse(); // Most recent first
    
    res.json({ 
      success: true, 
      logs: logs.slice(0, 1000) // Limit to last 1000 lines
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to read error logs',
      error: error.message 
    });
  }
});

// Get combined logs
router.get('/combined', (req, res) => {
  try {
    const logPath = path.join(__dirname, '../logs/combined.log');
    
    if (!fs.existsSync(logPath)) {
      return res.json({ 
        success: true, 
        logs: [],
        message: 'No combined logs found yet' 
      });
    }

    const logContent = fs.readFileSync(logPath, 'utf-8');
    const logs = logContent.split('\n').filter(line => line.trim()).reverse(); // Most recent first
    
    res.json({ 
      success: true, 
      logs: logs.slice(0, 1000) // Limit to last 1000 lines
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to read combined logs',
      error: error.message 
    });
  }
});

// Clear logs
router.delete('/clear/:type', (req, res) => {
  try {
    const { type } = req.params;
    const logPath = path.join(__dirname, '../logs', `${type}.log`);
    
    if (fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '');
      res.json({ 
        success: true, 
        message: `${type} logs cleared successfully` 
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Log file does not exist' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to clear logs',
      error: error.message 
    });
  }
});

module.exports = router;
