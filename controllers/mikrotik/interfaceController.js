
const mikrotikService = require('../../services/mikrotikService');

class InterfaceController {
  async getInterfaces(req, res, next) {
    try {
      const interfaces = await mikrotikService.getInterfaces();
      res.json({ success: true, data: interfaces });
    } catch (error) {
      next(error);
    }
  }

  async getInterfaceDetails(req, res, next) {
    try {
      const { name } = req.params;
      const details = await mikrotikService.getInterfaceDetails(name);
      res.json({ success: true, data: details });
    } catch (error) {
      next(error);
    }
  }

  async enableInterface(req, res, next) {
    try {
      const { name } = req.params;
      const result = await mikrotikService.enableInterface(name);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async disableInterface(req, res, next) {
    try {
      const { name } = req.params;
      const result = await mikrotikService.disableInterface(name);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async monitorInterfaceTraffic(req, res, next) {
    try {
      const { interface: interfaceName } = req.params;
      const traffic = await mikrotikService.monitorInterfaceTraffic(interfaceName);
      res.json({ success: true, data: traffic });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InterfaceController();
