const { IncomingWebhook } = require('@slack/webhook');
const { createNotification } = require('@libs/order');

module.exports = {
  sendHi: function(webhook_url) {
    const webhook = new IncomingWebhook(webhook_url);
    webhook.send({
      text: `:wave: Hi from bellr!\n\nWe monitor your shopify stores pulse in slack with order notifications, daily sales reporting and low stock alerts.\n\nGot questions? Visit bellr.co or email support@bellr.co`
    });
  },
  sendNotification: function(webhook_url, fields, text = ' ', actions = []) {
    const webhook = new IncomingWebhook(webhook_url);
    webhook.send({
      text: text,
      attachments: [{
        color: '#CBEFFF',
        fields: fields,
        actions: actions
      }]
    });
  },
  sendNotificationFromOrder: function(order, orderType, shop, shopData) {
    const orderUrl = `https://${shop}/admin/orders/${order.id}`;
    var customerUrl = null;
    if (order.customer)
      customerUrl = `https://${shop}/admin/customers/${order.customer.id}`;
    
    let actions = [];
    if (orderUrl) {
      actions.push({
        type: 'button',
        text: 'View Order',
        url: orderUrl
      });
    }
    if (customerUrl) {
      actions.push({
        type: 'button',
        text: 'View Customer',
        url: customerUrl
      });
    }

    const fields = createNotification(order, orderType, shop, shopData.money_format);
    this.sendNotification(shopData.slack_webhook_url, fields, ' ', actions);
  },
  sendReportNotification: function(webhook_url, title = ' ', blocks = []) {
    const webhook = new IncomingWebhook(webhook_url);
    webhook.send({
      text: title,
      blocks: blocks
    });
  },
}