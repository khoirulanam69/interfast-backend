
const mikrotikService = require('../../services/mikrotikService');

class SystemController {
  async testConnection(req, res, next) {
    try {
      const result = await mikrotikService.testConnection();
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getSystemIdentity(req, res, next) {
    try {
      const identity = await mikrotikService.getSystemIdentity();
      res.json({ success: true, data: identity });
    } catch (error) {
      next(error);
    }
  }

  async getSystemResource(req, res, next) {
    try {
      const resource = await mikrotikService.getSystemResource();
      res.json({ success: true, data: resource });
    } catch (error) {
      next(error);
    }
  }

  async getSystemClock(req, res, next) {
    try {
      const clock = await mikrotikService.getSystemClock();
      res.json({ success: true, data: clock });
    } catch (error) {
      next(error);
    }
  }

  async monitorSystemResource(req, res, next) {
    try {
      const resource = await mikrotikService.monitorSystemResource();
      res.json({ success: true, data: resource });
    } catch (error) {
      next(error);
    }
  }

  async getSystemLog(req, res, next) {
    try {
      const { topics, limit } = req.query;
      const logs = await mikrotikService.getSystemLog(topics, limit);
      res.json({ success: true, data: logs });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SystemController();
