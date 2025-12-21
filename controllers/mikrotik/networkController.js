
const mikrotikService = require('../../services/mikrotikService');

class NetworkController {
  async getIPAddresses(req, res, next) {
    try {
      const addresses = await mikrotikService.getIPAddresses();
      res.json({ success: true, data: addresses });
    } catch (error) {
      next(error);
    }
  }

  async getRoutes(req, res, next) {
    try {
      const routes = await mikrotikService.getRoutes();
      res.json({ success: true, data: routes });
    } catch (error) {
      next(error);
    }
  }

  async getDNSSettings(req, res, next) {
    try {
      const dns = await mikrotikService.getDNSSettings();
      res.json({ success: true, data: dns });
    } catch (error) {
      next(error);
    }
  }

  async getDHCPServers(req, res, next) {
    try {
      const servers = await mikrotikService.getDHCPServers();
      res.json({ success: true, data: servers });
    } catch (error) {
      next(error);
    }
  }

  async getFirewallRules(req, res, next) {
    try {
      const rules = await mikrotikService.getFirewallRules();
      res.json({ success: true, data: rules });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NetworkController();
