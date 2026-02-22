const { RouterOSClient } = require('routeros-client');
const logger = require('../utils/logger');

/**
 * Retry utility for transient network errors
 */
async function withRetry(operation, description, retries = 3, delay = 1500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const msg = error.message || '';
      const isTransient =
        msg.includes('ECONNREFUSED') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNRESET') ||
        msg.includes('!empty') ||
        msg.includes('unknown reply') ||
        msg.includes('Timeout');

      if (isTransient && attempt < retries) {
        logger.warn(`[Retry ${attempt}/${retries}] ${description} failed: ${msg}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
}

class MikrotikService {
  constructor() {
    this.config = {
      host: process.env.MIKROTIK_IP,
      user: process.env.MIKROTIK_USERNAME,
      password: process.env.MIKROTIK_PASSWORD,
      port: parseInt(process.env.MIKROTIK_PORT) || 8728,
      timeout: 30
    };
  }

  /**
   * Create a new RouterOSClient instance and connect.
   * Returns { api, client } — caller MUST call api.close() in finally block.
   */
  async connect() {
    const api = new RouterOSClient({
      host: this.config.host,
      user: this.config.user,
      password: this.config.password,
      port: this.config.port,
      timeout: this.config.timeout,
      keepalive: true
    });

    const client = await api.connect();
    logger.info('Connected to MikroTik via routeros-client');
    return { api, client };
  }

  /**
   * Safely close the API connection
   */
  safeClose(api) {
    try {
      if (api) api.close();
    } catch (e) {
      logger.warn('Error closing MikroTik connection:', e.message);
    }
  }

  /**
   * Safe menu operation wrapper — catches !empty and unknown reply errors
   * for write operations and treats them as success.
   */
  async safeMenuOp(operation, description, isWriteOp = false) {
    try {
      logger.info(`MikroTik [${description}]: executing...`);
      const result = await operation();
      logger.info(`MikroTik [${description}]: success`);
      return result;
    } catch (error) {
      const msg = error.message || '';
      const isEmptyReply = msg.includes('!empty') || msg.includes('unknown reply');

      if (isEmptyReply && isWriteOp) {
        logger.warn(`MikroTik [${description}]: Got !empty reply for write op, treating as success`);
        return [];
      }

      logger.error(`MikroTik error [${description}]: ${msg}`);
      throw error;
    }
  }

  // ==================== SYSTEM ====================

  async testConnection() {
    let api;
    try {
      logger.info('Testing MikroTik connection...');
      ({ api } = await this.connect());
      return { success: true, message: 'MikroTik connection successful' };
    } catch (error) {
      logger.error('MikroTik connection error:', error);
      return { success: false, message: `Connection failed: ${error.message}` };
    } finally {
      this.safeClose(api);
    }
  }

  async getSystemIdentity() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      const result = await this.safeMenuOp(
        () => client.menu('/system/identity').getOnly(),
        'system-identity'
      );
      return result ? [result] : [];
    } finally {
      this.safeClose(api);
    }
  }

  async getSystemResource() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      const result = await this.safeMenuOp(
        () => client.menu('/system/resource').getOnly(),
        'system-resource'
      );
      return result ? [result] : [];
    } finally {
      this.safeClose(api);
    }
  }

  async getSystemClock() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      const result = await this.safeMenuOp(
        () => client.menu('/system/clock').getOnly(),
        'system-clock'
      );
      return result ? [result] : [];
    } finally {
      this.safeClose(api);
    }
  }

  // ==================== USER MANAGEMENT ====================

  async updateUserStatus(usernameDialer, status) {
    if (!usernameDialer || !status) {
      throw new Error('usernameDialer and status are required');
    }

    return withRetry(async () => {
      let api, client;
      try {
        logger.info(`Updating MikroTik user status for ${usernameDialer} to ${status}`);
        ({ api, client } = await this.connect());

        // Remove active connections first
        try {
          const activeMenu = client.menu('/ppp/active');
          const activeUsers = await this.safeMenuOp(
            () => activeMenu.where('name', usernameDialer).getAll(),
            `active-print-${usernameDialer}`
          );

          if (Array.isArray(activeUsers)) {
            for (const activeUser of activeUsers) {
              await this.safeMenuOp(
                () => activeUser.remove(),
                `active-remove-${usernameDialer}`,
                true
              );
            }
          }
          logger.info(`Removed PPP active connections: ${usernameDialer}`);
        } catch (error) {
          logger.warn('Error removing active connections (non-fatal):', error.message);
        }

        // Handle PPP secret based on status
        const secretMenu = client.menu('/ppp/secret');
        const secrets = await this.safeMenuOp(
          () => secretMenu.where('name', usernameDialer).getAll(),
          `secret-print-${usernameDialer}`
        );

        if (Array.isArray(secrets) && secrets.length > 0) {
          const secret = secrets[0];
          if (status === 'Inactive' || status === 'Terminate') {
            await this.safeMenuOp(
              () => secret.update({ disabled: 'yes' }),
              `secret-disable-${usernameDialer}`,
              true
            );
            logger.info(`Disabled PPP secret: ${usernameDialer}`);
          } else if (status === 'Active') {
            await this.safeMenuOp(
              () => secret.update({ disabled: 'no' }),
              `secret-enable-${usernameDialer}`,
              true
            );
            logger.info(`Enabled PPP secret: ${usernameDialer}`);
          }
        } else {
          logger.info(`PPP secret not found: ${usernameDialer}`);
        }

        return { success: true, message: `User ${usernameDialer} status updated to ${status}` };
      } finally {
        this.safeClose(api);
      }
    }, `updateUserStatus(${usernameDialer}, ${status})`);
  }

  async regenerateUserCredentials(oldUsername, newUsername, newPassword, profile) {
    if (!oldUsername || !newUsername || !newPassword || !profile) {
      throw new Error('oldUsername, newUsername, newPassword, and profile are all required');
    }

    return withRetry(async () => {
      let api, client;
      try {
        logger.info(`Regenerating credentials from ${oldUsername} to ${newUsername} with profile ${profile}`);
        ({ api, client } = await this.connect());

        // Remove active connections for old username
        try {
          const activeMenu = client.menu('/ppp/active');
          const activeUsers = await this.safeMenuOp(
            () => activeMenu.where('name', oldUsername).getAll(),
            `active-print-${oldUsername}`
          );
          if (Array.isArray(activeUsers)) {
            for (const activeUser of activeUsers) {
              await this.safeMenuOp(() => activeUser.remove(), `active-remove-${oldUsername}`, true);
            }
          }
        } catch (error) {
          logger.warn('Error removing active connections (non-fatal):', error.message);
        }

        // Find existing PPP secret
        const secretMenu = client.menu('/ppp/secret');
        const secrets = await this.safeMenuOp(
          () => secretMenu.where('name', oldUsername).getAll(),
          `secret-print-${oldUsername}`
        );

        if (Array.isArray(secrets) && secrets.length > 0) {
          // Update existing secret
          await this.safeMenuOp(
            () => secrets[0].update({
              name: newUsername,
              password: newPassword,
              profile: profile,
              disabled: 'no'
            }),
            `secret-update-${oldUsername}->${newUsername}`,
            true
          );
          logger.info(`Updated PPP secret from ${oldUsername} to ${newUsername} with profile ${profile}`);
        } else {
          // Create new secret if old one doesn't exist
          await this.safeMenuOp(
            () => secretMenu.add({
              name: newUsername,
              password: newPassword,
              profile: profile,
              service: 'pppoe',
              disabled: 'no'
            }),
            `secret-add-${newUsername}`,
            true
          );
          logger.info(`Created new PPP secret: ${newUsername} with profile ${profile}`);
        }

        // Remove active connections for new username
        try {
          const activeMenu = client.menu('/ppp/active');
          const newActiveUsers = await this.safeMenuOp(
            () => activeMenu.where('name', newUsername).getAll(),
            `active-print-${newUsername}`
          );
          if (Array.isArray(newActiveUsers)) {
            for (const au of newActiveUsers) {
              await this.safeMenuOp(() => au.remove(), `active-remove-${newUsername}`, true);
            }
          }
        } catch (error) {
          logger.warn('Error removing new active connections (non-fatal):', error.message);
        }

        return { success: true, message: `Credentials regenerated successfully for ${newUsername} with profile ${profile}` };
      } finally {
        this.safeClose(api);
      }
    }, `regenerateUserCredentials(${oldUsername}->${newUsername})`);
  }

  async createPPPSecret(usernameDialer, password, profile) {
    if (!usernameDialer || !password || !profile) {
      throw new Error('usernameDialer, password, and profile are all required');
    }

    return withRetry(async () => {
      let api, client;
      try {
        logger.info(`Creating PPP secret for ${usernameDialer} with profile ${profile}`);
        ({ api, client } = await this.connect());

        const secretMenu = client.menu('/ppp/secret');

        // Check if secret already exists
        const existingSecrets = await this.safeMenuOp(
          () => secretMenu.where('name', usernameDialer).getAll(),
          `secret-check-${usernameDialer}`
        );

        if (!Array.isArray(existingSecrets) || existingSecrets.length === 0) {
          await this.safeMenuOp(
            () => secretMenu.add({
              name: usernameDialer,
              password: password,
              profile: profile,
              service: 'pppoe'
            }),
            `secret-add-${usernameDialer}`,
            true
          );
          logger.info(`Created PPP secret: ${usernameDialer} with profile: ${profile}`);
        } else {
          // Secret exists, update it
          logger.info(`PPP secret already exists for ${usernameDialer}, updating profile to ${profile}`);
          await this.safeMenuOp(
            () => existingSecrets[0].update({
              password: password,
              profile: profile,
              disabled: 'no'
            }),
            `secret-update-existing-${usernameDialer}`,
            true
          );
        }

        return { success: true, message: `PPP secret ready for ${usernameDialer} with profile ${profile}` };
      } finally {
        this.safeClose(api);
      }
    }, `createPPPSecret(${usernameDialer})`);
  }

  async removeUser(username) {
    if (!username) throw new Error('username is required');

    return withRetry(async () => {
      let api, client;
      try {
        ({ api, client } = await this.connect());

        // Remove active connections
        try {
          const activeMenu = client.menu('/ppp/active');
          const activeUsers = await this.safeMenuOp(
            () => activeMenu.where('name', username).getAll(),
            `active-print-${username}`
          );
          if (Array.isArray(activeUsers)) {
            for (const au of activeUsers) {
              await this.safeMenuOp(() => au.remove(), `active-remove-${username}`, true);
            }
          }
        } catch (error) {
          logger.warn('Error removing active connections (non-fatal):', error.message);
        }

        // Remove PPP secret
        const secretMenu = client.menu('/ppp/secret');
        const secrets = await this.safeMenuOp(
          () => secretMenu.where('name', username).getAll(),
          `secret-print-${username}`
        );

        if (Array.isArray(secrets) && secrets.length > 0) {
          await this.safeMenuOp(
            () => secrets[0].remove(),
            `secret-remove-${username}`,
            true
          );
        }

        return { success: true, message: `User ${username} removed successfully` };
      } finally {
        this.safeClose(api);
      }
    }, `removeUser(${username})`);
  }

  async deletePPPSecret(username) {
    if (!username) throw new Error('username is required');

    return withRetry(async () => {
      let api, client;
      try {
        logger.info(`Deleting PPP secret for ${username}`);
        ({ api, client } = await this.connect());

        const secretMenu = client.menu('/ppp/secret');
        const secrets = await this.safeMenuOp(
          () => secretMenu.where('name', username).getAll(),
          `secret-print-${username}`
        );

        if (Array.isArray(secrets) && secrets.length > 0) {
          await this.safeMenuOp(
            () => secrets[0].remove(),
            `secret-remove-${username}`,
            true
          );
          logger.info(`PPP secret deleted for ${username}`);
        } else {
          logger.info(`PPP secret not found for ${username}`);
        }

        return { success: true, message: `PPP secret deleted for ${username}` };
      } finally {
        this.safeClose(api);
      }
    }, `deletePPPSecret(${username})`);
  }

  async disconnectPPPUser(username) {
    if (!username) throw new Error('username is required');

    return withRetry(async () => {
      let api, client;
      try {
        logger.info(`Disconnecting PPP user ${username}`);
        ({ api, client } = await this.connect());

        const activeMenu = client.menu('/ppp/active');
        const activeUsers = await this.safeMenuOp(
          () => activeMenu.where('name', username).getAll(),
          `active-print-${username}`
        );

        if (Array.isArray(activeUsers)) {
          for (const au of activeUsers) {
            await this.safeMenuOp(() => au.remove(), `active-remove-${username}`, true);
            logger.info(`Disconnected active connection for ${username}`);
          }
        }

        return { success: true, message: `PPP user ${username} disconnected` };
      } finally {
        this.safeClose(api);
      }
    }, `disconnectPPPUser(${username})`);
  }

  // ==================== INTERFACE MANAGEMENT ====================

  async getInterfaces() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/interface').getAll(),
        'interfaces-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async getInterfaceDetails(name) {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      const details = await this.safeMenuOp(
        () => client.menu('/interface').where('name', name).getAll(),
        `interface-detail-${name}`
      );
      return (Array.isArray(details) && details.length > 0) ? details[0] : null;
    } finally {
      this.safeClose(api);
    }
  }

  async enableInterface(name) {
    return withRetry(async () => {
      let api, client;
      try {
        ({ api, client } = await this.connect());
        const interfaces = await this.safeMenuOp(
          () => client.menu('/interface').where('name', name).getAll(),
          `interface-print-${name}`
        );
        if (Array.isArray(interfaces) && interfaces.length > 0) {
          await this.safeMenuOp(
            () => interfaces[0].update({ disabled: 'no' }),
            `interface-enable-${name}`,
            true
          );
        }
        return { success: true, message: `Interface ${name} enabled` };
      } finally {
        this.safeClose(api);
      }
    }, `enableInterface(${name})`);
  }

  async disableInterface(name) {
    return withRetry(async () => {
      let api, client;
      try {
        ({ api, client } = await this.connect());
        const interfaces = await this.safeMenuOp(
          () => client.menu('/interface').where('name', name).getAll(),
          `interface-print-${name}`
        );
        if (Array.isArray(interfaces) && interfaces.length > 0) {
          await this.safeMenuOp(
            () => interfaces[0].update({ disabled: 'yes' }),
            `interface-disable-${name}`,
            true
          );
        }
        return { success: true, message: `Interface ${name} disabled` };
      } finally {
        this.safeClose(api);
      }
    }, `disableInterface(${name})`);
  }

  // ==================== PPP MANAGEMENT ====================

  async getPPPSecrets() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/ppp/secret').getAll(),
        'ppp-secrets-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async getActivePPPConnections() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/ppp/active').getAll(),
        'ppp-active-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async getPPPProfiles() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/ppp/profile').getAll(),
        'ppp-profiles-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async updatePPPSecret(name, updates) {
    if (!name) throw new Error('name is required');

    return withRetry(async () => {
      let api, client;
      try {
        ({ api, client } = await this.connect());
        const secretMenu = client.menu('/ppp/secret');
        const secrets = await this.safeMenuOp(
          () => secretMenu.where('name', name).getAll(),
          `secret-print-${name}`
        );

        if (Array.isArray(secrets) && secrets.length > 0) {
          await this.safeMenuOp(
            () => secrets[0].update(updates),
            `secret-update-${name}`,
            true
          );
        }

        return { success: true, message: `PPP secret ${name} updated` };
      } finally {
        this.safeClose(api);
      }
    }, `updatePPPSecret(${name})`);
  }

  async removeActiveConnection(id) {
    return withRetry(async () => {
      let api, client;
      try {
        ({ api, client } = await this.connect());
        const activeMenu = client.menu('/ppp/active');
        const connections = await this.safeMenuOp(
          () => activeMenu.getAll(),
          'active-print-all'
        );

        if (Array.isArray(connections)) {
          const target = connections.find(c => c['.id'] === id || c.id === id);
          if (target) {
            await this.safeMenuOp(() => target.remove(), `active-remove-${id}`, true);
          }
        }

        return { success: true, message: `Active connection ${id} removed` };
      } finally {
        this.safeClose(api);
      }
    }, `removeActiveConnection(${id})`);
  }

  // ==================== WIRELESS MANAGEMENT ====================

  async getWirelessInterfaces() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/interface/wireless').getAll(),
        'wireless-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async getWirelessSecurityProfiles() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/interface/wireless/security-profiles').getAll(),
        'wireless-security-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async getWirelessRegistrationTable() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/interface/wireless/registration-table').getAll(),
        'wireless-reg-table'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async scanWireless(interfaceName) {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      // scanWireless uses raw write since routeros-client menu doesn't support scan directly
      return await this.safeMenuOp(
        () => client.write(['/interface/wireless/scan', `=interface=${interfaceName}`, '=duration=5']),
        `wireless-scan-${interfaceName}`
      );
    } catch (error) {
      logger.warn(`Wireless scan not supported or failed: ${error.message}`);
      return [];
    } finally {
      this.safeClose(api);
    }
  }

  // ==================== IP & NETWORK ====================

  async getIPAddresses() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/ip/address').getAll(),
        'ip-address-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async getRoutes() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/ip/route').getAll(),
        'ip-route-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async getDNSSettings() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      const result = await this.safeMenuOp(
        () => client.menu('/ip/dns').getOnly(),
        'dns-print'
      );
      return result ? [result] : [];
    } finally {
      this.safeClose(api);
    }
  }

  async getDHCPServers() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/ip/dhcp-server').getAll(),
        'dhcp-server-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async getFirewallRules() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/ip/firewall/filter').getAll(),
        'firewall-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  // ==================== QUEUE MANAGEMENT ====================

  async getSimpleQueues() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/queue/simple').getAll(),
        'queue-simple-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async getQueueTree() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      return await this.safeMenuOp(
        () => client.menu('/queue/tree').getAll(),
        'queue-tree-print'
      );
    } finally {
      this.safeClose(api);
    }
  }

  async createSimpleQueue(queueData) {
    return withRetry(async () => {
      let api, client;
      try {
        ({ api, client } = await this.connect());
        await this.safeMenuOp(
          () => client.menu('/queue/simple').add(queueData),
          'queue-simple-add',
          true
        );
        return { success: true, message: 'Simple queue created successfully' };
      } finally {
        this.safeClose(api);
      }
    }, 'createSimpleQueue');
  }

  async updateSimpleQueue(id, updates) {
    return withRetry(async () => {
      let api, client;
      try {
        ({ api, client } = await this.connect());
        const queues = await this.safeMenuOp(
          () => client.menu('/queue/simple').getAll(),
          'queue-simple-print'
        );

        if (Array.isArray(queues)) {
          const target = queues.find(q => q['.id'] === id || q.id === id);
          if (target) {
            await this.safeMenuOp(
              () => target.update(updates),
              `queue-simple-update-${id}`,
              true
            );
          }
        }

        return { success: true, message: `Simple queue ${id} updated` };
      } finally {
        this.safeClose(api);
      }
    }, `updateSimpleQueue(${id})`);
  }

  async deleteSimpleQueue(id) {
    return withRetry(async () => {
      let api, client;
      try {
        ({ api, client } = await this.connect());
        const queues = await this.safeMenuOp(
          () => client.menu('/queue/simple').getAll(),
          'queue-simple-print'
        );

        if (Array.isArray(queues)) {
          const target = queues.find(q => q['.id'] === id || q.id === id);
          if (target) {
            await this.safeMenuOp(
              () => target.remove(),
              `queue-simple-delete-${id}`,
              true
            );
          }
        }

        return { success: true, message: `Simple queue ${id} deleted` };
      } finally {
        this.safeClose(api);
      }
    }, `deleteSimpleQueue(${id})`);
  }

  // ==================== MONITORING ====================

  async monitorInterfaceTraffic(interfaceName) {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      // monitor-traffic requires raw API write
      return await this.safeMenuOp(
        () => client.write(['/interface/monitor-traffic', `=interface=${interfaceName}`, '=duration=1']),
        `monitor-traffic-${interfaceName}`
      );
    } catch (error) {
      logger.warn(`Monitor traffic failed: ${error.message}`);
      return [];
    } finally {
      this.safeClose(api);
    }
  }

  async monitorSystemResource() {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      const result = await this.safeMenuOp(
        () => client.menu('/system/resource').getOnly(),
        'monitor-resource'
      );
      return result ? [result] : [];
    } finally {
      this.safeClose(api);
    }
  }

  async getSystemLog(topics, limit = 100) {
    let api, client;
    try {
      ({ api, client } = await this.connect());
      const logMenu = client.menu('/log');
      let result;
      if (topics) {
        result = await this.safeMenuOp(
          () => logMenu.where('topics', topics).getAll(),
          'system-log'
        );
      } else {
        result = await this.safeMenuOp(
          () => logMenu.getAll(),
          'system-log'
        );
      }
      // Limit results
      if (Array.isArray(result) && result.length > limit) {
        return result.slice(0, limit);
      }
      return result || [];
    } finally {
      this.safeClose(api);
    }
  }
}

module.exports = new MikrotikService();
