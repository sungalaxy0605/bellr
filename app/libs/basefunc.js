const CONSTANTS = require('@libs/constants');

module.exports = {
  getCurrentTimestamp: function() {
    const now = new Date();
    return `${now.getFullYear()}-${('0' + (now.getMonth() + 1)).slice(-2)}-${('0' + now.getDate()).slice(-2)} ${('0' + now.getHours()).slice(-2)}:${('0' + now.getMinutes()).slice(-2)}:${('0' + now.getSeconds()).slice(-2)}`;
  },
  getRemainingTimeInDay: function(timestamp) {
    const currentTimestamp = Math.floor(new Date().getTime() / 1000);
    const remainingTimeInSec = timestamp - currentTimestamp;
    const remainingTimeInDay = Math.ceil(remainingTimeInSec / (24 * 60 * 60));
    return remainingTimeInDay;
  },
  isExpired: function(timestamp) {
    const currentTimestamp = Math.floor(new Date().getTime() / 1000);
    if (currentTimestamp > timestamp)
      return true;
    return false;
  },
  isSendable: function(shopData, orderType, checkPlan = false) {
    if (shopData.subscription_plan == CONSTANTS.SUBSCRIPTION.PLAN.TRIAL) {
      if (this.isExpired(shopData.trial_expiration_time)) {
        return false;
      }
    } else {
      if (shopData.subscription_status != CONSTANTS.SUBSCRIPTION.STATUS.ACTIVE) {
        return false;
      }
    }

    if (shopData.slack_connected != CONSTANTS.SLACK.CONNECTED)
      return false;

    if (checkPlan && shopData.subscription_plan != CONSTANTS.SUBSCRIPTION.PLAN.PREMIUM)
      return false;

    shopData.notifications = JSON.parse(shopData.notifications);
    if (!shopData.notifications[orderType].enabled)
      return false;

    return true;
  }
};