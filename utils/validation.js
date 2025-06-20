
const logger = require('./logger');

const validateConfig = () => {
  const requiredEnvVars = [
    'MIKROTIK_IP',
    'MIKROTIK_USERNAME',
    'MIKROTIK_PASSWORD'
  ];

  const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  logger.info('Configuration validation passed');
};

module.exports = {
  validateConfig
};
