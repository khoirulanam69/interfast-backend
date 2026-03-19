const express = require("express");
const router = express.Router();
const deactivateExpiredUsers = require("../cron/expiredUserCron");
const { resetMonthlyPaymentStatus } = require("../scheduler/paymentScheduler");

router.get("/disable-expired-users", async (req, res) => {
  const token = req.headers["x-cron-secret"];

  if (token !== process.env.CRON_SECRET) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const result = await deactivateExpiredUsers();
  res.json(result);
});

router.get("/reset-payment-status", async (req, res) => {
  const result = await resetMonthlyPaymentStatus();
  res.json(result);
});

module.exports = router;
