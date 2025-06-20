
const mikrotikService = require('../services/mikrotikService');
const logger = require('../utils/logger');

class MikrotikController {
  // Connection and system methods
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

  // User management methods
  async updateUserStatus(req, res, next) {
    try {
      const { usernameDialer, status } = req.body;
      const result = await mikrotikService.updateUserStatus(usernameDialer, status);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async regenerateUserCredentials(req, res, next) {
    try {
      const { oldUsername, newUsername, newPassword, profile } = req.body;
      const result = await mikrotikService.regenerateUserCredentials(oldUsername, newUsername, newPassword, profile);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async createPPPSecret(req, res, next) {
    try {
      const { usernameDialer, password, profile } = req.body;
      const result = await mikrotikService.createPPPSecret(usernameDialer, password, profile);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async removeUser(req, res, next) {
    try {
      const { username } = req.params;
      const result = await mikrotikService.removeUser(username);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // Interface management methods
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

  // PPP management methods
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

  async deletePPPSecret(req, res, next) {
    try {
      const { name } = req.params;
      const result = await mikrotikService.deletePPPSecret(name);
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

  // Wireless management methods
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

  // IP management methods
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

  // Queue management methods
  async getSimpleQueues(req, res, next) {
    try {
      const queues = await mikrotikService.getSimpleQueues();
      res.json({ success: true, data: queues });
    } catch (error) {
      next(error);
    }
  }

  async getQueueTree(req, res, next) {
    try {
      const tree = await mikrotikService.getQueueTree();
      res.json({ success: true, data: tree });
    } catch (error) {
      next(error);
    }
  }

  async createSimpleQueue(req, res, next) {
    try {
      const queueData = req.body;
      const result = await mikrotikService.createSimpleQueue(queueData);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateSimpleQueue(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;
      const result = await mikrotikService.updateSimpleQueue(id, updates);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async deleteSimpleQueue(req, res, next) {
    try {
      const { id } = req.params;
      const result = await mikrotikService.deleteSimpleQueue(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  // Monitoring methods
  async monitorInterfaceTraffic(req, res, next) {
    try {
      const { interface: interfaceName } = req.params;
      const traffic = await mikrotikService.monitorInterfaceTraffic(interfaceName);
      res.json({ success: true, data: traffic });
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

module.exports = new MikrotikController();
