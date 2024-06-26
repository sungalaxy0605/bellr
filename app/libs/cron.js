const moment = require('moment');
const { getShopsByTimezone } = require('@models/shops');
const basefunc = require('@libs/basefunc');
const { createReport } = require('@libs/order');
const { sendReportNotification } = require('@libs/slack');

module.exports = {
  checkStores: async function() {
    const targetHour = parseInt(process.env.REPORT_TIME);
    const curHour = moment.utc().hour();
    let tzOffsetPlus = 0;
    let tzOffsetMinus = 0;
    if (targetHour > curHour) {
      tzOffsetPlus = targetHour - curHour;
      tzOffsetMinus = targetHour - curHour - 24;
    } else if (targetHour < curHour) {
      tzOffsetPlus = targetHour + 24 - curHour;
      tzOffsetMinus = targetHour - curHour;
    }
    if (tzOffsetPlus >= 0 && tzOffsetPlus <= 13) {
      tzOffsetPlus = '+' + ('0' + tzOffsetPlus).slice(-2);
    } else {
      tzOffsetPlus = null;
    }
    if (tzOffsetMinus < 0 && tzOffsetMinus >= -12) {
      tzOffsetMinus = -tzOffsetMinus;
      tzOffsetMinus = '-' + ('0' + tzOffsetMinus).slice(-2);
    } else {
      tzOffsetMinus = null;
    }

    const shops = await getShopsByTimezone(tzOffsetPlus, tzOffsetMinus);
    shops.forEach(shopData => {
      if (!basefunc.isSendable(shopData, 'sales_report', true))
        return;

      createReport(shopData)
        .then(report => {
          sendReportNotification(shopData.slack_webhook_url, report.title, report.blocks);
        });
    });
  }
}