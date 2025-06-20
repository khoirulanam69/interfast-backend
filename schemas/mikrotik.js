
const Joi = require('joi');

const userStatusSchema = Joi.object({
  usernameDialer: Joi.string().required().min(1).max(100),
  status: Joi.string().valid('Active', 'Inactive', 'Terminate').required()
});

const credentialsSchema = Joi.object({
  oldUsername: Joi.string().required().min(1).max(100),
  newUsername: Joi.string().required().min(1).max(100),
  newPassword: Joi.string().required().min(1).max(100),
  profile: Joi.string().optional().default('default')
});

const secretSchema = Joi.object({
  usernameDialer: Joi.string().required().min(1).max(100),
  password: Joi.string().required().min(1).max(100),
  profile: Joi.string().optional().default('default')
});

const queueSchema = Joi.object({
  name: Joi.string().required(),
  target: Joi.string().required(),
  maxLimit: Joi.string().optional(),
  burstLimit: Joi.string().optional(),
  burstThreshold: Joi.string().optional(),
  burstTime: Joi.string().optional(),
  priority: Joi.number().integer().min(1).max(8).optional(),
  comment: Joi.string().optional()
});

module.exports = {
  userStatusSchema,
  credentialsSchema,
  secretSchema,
  queueSchema
};
