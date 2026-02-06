
const mikrotikService = require('../../services/mikrotikService');

class PPPController {
  async getPPPSecrets(req, res, next) {
    try {
      const secrets = await mikrotikService.getPPPSecrets();
      res.json({ success: true, data: secrets });
    } catch (error) {
      next(error);
    }
  }

  async getActivePPPConnections(req, res, next) {
    try {
      const connections = await mikrotikService.getActivePPPConnections();
      res.json({ success: true, data: connections });
    } catch (error) {
      next(error);
    }
  }

  async getPPPProfiles(req, res, next) {
    try {
      const profiles = await mikrotikService.getPPPProfiles();
      res.json({ success: true, data: profiles });
    } catch (error) {
      next(error);
    }
  }

  async updatePPPSecret(req, res, next) {
    try {
      const { name } = req.params;
      const updates = req.body;
      const result = await mikrotikService.updatePPPSecret(name, updates);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async removeActiveConnection(req, res, next) {
    try {
      const { id } = req.params;
      const result = await mikrotikService.removeActiveConnection(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PPPController();
