
const mikrotikService = require('../../services/mikrotikService');

class WirelessController {
  async getWirelessInterfaces(req, res, next) {
    try {
      const interfaces = await mikrotikService.getWirelessInterfaces();
      res.json({ success: true, data: interfaces });
    } catch (error) {
      next(error);
    }
  }

  async getWirelessSecurityProfiles(req, res, next) {
    try {
      const profiles = await mikrotikService.getWirelessSecurityProfiles();
      res.json({ success: true, data: profiles });
    } catch (error) {
      next(error);
    }
  }

  async getWirelessRegistrationTable(req, res, next) {
    try {
      const table = await mikrotikService.getWirelessRegistrationTable();
      res.json({ success: true, data: table });
    } catch (error) {
      next(error);
    }
  }

  async scanWireless(req, res, next) {
    try {
      const { interface: interfaceName } = req.params;
      const result = await mikrotikService.scanWireless(interfaceName);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WirelessController();
