
const express = require('express');
const router = express.Router();
const mikrotikController = require('../controllers/mikrotikController');
const { validateRequest } = require('../middleware/validation');
const { userStatusSchema, credentialsSchema, secretSchema } = require('../schemas/mikrotik');

// Connection and system routes
router.get('/test-connection', mikrotikController.testConnection);
router.get('/system/identity', mikrotikController.getSystemIdentity);
router.get('/system/resource', mikrotikController.getSystemResource);
router.get('/system/clock', mikrotikController.getSystemClock);

// User management routes
router.post('/user/update-status', validateRequest(userStatusSchema), mikrotikController.updateUserStatus);
router.post('/user/regenerate-credentials', validateRequest(credentialsSchema), mikrotikController.regenerateUserCredentials);
router.post('/user/create-secret', validateRequest(secretSchema), mikrotikController.createPPPSecret);
router.delete('/user/:username', mikrotikController.removeUser);

// Interface management routes
router.get('/interfaces', mikrotikController.getInterfaces);
router.get('/interfaces/:name', mikrotikController.getInterfaceDetails);
router.post('/interfaces/:name/enable', mikrotikController.enableInterface);
router.post('/interfaces/:name/disable', mikrotikController.disableInterface);

// PPP management routes
router.get('/ppp/secrets', mikrotikController.getPPPSecrets);
router.get('/ppp/active', mikrotikController.getActivePPPConnections);
router.get('/ppp/profiles', mikrotikController.getPPPProfiles);
router.post('/ppp/secret', validateRequest(secretSchema), mikrotikController.createPPPSecret);
router.put('/ppp/secret/:name', mikrotikController.updatePPPSecret);
router.delete('/ppp/secret/:name', mikrotikController.deletePPPSecret);
router.post('/ppp/active/:id/remove', mikrotikController.removeActiveConnection);

// Wireless management routes
router.get('/wireless/interfaces', mikrotikController.getWirelessInterfaces);
router.get('/wireless/security-profiles', mikrotikController.getWirelessSecurityProfiles);
router.get('/wireless/registration-table', mikrotikController.getWirelessRegistrationTable);
router.post('/wireless/scan/:interface', mikrotikController.scanWireless);

// IP management routes
router.get('/ip/addresses', mikrotikController.getIPAddresses);
router.get('/ip/routes', mikrotikController.getRoutes);
router.get('/ip/dns', mikrotikController.getDNSSettings);
router.get('/ip/dhcp-server', mikrotikController.getDHCPServers);
router.get('/ip/firewall/rules', mikrotikController.getFirewallRules);

// Queue management routes
router.get('/queue/simple', mikrotikController.getSimpleQueues);
router.get('/queue/tree', mikrotikController.getQueueTree);
router.post('/queue/simple', mikrotikController.createSimpleQueue);
router.put('/queue/simple/:id', mikrotikController.updateSimpleQueue);
router.delete('/queue/simple/:id', mikrotikController.deleteSimpleQueue);

// Monitoring routes
router.get('/monitor/traffic/:interface', mikrotikController.monitorInterfaceTraffic);
router.get('/monitor/resource', mikrotikController.monitorSystemResource);
router.get('/log', mikrotikController.getSystemLog);

app.get('/show-origins', (req, res) => {
  res.json({ allowedOrigins: process.env.ALLOWED_ORIGINS });
});

module.exports = router;
