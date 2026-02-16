const { RouterOSAPI } = require('node-routeros');
const logger = require('../utils/logger');

// Retry utility
async function withRetry(operation, description, retries = 3, delay = 1500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isEmptyReply = error && (
        (error.message && error.message.includes('!empty')) ||
        (error.message && error.message.includes('unknown reply'))
      );
      const isTransient = isEmptyReply ||
        (error.message && (error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT') || error.message.includes('ECONNRESET')));

      if (isTransient && attempt < retries) {
        logger.warn(`[Retry ${attempt}/${retries}] ${description} failed: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
}

// Safe write wrapper that handles !empty responses
async function safeWrite(conn, commands, description = 'command') {
  try {
    logger.info(`MikroTik executing [${description}]: ${JSON.stringify(commands)}`);
    const result = await conn.write(commands);
    logger.info(`MikroTik result [${description}]: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    // Handle !empty reply - this is often returned for write operations (add/set/remove) 
    // that don't return data. Treat as success for non-print commands.
    const isEmptyReply = error && error.message && (
      error.message.includes('!empty') || error.message.includes('unknown reply')
    );
    const isWriteCommand = commands.some(c =>
      c.includes('/add') || c.includes('/set') || c.includes('/remove')
    );

    if (isEmptyReply && isWriteCommand) {
      logger.warn(`MikroTik [${description}]: Got !empty reply for write command, treating as success`);
      return [];
    }

    logger.error(`MikroTik error [${description}]: ${error.message}`);
    throw error;
  }
}

// Safe connection close
function safeClose(conn) {
  try {
    if (conn) conn.close();
  } catch (e) {
    logger.warn('Error closing MikroTik connection:', e.message);
  }
}

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
    let conn;
    try {
      logger.info('Testing MikroTik connection...');
      conn = await this.connect();
      const identity = await safeWrite(conn, ['/system/identity/print'], 'test-connection');
      return { success: true, message: 'MikroTik connection successful', data: identity };
    } catch (error) {
      logger.error('MikroTik connection error:', error);
      return { success: false, message: `Connection failed: ${error.message}` };
    } finally {
      safeClose(conn);
    }
  }

  async getSystemIdentity() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/system/identity/print'], 'system-identity');
    } finally {
      safeClose(conn);
    }
  }

  async getSystemResource() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/system/resource/print'], 'system-resource');
    } finally {
      safeClose(conn);
    }
  }

  async getSystemClock() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/system/clock/print'], 'system-clock');
    } finally {
      safeClose(conn);
    }
  }

  async updateUserStatus(usernameDialer, status) {
    if (!usernameDialer || !status) {
      throw new Error('usernameDialer and status are required');
    }

    return withRetry(async () => {
      let conn;
      try {
        logger.info(`Updating MikroTik user status for ${usernameDialer} to ${status}`);
        conn = await this.connect();

        // Remove any existing active connections
        try {
          const activeUsers = await safeWrite(conn, [
            '/ppp/active/print',
            `?name=${usernameDialer}`
          ], `active-print-${usernameDialer}`);

          if (Array.isArray(activeUsers)) {
            for (const activeUser of activeUsers) {
              if (activeUser['.id']) {
                await safeWrite(conn, [
                  '/ppp/active/remove',
                  `=numbers=${activeUser['.id']}`
                ], `active-remove-${usernameDialer}`);
              }
            }
          }
          logger.info(`Removed PPP active connections: ${usernameDialer}`);
        } catch (error) {
          logger.warn('Error removing active connections (non-fatal):', error.message);
        }

        // Handle PPP secret based on status
        if (status === 'Inactive' || status === 'Terminate') {
          const secrets = await safeWrite(conn, [
            '/ppp/secret/print',
            `?name=${usernameDialer}`
          ], `secret-print-${usernameDialer}`);

          if (Array.isArray(secrets) && secrets.length > 0 && secrets[0]['.id']) {
            await safeWrite(conn, [
              '/ppp/secret/set',
              `=numbers=${secrets[0]['.id']}`,
              '=disabled=yes'
            ], `secret-disable-${usernameDialer}`);
            logger.info(`Disabled PPP secret: ${usernameDialer}`);
          } else {
            logger.info(`PPP secret not found: ${usernameDialer}`);
          }
        } else if (status === 'Active') {
          const secrets = await safeWrite(conn, [
            '/ppp/secret/print',
            `?name=${usernameDialer}`
          ], `secret-print-${usernameDialer}`);

          if (Array.isArray(secrets) && secrets.length > 0 && secrets[0]['.id']) {
            await safeWrite(conn, [
              '/ppp/secret/set',
              `=numbers=${secrets[0]['.id']}`,
              '=disabled=no'
            ], `secret-enable-${usernameDialer}`);
            logger.info(`Enabled PPP secret: ${usernameDialer}`);
          } else {
            logger.info(`PPP secret not found: ${usernameDialer}`);
          }
        }

        return { success: true, message: `User ${usernameDialer} status updated to ${status}` };
      } finally {
        safeClose(conn);
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
          const activeUsers = await safeWrite(conn, [
            '/ppp/active/print',
            `?name=${oldUsername}`
          ], `active-print-${oldUsername}`);

          if (Array.isArray(activeUsers)) {
            for (const activeUser of activeUsers) {
              if (activeUser['.id']) {
                await safeWrite(conn, [
                  '/ppp/active/remove',
                  `=numbers=${activeUser['.id']}`
                ], `active-remove-${oldUsername}`);
              }
            }
          }
        } catch (error) {
          logger.warn('Error removing active connections (non-fatal):', error.message);
        }

        // Find and update the existing PPP secret
        const secrets = await safeWrite(conn, [
          '/ppp/secret/print',
          `?name=${oldUsername}`
        ], `secret-print-${oldUsername}`);

        if (Array.isArray(secrets) && secrets.length > 0 && secrets[0]['.id']) {
          await safeWrite(conn, [
            '/ppp/secret/set',
            `=numbers=${secrets[0]['.id']}`,
            `=name=${newUsername}`,
            `=password=${newPassword}`,
            `=profile=${profile}`,
            '=disabled=no'
          ], `secret-update-${oldUsername}->${newUsername}`);
          logger.info(`Updated PPP secret from ${oldUsername} to ${newUsername} with profile ${profile}`);
        } else {
          // Create new secret if old one doesn't exist
          await safeWrite(conn, [
            '/ppp/secret/add',
            `=name=${newUsername}`,
            `=password=${newPassword}`,
            `=profile=${profile}`,
            '=service=pppoe',
            '=disabled=no'
          ], `secret-add-${newUsername}`);
          logger.info(`Created new PPP secret: ${newUsername} with profile ${profile}`);
        }

        // Remove any active connections for the new username
        try {
          const newActiveUsers = await safeWrite(conn, [
            '/ppp/active/print',
            `?name=${newUsername}`
          ], `active-print-${newUsername}`);

          if (Array.isArray(newActiveUsers)) {
            for (const activeUser of newActiveUsers) {
              if (activeUser['.id']) {
                await safeWrite(conn, [
                  '/ppp/active/remove',
                  `=numbers=${activeUser['.id']}`
                ], `active-remove-${newUsername}`);
              }
            }
          }
        } catch (error) {
          logger.warn('Error removing new active connections (non-fatal):', error.message);
        }

        return { success: true, message: `Credentials regenerated successfully for ${newUsername} with profile ${profile}` };
      } finally {
        safeClose(conn);
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
        const existingSecrets = await safeWrite(conn, [
          '/ppp/secret/print',
          `?name=${usernameDialer}`
        ], `secret-check-${usernameDialer}`);

        if (!Array.isArray(existingSecrets) || existingSecrets.length === 0) {
          await safeWrite(conn, [
            '/ppp/secret/add',
            `=name=${usernameDialer}`,
            `=password=${password}`,
            `=profile=${profile}`,
            '=service=pppoe'
          ], `secret-add-${usernameDialer}`);
          logger.info(`Created PPP secret: ${usernameDialer} with profile: ${profile}`);
        } else {
          // Secret exists, update it instead
          logger.info(`PPP secret already exists for ${usernameDialer}, updating profile to ${profile}`);
          if (existingSecrets[0]['.id']) {
            await safeWrite(conn, [
              '/ppp/secret/set',
              `=numbers=${existingSecrets[0]['.id']}`,
              `=password=${password}`,
              `=profile=${profile}`,
              '=disabled=no'
            ], `secret-update-existing-${usernameDialer}`);
          }
        }

        return { success: true, message: `PPP secret ready for ${usernameDialer} with profile ${profile}` };
      } finally {
        safeClose(conn);
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
          const activeUsers = await safeWrite(conn, [
            '/ppp/active/print',
            `?name=${username}`
          ], `active-print-${username}`);

          if (Array.isArray(activeUsers)) {
            for (const activeUser of activeUsers) {
              if (activeUser['.id']) {
                await safeWrite(conn, [
                  '/ppp/active/remove',
                  `=numbers=${activeUser['.id']}`
                ], `active-remove-${username}`);
              }
            }
          }
        } catch (error) {
          logger.warn('Error removing active connections (non-fatal):', error.message);
        }

        // Remove PPP secret
        const secrets = await safeWrite(conn, [
          '/ppp/secret/print',
          `?name=${username}`
        ], `secret-print-${username}`);

        if (Array.isArray(secrets) && secrets.length > 0 && secrets[0]['.id']) {
          await safeWrite(conn, [
            '/ppp/secret/remove',
            `=numbers=${secrets[0]['.id']}`
          ], `secret-remove-${username}`);
        }

        return { success: true, message: `User ${username} removed successfully` };
      } finally {
        safeClose(conn);
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

        const secrets = await safeWrite(conn, [
          '/ppp/secret/print',
          `?name=${username}`
        ], `secret-print-${username}`);

        if (Array.isArray(secrets) && secrets.length > 0 && secrets[0]['.id']) {
          await safeWrite(conn, [
            '/ppp/secret/remove',
            `=numbers=${secrets[0]['.id']}`
          ], `secret-remove-${username}`);
          logger.info(`PPP secret deleted for ${username}`);
        } else {
          logger.info(`PPP secret not found for ${username}`);
        }

        return { success: true, message: `PPP secret deleted for ${username}` };
      } finally {
        safeClose(conn);
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

        const activeUsers = await safeWrite(conn, [
          '/ppp/active/print',
          `?name=${username}`
        ], `active-print-${username}`);

        if (Array.isArray(activeUsers)) {
          for (const activeUser of activeUsers) {
            if (activeUser['.id']) {
              await safeWrite(conn, [
                '/ppp/active/remove',
                `=numbers=${activeUser['.id']}`
              ], `active-remove-${username}`);
              logger.info(`Disconnected active connection for ${username}`);
            }
          }
        }

        return { success: true, message: `PPP user ${username} disconnected` };
      } finally {
        safeClose(conn);
      }
    }, `disconnectPPPUser(${username})`);
  }

  async getInterfaces() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/interface/print'], 'interfaces-print');
    } finally {
      safeClose(conn);
    }
  }

  async getInterfaceDetails(name) {
    let conn;
    try {
      conn = await this.connect();
      const details = await safeWrite(conn, ['/interface/print', `?name=${name}`], `interface-detail-${name}`);
      return (Array.isArray(details) && details.length > 0) ? details[0] : null;
    } finally {
      safeClose(conn);
    }
  }

  async enableInterface(name) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        const interfaces = await safeWrite(conn, ['/interface/print', `?name=${name}`], `interface-print-${name}`);
        if (Array.isArray(interfaces) && interfaces.length > 0 && interfaces[0]['.id']) {
          await safeWrite(conn, ['/interface/set', `=numbers=${interfaces[0]['.id']}`, '=disabled=no'], `interface-enable-${name}`);
        }
        return { success: true, message: `Interface ${name} enabled` };
      } finally {
        safeClose(conn);
      }
    }, `enableInterface(${name})`);
  }

  async disableInterface(name) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        const interfaces = await safeWrite(conn, ['/interface/print', `?name=${name}`], `interface-print-${name}`);
        if (Array.isArray(interfaces) && interfaces.length > 0 && interfaces[0]['.id']) {
          await safeWrite(conn, ['/interface/set', `=numbers=${interfaces[0]['.id']}`, '=disabled=yes'], `interface-disable-${name}`);
        }
        return { success: true, message: `Interface ${name} disabled` };
      } finally {
        safeClose(conn);
      }
    }, `disableInterface(${name})`);
  }

  async getPPPSecrets() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/ppp/secret/print'], 'ppp-secrets-print');
    } finally {
      safeClose(conn);
    }
  }

  async getActivePPPConnections() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/ppp/active/print'], 'ppp-active-print');
    } finally {
      safeClose(conn);
    }
  }

  async getPPPProfiles() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/ppp/profile/print'], 'ppp-profiles-print');
    } finally {
      safeClose(conn);
    }
  }

  async updatePPPSecret(name, updates) {
    if (!name) throw new Error('name is required');

    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        const secrets = await safeWrite(conn, ['/ppp/secret/print', `?name=${name}`], `secret-print-${name}`);

        if (Array.isArray(secrets) && secrets.length > 0 && secrets[0]['.id']) {
          const setCommands = ['/ppp/secret/set', `=numbers=${secrets[0]['.id']}`];
          Object.keys(updates).forEach(key => {
            setCommands.push(`=${key}=${updates[key]}`);
          });
          await safeWrite(conn, setCommands, `secret-update-${name}`);
        }

        return { success: true, message: `PPP secret ${name} updated` };
      } finally {
        safeClose(conn);
      }
    }, `updatePPPSecret(${name})`);
  }

  async removeActiveConnection(id) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        await safeWrite(conn, ['/ppp/active/remove', `=numbers=${id}`], `active-remove-${id}`);
        return { success: true, message: `Active connection ${id} removed` };
      } finally {
        safeClose(conn);
      }
    }, `removeActiveConnection(${id})`);
  }

  async getWirelessInterfaces() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/interface/wireless/print'], 'wireless-print');
    } finally {
      safeClose(conn);
    }
  }

  async getWirelessSecurityProfiles() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/interface/wireless/security-profiles/print'], 'wireless-security-print');
    } finally {
      safeClose(conn);
    }
  }

  async getWirelessRegistrationTable() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/interface/wireless/registration-table/print'], 'wireless-reg-table');
    } finally {
      safeClose(conn);
    }
  }

  async scanWireless(interfaceName) {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/interface/wireless/scan', `=interface=${interfaceName}`, '=duration=5'], `wireless-scan-${interfaceName}`);
    } finally {
      safeClose(conn);
    }
  }

  async getIPAddresses() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/ip/address/print'], 'ip-address-print');
    } finally {
      safeClose(conn);
    }
  }

  async getRoutes() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/ip/route/print'], 'ip-route-print');
    } finally {
      safeClose(conn);
    }
  }

  async getDNSSettings() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/ip/dns/print'], 'dns-print');
    } finally {
      safeClose(conn);
    }
  }

  async getDHCPServers() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/ip/dhcp-server/print'], 'dhcp-server-print');
    } finally {
      safeClose(conn);
    }
  }

  async getFirewallRules() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/ip/firewall/filter/print'], 'firewall-print');
    } finally {
      safeClose(conn);
    }
  }

  async getSimpleQueues() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/queue/simple/print'], 'queue-simple-print');
    } finally {
      safeClose(conn);
    }
  }

  async getQueueTree() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/queue/tree/print'], 'queue-tree-print');
    } finally {
      safeClose(conn);
    }
  }

  async createSimpleQueue(queueData) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        const addCommands = ['/queue/simple/add'];
        Object.keys(queueData).forEach(key => {
          addCommands.push(`=${key}=${queueData[key]}`);
        });
        await safeWrite(conn, addCommands, 'queue-simple-add');
        return { success: true, message: 'Simple queue created successfully' };
      } finally {
        safeClose(conn);
      }
    }, 'createSimpleQueue');
  }

  async updateSimpleQueue(id, updates) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        const setCommands = ['/queue/simple/set', `=numbers=${id}`];
        Object.keys(updates).forEach(key => {
          setCommands.push(`=${key}=${updates[key]}`);
        });
        await safeWrite(conn, setCommands, `queue-simple-update-${id}`);
        return { success: true, message: `Simple queue ${id} updated` };
      } finally {
        safeClose(conn);
      }
    }, `updateSimpleQueue(${id})`);
  }

  async deleteSimpleQueue(id) {
    return withRetry(async () => {
      let conn;
      try {
        conn = await this.connect();
        await safeWrite(conn, ['/queue/simple/remove', `=numbers=${id}`], `queue-simple-delete-${id}`);
        return { success: true, message: `Simple queue ${id} deleted` };
      } finally {
        safeClose(conn);
      }
    }, `deleteSimpleQueue(${id})`);
  }

  async monitorInterfaceTraffic(interfaceName) {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/interface/monitor-traffic', `=interface=${interfaceName}`, '=duration=1'], `monitor-traffic-${interfaceName}`);
    } finally {
      safeClose(conn);
    }
  }

  async monitorSystemResource() {
    let conn;
    try {
      conn = await this.connect();
      return await safeWrite(conn, ['/system/resource/print'], 'monitor-resource');
    } finally {
      safeClose(conn);
    }
  }

  async getSystemLog(topics, limit = 100) {
    let conn;
    try {
      conn = await this.connect();
      const commands = ['/log/print'];
      if (topics) commands.push(`?topics=${topics}`);
      if (limit) commands.push(`=count=${limit}`);
      return await safeWrite(conn, commands, 'system-log');
    } finally {
      safeClose(conn);
    }
  }
}

module.exports = new MikrotikService();
