const express = require("express");
const router = express.Router();
const deactivateExpiredUsers = require("../cron/expiredUserCron");

router.get("/disable-expired-users", async (req, res) => {
  const result = await deactivateExpiredUsers();
  res.json(result);
});

module.exports = router;
