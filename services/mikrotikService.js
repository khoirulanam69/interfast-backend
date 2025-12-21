const { RouterOSAPI } = require('node-routeros');
const logger = require('../utils/logger');

class MikrotikService {
  constructor() {
    this.config = {
      host: process.env.MIKROTIK_IP,
      user: process.env.MIKROTIK_USERNAME,
      password: process.env.MIKROTIK_PASSWORD,
      port: parseInt(process.env.MIKROTIK_PORT) || 8728,
      timeout: 30000
    };
  }

  async connect() {
    const conn = new RouterOSAPI({
      host: this.config.host,
      user: this.config.user,
      password: this.config.password,
      port: this.config.port,
      timeout: this.config.timeout
    });

    await conn.connect();
    logger.info('Connected to MikroTik successfully');
    return conn;
  }

  async testConnection() {
    try {
      logger.info('Testing MikroTik connection...');
      const conn = await this.connect();
      
      const identity = await conn.write(['/system/identity/print']);
      logger.info('MikroTik Identity:', identity);
      
      conn.close();
      
      return { success: true, message: 'MikroTik connection successful', data: identity };
    } catch (error) {
      logger.error('MikroTik connection error:', error);
      return { 
        success: false, 
        message: `Connection failed: ${error.message}` 
      };
    }
  }

  async getSystemIdentity() {
    const conn = await this.connect();
    try {
      const identity = await conn.write(['/system/identity/print']);
      return identity;
    } finally {
      conn.close();
    }
  }

  async getSystemResource() {
    const conn = await this.connect();
    try {
      const resource = await conn.write(['/system/resource/print']);
      return resource;
    } finally {
      conn.close();
    }
  }

  async getSystemClock() {
    const conn = await this.connect();
    try {
      const clock = await conn.write(['/system/clock/print']);
      return clock;
    } finally {
      conn.close();
    }
  }

  async updateUserStatus(usernameDialer, status) {
    try {
      logger.info(`Updating MikroTik user status for ${usernameDialer} to ${status}`);
      
      const conn = await this.connect();

      // Remove any existing active connections
      try {
        const activeUsers = await conn.write([
          '/ppp/active/print',
          `?name=${usernameDialer}`
        ]);
        
        for (const activeUser of activeUsers) {
          await conn.write([
            '/ppp/active/remove',
            `=numbers=${activeUser['.id']}`
          ]);
        }
        logger.info(`Removed PPP active connections: ${usernameDialer}`);
      } catch (error) {
        logger.error('Error removing active connections:', error);
      }

      // Handle PPP secret based on status
      if (status === 'Inactive' || status === 'Terminate') {
        // Disable PPP secret
        try {
          const secrets = await conn.write([
            '/ppp/secret/print',
            `?name=${usernameDialer}`
          ]);
          
          if (secrets.length > 0) {
            await conn.write([
              '/ppp/secret/set',
              `=numbers=${secrets[0]['.id']}`,
              '=disabled=yes'
            ]);
            logger.info(`Disabled PPP secret: ${usernameDialer}`);
          } else {
            logger.info(`PPP secret not found: ${usernameDialer}`);
          }
        } catch (error) {
          logger.error('Error disabling PPP secret:', error);
          throw error;
        }
        
      } else if (status === 'Active') {
        // Enable PPP secret
        try {
          const secrets = await conn.write([
            '/ppp/secret/print',
            `?name=${usernameDialer}`
          ]);
          
          if (secrets.length > 0) {
            await conn.write([
              '/ppp/secret/set',
              `=numbers=${secrets[0]['.id']}`,
              '=disabled=no'
            ]);
            logger.info(`Enabled PPP secret: ${usernameDialer}`);
          } else {
            logger.info(`PPP secret not found: ${usernameDialer}`);
          }
        } catch (error) {
          logger.error('Error enabling PPP secret:', error);
          throw error;
        }
      }

      conn.close();
      return { success: true, message: `User ${usernameDialer} status updated to ${status}` };
      
    } catch (error) {
      logger.error('MikroTik API error:', error);
      throw new Error(`Failed to update MikroTik status: ${error.message}`);
    }
  }

  async regenerateUserCredentials(oldUsername, newUsername, newPassword, profile = 'Interfast Bronze') {
    try {
      logger.info(`Regenerating credentials from ${oldUsername} to ${newUsername} with profile ${profile}`);
      
      const conn = await this.connect();

      // Validate profile exists
      const validProfiles = ['Interfast Bronze', 'Interfast Silver', 'Interfast Gold', 'Interfast Platinum'];
      if (!validProfiles.includes(profile)) {
        logger.warn(`Invalid profile ${profile}, using default Interfast Bronze`);
        profile = 'Interfast Bronze';
      }

      // Remove active connections for old username
      try {
        const activeUsers = await conn.write([
          '/ppp/active/print',
          `?name=${oldUsername}`
        ]);
        
        for (const activeUser of activeUsers) {
          await conn.write([
            '/ppp/active/remove',
            `=numbers=${activeUser['.id']}`
          ]);
        }
        logger.info(`Removed PPP active connections for: ${oldUsername}`);
      } catch (error) {
        logger.error('Error removing active connections:', error);
      }

      // Find and update the existing PPP secret
      try {
        const secrets = await conn.write([
          '/ppp/secret/print',
          `?name=${oldUsername}`
        ]);
        
        if (secrets.length > 0) {
          // Update the existing secret
          await conn.write([
            '/ppp/secret/set',
            `=numbers=${secrets[0]['.id']}`,
            `=name=${newUsername}`,
            `=password=${newPassword}`,
            `=profile=${profile}`,
            '=disabled=no'
          ]);
          logger.info(`Updated PPP secret from ${oldUsername} to ${newUsername} with profile ${profile}`);
        } else {
          // Create new secret if old one doesn't exist
          await conn.write([
            '/ppp/secret/add',
            `=name=${newUsername}`,
            `=password=${newPassword}`,
            `=profile=${profile}`,
            '=service=pppoe',
            '=disabled=no'
          ]);
          logger.info(`Created new PPP secret: ${newUsername} with profile ${profile}`);
        }

        // Remove any active connections for the new username as well
        const newActiveUsers = await conn.write([
          '/ppp/active/print',
          `?name=${newUsername}`
        ]);
        
        for (const activeUser of newActiveUsers) {
          await conn.write([
            '/ppp/active/remove',
            `=numbers=${activeUser['.id']}`
          ]);
        }
        logger.info(`Removed PPP active connections for new username: ${newUsername}`);

      } catch (error) {
        logger.error('Error updating PPP secret:', error);
        throw error;
      }

      conn.close();
      return { success: true, message: `Credentials regenerated successfully for ${newUsername} with profile ${profile}` };
      
    } catch (error) {
      logger.error('Error regenerating credentials:', error);
      throw new Error(`Failed to regenerate credentials: ${error.message}`);
    }
  }

  async createPPPSecret(usernameDialer, password, profile = 'Interfast Bronze') {
    try {
      logger.info(`Creating PPP secret for ${usernameDialer} with profile ${profile}`);
      
      const conn = await this.connect();

      // Validate profile exists
      const validProfiles = ['Interfast Bronze', 'Interfast Silver', 'Interfast Gold', 'Interfast Platinum'];
      if (!validProfiles.includes(profile)) {
        logger.warn(`Invalid profile ${profile}, using default Interfast Bronze`);
        profile = 'Interfast Bronze';
      }

      // Check if secret already exists
      const existingSecrets = await conn.write([
        '/ppp/secret/print',
        `?name=${usernameDialer}`
      ]);

      if (existingSecrets.length === 0) {
        // Create new PPP secret
        await conn.write([
          '/ppp/secret/add',
          `=name=${usernameDialer}`,
          `=password=${password}`,
          `=profile=${profile}`,
          '=service=pppoe'
        ]);
        logger.info(`Created PPP secret: ${usernameDialer} with profile: ${profile}`);
      } else {
        logger.info(`PPP secret already exists: ${usernameDialer}`);
      }

      conn.close();
      return { success: true, message: `PPP secret ready for ${usernameDialer} with profile ${profile}` };
      
    } catch (error) {
      logger.error('Error creating PPP secret:', error);
      throw new Error(`Failed to create PPP secret: ${error.message}`);
    }
  }

  async removeUser(username) {
    try {
      const conn = await this.connect();

      // Remove active connections
      const activeUsers = await conn.write([
        '/ppp/active/print',
        `?name=${username}`
      ]);
      
      for (const activeUser of activeUsers) {
        await conn.write([
          '/ppp/active/remove',
          `=numbers=${activeUser['.id']}`
        ]);
      }

      // Remove PPP secret
      const secrets = await conn.write([
        '/ppp/secret/print',
        `?name=${username}`
      ]);
      
      if (secrets.length > 0) {
        await conn.write([
          '/ppp/secret/remove',
          `=numbers=${secrets[0]['.id']}`
        ]);
      }

      conn.close();
      return { success: true, message: `User ${username} removed successfully` };
    } catch (error) {
      logger.error('Error removing user:', error);
      throw new Error(`Failed to remove user: ${error.message}`);
    }
  }

  async deletePPPSecret(username) {
    try {
      logger.info(`Deleting PPP secret for ${username}`);
      const conn = await this.connect();

      // Find and remove PPP secret by username
      const secrets = await conn.write([
        '/ppp/secret/print',
        `?name=${username}`
      ]);
      
      if (secrets.length > 0) {
        await conn.write([
          '/ppp/secret/remove',
          `=numbers=${secrets[0]['.id']}`
        ]);
        logger.info(`PPP secret deleted for ${username}`);
      } else {
        logger.info(`PPP secret not found for ${username}`);
      }

      conn.close();
      return { success: true, message: `PPP secret deleted for ${username}` };
    } catch (error) {
      logger.error('Error deleting PPP secret:', error);
      throw new Error(`Failed to delete PPP secret: ${error.message}`);
    }
  }

  async disconnectPPPUser(username) {
    try {
      logger.info(`Disconnecting PPP user ${username}`);
      const conn = await this.connect();

      // Find and remove active connections by username
      const activeUsers = await conn.write([
        '/ppp/active/print',
        `?name=${username}`
      ]);
      
      for (const activeUser of activeUsers) {
        await conn.write([
          '/ppp/active/remove',
          `=numbers=${activeUser['.id']}`
        ]);
        logger.info(`Disconnected active connection for ${username}`);
      }

      conn.close();
      return { success: true, message: `PPP user ${username} disconnected` };
    } catch (error) {
      logger.error('Error disconnecting PPP user:', error);
      throw new Error(`Failed to disconnect PPP user: ${error.message}`);
    }
  }

  async getInterfaces() {
    const conn = await this.connect();
    try {
      const interfaces = await conn.write(['/interface/print']);
      return interfaces;
    } finally {
      conn.close();
    }
  }

  async getInterfaceDetails(name) {
    const conn = await this.connect();
    try {
      const details = await conn.write([
        '/interface/print',
        `?name=${name}`
      ]);
      return details[0] || null;
    } finally {
      conn.close();
    }
  }

  async enableInterface(name) {
    try {
      const conn = await this.connect();
      
      const interfaces = await conn.write([
        '/interface/print',
        `?name=${name}`
      ]);
      
      if (interfaces.length > 0) {
        await conn.write([
          '/interface/set',
          `=numbers=${interfaces[0]['.id']}`,
          '=disabled=no'
        ]);
      }

      conn.close();
      return { success: true, message: `Interface ${name} enabled` };
    } catch (error) {
      throw new Error(`Failed to enable interface: ${error.message}`);
    }
  }

  async disableInterface(name) {
    try {
      const conn = await this.connect();
      
      const interfaces = await conn.write([
        '/interface/print',
        `?name=${name}`
      ]);
      
      if (interfaces.length > 0) {
        await conn.write([
          '/interface/set',
          `=numbers=${interfaces[0]['.id']}`,
          '=disabled=yes'
        ]);
      }

      conn.close();
      return { success: true, message: `Interface ${name} disabled` };
    } catch (error) {
      throw new Error(`Failed to disable interface: ${error.message}`);
    }
  }

  async getPPPSecrets() {
    const conn = await this.connect();
    try {
      const secrets = await conn.write(['/ppp/secret/print']);
      return secrets;
    } finally {
      conn.close();
    }
  }

  async getActivePPPConnections() {
    const conn = await this.connect();
    try {
      const connections = await conn.write(['/ppp/active/print']);
      return connections;
    } finally {
      conn.close();
    }
  }

  async getPPPProfiles() {
    const conn = await this.connect();
    try {
      const profiles = await conn.write(['/ppp/profile/print']);
      return profiles;
    } finally {
      conn.close();
    }
  }

  async updatePPPSecret(name, updates) {
    try {
      const conn = await this.connect();
      
      const secrets = await conn.write([
        '/ppp/secret/print',
        `?name=${name}`
      ]);
      
      if (secrets.length > 0) {
        const setCommands = [
          '/ppp/secret/set',
          `=numbers=${secrets[0]['.id']}`
        ];
        
        Object.keys(updates).forEach(key => {
          setCommands.push(`=${key}=${updates[key]}`);
        });
        
        await conn.write(setCommands);
      }

      conn.close();
      return { success: true, message: `PPP secret ${name} updated` };
    } catch (error) {
      throw new Error(`Failed to update PPP secret: ${error.message}`);
    }
  }

  async deletePPPSecret(name) {
    try {
      const conn = await this.connect();
      
      const secrets = await conn.write([
        '/ppp/secret/print',
        `?name=${name}`
      ]);
      
      if (secrets.length > 0) {
        await conn.write([
          '/ppp/secret/remove',
          `=numbers=${secrets[0]['.id']}`
        ]);
      }

      conn.close();
      return { success: true, message: `PPP secret ${name} deleted` };
    } catch (error) {
      throw new Error(`Failed to delete PPP secret: ${error.message}`);
    }
  }

  async removeActiveConnection(id) {
    try {
      const conn = await this.connect();
      
      await conn.write([
        '/ppp/active/remove',
        `=numbers=${id}`
      ]);

      conn.close();
      return { success: true, message: `Active connection ${id} removed` };
    } catch (error) {
      throw new Error(`Failed to remove active connection: ${error.message}`);
    }
  }

  async getWirelessInterfaces() {
    const conn = await this.connect();
    try {
      const interfaces = await conn.write(['/interface/wireless/print']);
      return interfaces;
    } finally {
      conn.close();
    }
  }

  async getWirelessSecurityProfiles() {
    const conn = await this.connect();
    try {
      const profiles = await conn.write(['/interface/wireless/security-profiles/print']);
      return profiles;
    } finally {
      conn.close();
    }
  }

  async getWirelessRegistrationTable() {
    const conn = await this.connect();
    try {
      const table = await conn.write(['/interface/wireless/registration-table/print']);
      return table;
    } finally {
      conn.close();
    }
  }

  async scanWireless(interfaceName) {
    const conn = await this.connect();
    try {
      const result = await conn.write([
        '/interface/wireless/scan',
        `=interface=${interfaceName}`,
        '=duration=5'
      ]);
      return result;
    } finally {
      conn.close();
    }
  }

  async getIPAddresses() {
    const conn = await this.connect();
    try {
      const addresses = await conn.write(['/ip/address/print']);
      return addresses;
    } finally {
      conn.close();
    }
  }

  async getRoutes() {
    const conn = await this.connect();
    try {
      const routes = await conn.write(['/ip/route/print']);
      return routes;
    } finally {
      conn.close();
    }
  }

  async getDNSSettings() {
    const conn = await this.connect();
    try {
      const dns = await conn.write(['/ip/dns/print']);
      return dns;
    } finally {
      conn.close();
    }
  }

  async getDHCPServers() {
    const conn = await this.connect();
    try {
      const servers = await conn.write(['/ip/dhcp-server/print']);
      return servers;
    } finally {
      conn.close();
    }
  }

  async getFirewallRules() {
    const conn = await this.connect();
    try {
      const rules = await conn.write(['/ip/firewall/filter/print']);
      return rules;
    } finally {
      conn.close();
    }
  }

  async getSimpleQueues() {
    const conn = await this.connect();
    try {
      const queues = await conn.write(['/queue/simple/print']);
      return queues;
    } finally {
      conn.close();
    }
  }

  async getQueueTree() {
    const conn = await this.connect();
    try {
      const tree = await conn.write(['/queue/tree/print']);
      return tree;
    } finally {
      conn.close();
    }
  }

  async createSimpleQueue(queueData) {
    try {
      const conn = await this.connect();
      
      const addCommands = ['/queue/simple/add'];
      Object.keys(queueData).forEach(key => {
        addCommands.push(`=${key}=${queueData[key]}`);
      });
      
      await conn.write(addCommands);

      conn.close();
      return { success: true, message: 'Simple queue created successfully' };
    } catch (error) {
      throw new Error(`Failed to create simple queue: ${error.message}`);
    }
  }

  async updateSimpleQueue(id, updates) {
    try {
      const conn = await this.connect();
      
      const setCommands = [
        '/queue/simple/set',
        `=numbers=${id}`
      ];
      
      Object.keys(updates).forEach(key => {
        setCommands.push(`=${key}=${updates[key]}`);
      });
      
      await conn.write(setCommands);

      conn.close();
      return { success: true, message: `Simple queue ${id} updated` };
    } catch (error) {
      throw new Error(`Failed to update simple queue: ${error.message}`);
    }
  }

  async deleteSimpleQueue(id) {
    try {
      const conn = await this.connect();
      
      await conn.write([
        '/queue/simple/remove',
        `=numbers=${id}`
      ]);

      conn.close();
      return { success: true, message: `Simple queue ${id} deleted` };
    } catch (error) {
      throw new Error(`Failed to delete simple queue: ${error.message}`);
    }
  }

  async monitorInterfaceTraffic(interfaceName) {
    const conn = await this.connect();
    try {
      const traffic = await conn.write([
        '/interface/monitor-traffic',
        `=interface=${interfaceName}`,
        '=duration=1'
      ]);
      return traffic;
    } finally {
      conn.close();
    }
  }

  async monitorSystemResource() {
    const conn = await this.connect();
    try {
      const resource = await conn.write(['/system/resource/print']);
      return resource;
    } finally {
      conn.close();
    }
  }

  async getSystemLog(topics, limit = 100) {
    const conn = await this.connect();
    try {
      const commands = ['/log/print'];
      if (topics) {
        commands.push(`?topics=${topics}`);
      }
      if (limit) {
        commands.push(`=count=${limit}`);
      }
      
      const logs = await conn.write(commands);
      return logs;
    } finally {
      conn.close();
    }
  }
}

module.exports = new MikrotikService();
