const { RouterOSAPI } = require('node-routeros');
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
        msg.includes('Timeout') ||
        msg.includes('Socket got disconnected');

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
   * Create a new RouterOSAPI connection.
   * Returns the connected conn — caller MUST call safeClose(conn) in finally block.
   */
  async connect() {
    const conn = new RouterOSAPI({
      host: this.config.host,
      user: this.config.user,
      password: this.config.password,
      port: this.config.port,
      timeout: this.config.timeout
    });

    await conn.connect();
    logger.info('Connected to MikroTik via node-routeros');
    return conn;
  }

  /**
   * Safely close the connection
   */
  safeClose(conn) {
    try {
      if (conn) conn.close();
    } catch (e) {
      logger.warn('Error closing MikroTik connection:', e.message);
    }
  }

  /**
   * Execute a write command with logging and error handling.
   * For write operations (add/set/remove), empty responses or certain errors are treated as success.
   */
  async execute(conn, command, params = [], description = '', isWriteOp = false) {
    try {
      logger.info(`MikroTik [${description}]: executing ${command}...`);
      const args = Array.isArray(params) && params.length > 0 ? [command, ...params] : command;
      const result = await conn.write(args);
      logger.info(`MikroTik [${description}]: success (${Array.isArray(result) ? result.length : 0} items)`);
      return result || [];
    } catch (error) {
      const msg = error.message || '';

      // For write ops, treat "no such item" or empty errors as non-fatal
      if (isWriteOp && (msg.includes('no such item') || msg.includes('already have'))) {
        logger.warn(`MikroTik [${description}]: ${msg} — treating as handled`);
        return [];
      }

      logger.error(`MikroTik error [${description}]: ${msg}`);
      throw error;
    }
  }

  /**
   * Helper: find item .id by filtering a menu print with a field=value match.
   */
  async findItemId(conn, menu, field, value, description) {
    const items = await this.execute(conn, `${menu}/print`, [`?${field}=${value}`], description);
    if (Array.isArray(items) && items.length > 0) {
      return { id: items[0]['.id'], item: items[0], items };
    }
    return { id: null, item: null, items: items || [] };
  }

  // ==================== SYSTEM ====================

  async testConnection() {
    let conn;
    try {
      logger.info('Testing MikroTik connection...');
      conn = await this.connect();
      return { success: true, message: 'MikroTik connection successful' };
    } catch (error) {
      logger.error('MikroTik connection error:', error);
      return { success: false, message: `Connection failed: ${error.message}` };
    } finally {
      this.safeClose(conn);
    }
  }

  async getSystemIdentity() {
    let conn;
    try {
      conn = await this.connect();
      const result = await this.execute(conn, '/system/identity/print', [], 'system-identity');
      return result || [];
    } finally {
      this.safeClose(conn);
    }
  }

  async getSystemResource() {
    let conn;
    try {
      conn = await this.connect();
      const result = await this.execute(conn, '/system/resource/print', [], 'system-resource');
      return result || [];
    } finally {
      this.safeClose(conn);
    }
  }

  async getSystemClock() {
    let conn;
    try {
      conn = await this.connect();
      const result = await this.execute(conn, '/system/clock/print', [], 'system-clock');
      return result || [];
    } finally {
      this.safeClose(conn);
    }
  }

  // ==================== USER MANAGEMENT ====================

  async updateUserStatus(usernameDialer, status) {
    if (!usernameDialer || !status) {
      throw new Error('usernameDialer and status are required');
    }

    return withRetry(async () => {
      let conn;
      try {
        logger.info(`Updating MikroTik user status for ${usernameDialer} to ${status}`);
        conn = await this.connect();

        // Remove active connections first
        try {
          const activeItems = await this.execute(
            conn, '/ppp/active/print', [`?name=${usernameDialer}`],
            `active-print-${usernameDialer}`
          );
          if (Array.isArray(activeItems)) {
            for (const item of activeItems) {
              if (item['.id']) {
                await this.execute(
                  conn, '/ppp/active/remove', [`=.id=${item['.id']}`],
                  `active-remove-${usernameDialer}`, true
                );
              }
            }
          }
          logger.info(`Removed PPP active connections: ${usernameDialer}`);
        } catch (error) {
          logger.warn('Error removing active connections (non-fatal):', error.message);
        }

        // Handle PPP secret based on status
        const { id } = await this.findItemId(conn, '/ppp/secret', 'name', usernameDialer, `secret-print-${usernameDialer}`);

        if (id) {
          if (status === 'Inactive' || status === 'Terminate') {
            await this.execute(
              conn, '/ppp/secret/set', [`=.id=${id}`, '=disabled=yes'],
              `secret-disable-${usernameDialer}`, true
            );
            logger.info(`Disabled PPP secret: ${usernameDialer}`);
          } else if (status === 'Active') {
            await this.execute(
              conn, '/ppp/secret/set', [`=.id=${id}`, '=disabled=no'],
              `secret-enable-${usernameDialer}`, true
            );
            logger.info(`Enabled PPP secret: ${usernameDialer}`);
          }
        } else {
          logger.info(`PPP secret not found: ${usernameDialer}`);
        }

        return { success: true, message: `User ${usernameDialer} status updated to ${status}` };
      } finally {
        this.safeClose(conn);
      }
    }, `updateUserStatus(${usernameDialer}, ${status})`);
  }

  async regenerateUserCredentials(oldUsername, newUsername, newPassword, profile) {
    if (!oldUsername || !newUsername || !newPassword || !profile) {
      throw new Error('oldUsername, newUsername, newPassword, and profile are all required');
    }

    return withRetry(async () => {
      let conn;
      try {
        logger.info(`Regenerating credentials from ${oldUsername} to ${newUsername} with profile ${profile}`);
        conn = await this.connect();

        // Remove active connections for old username
        try {
          const activeItems = await this.execute(
            conn, '/ppp/active/print', [`?name=${oldUsername}`],
            `active-print-${oldUsername}`
          );
          if (Array.isArray(activeItems)) {
            for (const item of activeItems) {
              if (item['.id']) {
                await this.execute(conn, '/ppp/active/remove', [`=.id=${item['.id']}`], `active-remove-${oldUsername}`, true);
              }
            }
          }
        } catch (error) {
          logger.warn('Error removing active connections (non-fatal):', error.message);
        }

        // Find existing PPP secret
        const { id } = await this.findItemId(conn, '/ppp/secret', 'name', oldUsername, `secret-print-${oldUsername}`);

        if (id) {
          // Update existing secret
          await this.execute(
            conn, '/ppp/secret/set',
            [`=.id=${id}`, `=name=${newUsername}`, `=password=${newPassword}`, `=profile=${profile}`, '=disabled=no'],
            `secret-update-${oldUsername}->${newUsername}`, true
          );
          logger.info(`Updated PPP secret from ${oldUsername} to ${newUsername} with profile ${profile}`);
        } else {
          // Create new secret if old one doesn't exist
          await this.execute(
            conn, '/ppp/secret/add',
            [`=name=${newUsername}`, `=password=${newPassword}`, `=profile=${profile}`, '=service=pppoe', '=disabled=no'],
            `secret-add-${newUsername}`, true
          );
          logger.info(`Created new PPP secret: ${newUsername} with profile ${profile}`);
        }

        // Remove active connections for new username
        try {
          const newActiveItems = await this.execute(
            conn, '/ppp/active/print', [`?name=${newUsername}`],
            `active-print-${newUsername}`
          );
          if (Array.isArray(newActiveItems)) {
            for (const item of newActiveItems) {
              if (item['.id']) {
                await this.execute(conn, '/ppp/active/remove', [`=.id=${item['.id']}`], `active-remove-${newUsername}`, true);
              }
            }
          }
        } catch (error) {
          logger.warn('Error removing new active connections (non-fatal):', error.message);
        }

        return { success: true, message: `Credentials regenerated successfully for ${newUsername} with profile ${profile}` };
      } finally {
        this.safeClose(conn);
      }
    }, `regenerateUserCredentials(${oldUsername}->${newUsername})`);
  }

  async createPPPSecret(usernameDialer, password, profile) {
    if (!usernameDialer || !password || !profile) {
      throw new Error('usernameDialer, password, and profile are all required');
    }

    return withRetry(async () => {
      let conn;
      try {
        logger.info(`Creating PPP secret for ${usernameDialer} with profile ${profile}`);
        conn = await this.connect();

        // Check if secret already exists
        const { id } = await this.findItemId(conn, '/ppp/secret', 'name', usernameDialer, `secret-check-${usernameDialer}`);

        if (!id) {
          await this.execute(
            conn, '/ppp/secret/add',
            [`=name=${usernameDialer}`, `=password=${password}`, `=profile=${profile}`, '=service=pppoe'],
            `secret-add-${usernameDialer}`, true
          );
          logger.info(`Created PPP secret: ${usernameDialer} with profile: ${profile}`);
        } else {
          // Secret exists, update it
          logger.info(`PPP secret already exists for ${usernameDialer}, updating profile to ${profile}`);
          await this.execute(
            conn, '/ppp/secret/set',
            [`=.id=${id}`, `=password=${password}`, `=profile=${profile}`, '=disabled=no'],
            `secret-update-existing-${usernameDialer}`, true
          );
        }

        return { success: true, message: `PPP secret ready for ${usernameDialer} with profile ${profile}` };
      } finally {
        this.safeClose(conn);
      }
    }, `createPPPSecret(${usernameDialer})`);
  }

  async removeUser(username) {
    if (!username) throw new Error('username is required');

    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();

        // Remove active connections
        try {
          const activeItems = await this.execute(
            conn, '/ppp/active/print', [`?name=${username}`],
            `active-print-${username}`
          );
          if (Array.isArray(activeItems)) {
            for (const item of activeItems) {
              if (item['.id']) {
                await this.execute(conn, '/ppp/active/remove', [`=.id=${item['.id']}`], `active-remove-${username}`, true);
              }
            }
          }
        } catch (error) {
          logger.warn('Error removing active connections (non-fatal):', error.message);
        }

        // Remove PPP secret
        const { id } = await this.findItemId(conn, '/ppp/secret', 'name', username, `secret-print-${username}`);
        if (id) {
          await this.execute(
            conn, '/ppp/secret/remove', [`=.id=${id}`],
            `secret-remove-${username}`, true
          );
        }

        return { success: true, message: `User ${username} removed successfully` };
      } finally {
        this.safeClose(conn);
      }
    }, `removeUser(${username})`);
  }

  async deletePPPSecret(username) {
    if (!username) throw new Error('username is required');

    return withRetry(async () => {
      let conn;
      try {
        logger.info(`Deleting PPP secret for ${username}`);
        conn = await this.connect();

        const { id } = await this.findItemId(conn, '/ppp/secret', 'name', username, `secret-print-${username}`);
        if (id) {
          await this.execute(
            conn, '/ppp/secret/remove', [`=.id=${id}`],
            `secret-remove-${username}`, true
          );
          logger.info(`PPP secret deleted for ${username}`);
        } else {
          logger.info(`PPP secret not found for ${username}`);
        }

        return { success: true, message: `PPP secret deleted for ${username}` };
      } finally {
        this.safeClose(conn);
      }
    }, `deletePPPSecret(${username})`);
  }

  async disconnectPPPUser(username) {
    if (!username) throw new Error('username is required');

    return withRetry(async () => {
      let conn;
      try {
        logger.info(`Disconnecting PPP user ${username}`);
        conn = await this.connect();

        const activeItems = await this.execute(
          conn, '/ppp/active/print', [`?name=${username}`],
          `active-print-${username}`
        );

        if (Array.isArray(activeItems)) {
          for (const item of activeItems) {
            if (item['.id']) {
              await this.execute(conn, '/ppp/active/remove', [`=.id=${item['.id']}`], `active-remove-${username}`, true);
              logger.info(`Disconnected active connection for ${username}`);
            }
          }
        }

        return { success: true, message: `PPP user ${username} disconnected` };
      } finally {
        this.safeClose(conn);
      }
    }, `disconnectPPPUser(${username})`);
  }

  // ==================== INTERFACE MANAGEMENT ====================

  async getInterfaces() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/interface/print', [], 'interfaces-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async getInterfaceDetails(name) {
    let conn;
    try {
      conn = await this.connect();
      const { item } = await this.findItemId(conn, '/interface', 'name', name, `interface-detail-${name}`);
      return item;
    } finally {
      this.safeClose(conn);
    }
  }

  async enableInterface(name) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        const { id } = await this.findItemId(conn, '/interface', 'name', name, `interface-print-${name}`);
        if (id) {
          await this.execute(conn, '/interface/set', [`=.id=${id}`, '=disabled=no'], `interface-enable-${name}`, true);
        }
        return { success: true, message: `Interface ${name} enabled` };
      } finally {
        this.safeClose(conn);
      }
    }, `enableInterface(${name})`);
  }

  async disableInterface(name) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        const { id } = await this.findItemId(conn, '/interface', 'name', name, `interface-print-${name}`);
        if (id) {
          await this.execute(conn, '/interface/set', [`=.id=${id}`, '=disabled=yes'], `interface-disable-${name}`, true);
        }
        return { success: true, message: `Interface ${name} disabled` };
      } finally {
        this.safeClose(conn);
      }
    }, `disableInterface(${name})`);
  }

  // ==================== PPP MANAGEMENT ====================

  async getPPPSecrets() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/ppp/secret/print', [], 'ppp-secrets-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async getActivePPPConnections() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/ppp/active/print', [], 'ppp-active-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async getPPPProfiles() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/ppp/profile/print', [], 'ppp-profiles-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async updatePPPSecret(name, updates) {
    if (!name) throw new Error('name is required');

    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        const { id } = await this.findItemId(conn, '/ppp/secret', 'name', name, `secret-print-${name}`);

        if (id) {
          const params = [`=.id=${id}`];
          for (const [key, value] of Object.entries(updates)) {
            params.push(`=${key}=${value}`);
          }
          await this.execute(conn, '/ppp/secret/set', params, `secret-update-${name}`, true);
        }

        return { success: true, message: `PPP secret ${name} updated` };
      } finally {
        this.safeClose(conn);
      }
    }, `updatePPPSecret(${name})`);
  }

  async removeActiveConnection(id) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        await this.execute(conn, '/ppp/active/remove', [`=.id=${id}`], `active-remove-${id}`, true);
        return { success: true, message: `Active connection ${id} removed` };
      } finally {
        this.safeClose(conn);
      }
    }, `removeActiveConnection(${id})`);
  }

  // ==================== WIRELESS MANAGEMENT ====================

  async getWirelessInterfaces() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/interface/wireless/print', [], 'wireless-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async getWirelessSecurityProfiles() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/interface/wireless/security-profiles/print', [], 'wireless-security-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async getWirelessRegistrationTable() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/interface/wireless/registration-table/print', [], 'wireless-reg-table');
    } finally {
      this.safeClose(conn);
    }
  }

  async scanWireless(interfaceName) {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(
        conn, '/interface/wireless/scan',
        [`=interface=${interfaceName}`, '=duration=5'],
        `wireless-scan-${interfaceName}`
      );
    } catch (error) {
      logger.warn(`Wireless scan not supported or failed: ${error.message}`);
      return [];
    } finally {
      this.safeClose(conn);
    }
  }

  // ==================== IP & NETWORK ====================

  async getIPAddresses() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/ip/address/print', [], 'ip-address-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async getRoutes() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/ip/route/print', [], 'ip-route-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async getDNSSettings() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/ip/dns/print', [], 'dns-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async getDHCPServers() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/ip/dhcp-server/print', [], 'dhcp-server-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async getFirewallRules() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/ip/firewall/filter/print', [], 'firewall-print');
    } finally {
      this.safeClose(conn);
    }
  }

  // ==================== QUEUE MANAGEMENT ====================

  async getSimpleQueues() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/queue/simple/print', [], 'queue-simple-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async getQueueTree() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/queue/tree/print', [], 'queue-tree-print');
    } finally {
      this.safeClose(conn);
    }
  }

  async createSimpleQueue(queueData) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        const params = [];
        for (const [key, value] of Object.entries(queueData)) {
          params.push(`=${key}=${value}`);
        }
        await this.execute(conn, '/queue/simple/add', params, 'queue-simple-add', true);
        return { success: true, message: 'Simple queue created successfully' };
      } finally {
        this.safeClose(conn);
      }
    }, 'createSimpleQueue');
  }

  async updateSimpleQueue(id, updates) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        const params = [`=.id=${id}`];
        for (const [key, value] of Object.entries(updates)) {
          params.push(`=${key}=${value}`);
        }
        await this.execute(conn, '/queue/simple/set', params, `queue-simple-update-${id}`, true);
        return { success: true, message: `Simple queue ${id} updated` };
      } finally {
        this.safeClose(conn);
      }
    }, `updateSimpleQueue(${id})`);
  }

  async deleteSimpleQueue(id) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        await this.execute(conn, '/queue/simple/remove', [`=.id=${id}`], `queue-simple-delete-${id}`, true);
        return { success: true, message: `Simple queue ${id} deleted` };
      } finally {
        this.safeClose(conn);
      }
    }, `deleteSimpleQueue(${id})`);
  }

  // ==================== MONITORING ====================

  async monitorInterfaceTraffic(interfaceName) {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(
        conn, '/interface/monitor-traffic',
        [`=interface=${interfaceName}`, '=once='],
        `monitor-traffic-${interfaceName}`
      );
    } catch (error) {
      logger.warn(`Monitor traffic failed: ${error.message}`);
      return [];
    } finally {
      this.safeClose(conn);
    }
  }

  async monitorSystemResource() {
    let conn;
    try {
      conn = await this.connect();
      return await this.execute(conn, '/system/resource/print', [], 'monitor-resource');
    } finally {
      this.safeClose(conn);
    }
  }

  async getSystemLog(topics, limit = 100) {
    let conn;
    try {
      conn = await this.connect();
      let result;
      if (topics) {
        result = await this.execute(conn, '/log/print', [`?topics=${topics}`], 'system-log');
      } else {
        result = await this.execute(conn, '/log/print', [], 'system-log');
      }
      // Limit results
      if (Array.isArray(result) && result.length > limit) {
        return result.slice(0, limit);
      }
      return result || [];
    } finally {
      this.safeClose(conn);
    }
  }
}

module.exports = new MikrotikService();
