
const mikrotikService = require('../../services/mikrotikService');

class QueueController {
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
}

module.exports = new QueueController();
