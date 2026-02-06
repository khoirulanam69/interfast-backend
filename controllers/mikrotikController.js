
const systemController = require('./mikrotik/systemController');
const userController = require('./mikrotik/userController');
const pppController = require('./mikrotik/pppController');
const interfaceController = require('./mikrotik/interfaceController');
const wirelessController = require('./mikrotik/wirelessController');
const networkController = require('./mikrotik/networkController');
const queueController = require('./mikrotik/queueController');

class MikrotikController {
  // System methods
  testConnection = systemController.testConnection;
  getSystemIdentity = systemController.getSystemIdentity;
  getSystemResource = systemController.getSystemResource;
  getSystemClock = systemController.getSystemClock;
  monitorSystemResource = systemController.monitorSystemResource;
  getSystemLog = systemController.getSystemLog;

  // User management methods
  updateUserStatus = userController.updateUserStatus;
  regenerateUserCredentials = userController.regenerateUserCredentials;
  createPPPSecret = userController.createPPPSecret;
  removeUser = userController.removeUser;
  deletePPPSecret = userController.deletePPPSecret;
  disconnectPPPUser = userController.disconnectPPPUser;

  // PPP management methods
  getPPPSecrets = pppController.getPPPSecrets;
  getActivePPPConnections = pppController.getActivePPPConnections;
  getPPPProfiles = pppController.getPPPProfiles;
  updatePPPSecret = pppController.updatePPPSecret;
  removeActiveConnection = pppController.removeActiveConnection;

  // Interface management methods
  getInterfaces = interfaceController.getInterfaces;
  getInterfaceDetails = interfaceController.getInterfaceDetails;
  enableInterface = interfaceController.enableInterface;
  disableInterface = interfaceController.disableInterface;
  monitorInterfaceTraffic = interfaceController.monitorInterfaceTraffic;

  // Wireless management methods
  getWirelessInterfaces = wirelessController.getWirelessInterfaces;
  getWirelessSecurityProfiles = wirelessController.getWirelessSecurityProfiles;
  getWirelessRegistrationTable = wirelessController.getWirelessRegistrationTable;
  scanWireless = wirelessController.scanWireless;

  // Network management methods
  getIPAddresses = networkController.getIPAddresses;
  getRoutes = networkController.getRoutes;
  getDNSSettings = networkController.getDNSSettings;
  getDHCPServers = networkController.getDHCPServers;
  getFirewallRules = networkController.getFirewallRules;

  // Queue management methods
  getSimpleQueues = queueController.getSimpleQueues;
  getQueueTree = queueController.getQueueTree;
  createSimpleQueue = queueController.createSimpleQueue;
  updateSimpleQueue = queueController.updateSimpleQueue;
  deleteSimpleQueue = queueController.deleteSimpleQueue;
}

module.exports = new MikrotikController();
