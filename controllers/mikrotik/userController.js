
const mikrotikService = require('../../services/mikrotikService');
const logger = require('../../utils/logger');

class UserController {
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
      
      console.log('Regenerating credentials request:', { oldUsername, newUsername, profile });
      
      if (!oldUsername || !newUsername || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: oldUsername, newUsername, newPassword'
        });
      }
      
      const result = await mikrotikService.regenerateUserCredentials(oldUsername, newUsername, newPassword, profile);
      res.json(result);
    } catch (error) {
      console.error('Error in regenerateUserCredentials controller:', error);
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

  async deletePPPSecret(req, res, next) {
    try {
      const { name } = req.params;
      const result = await mikrotikService.deletePPPSecret(name);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async disconnectPPPUser(req, res, next) {
    try {
      const { username } = req.params;
      logger.info(`Disconnecting PPP user: ${username}`);
      const result = await mikrotikService.disconnectPPPUser(username);
      res.json(result);
    } catch (error) {
      logger.error('Error in disconnectPPPUser controller:', error);
      next(error);
    }
  }
}

module.exports = new UserController();
