const Router = require('koa-router');
const router = new Router();
const request = require('request');
const shopModel = require('@models/shops');
const CONSTANTS = require('@libs/constants');
const basefunc = require('@libs/basefunc');
const { sendHi, sendNotification } = require('@libs/slack');

module.exports = function(verifyRequest) {
  router.get('/api/settings', verifyRequest(), (ctx) => {
    const shop = ctx.session.shop;
    return new Promise(function(resolve, reject) {
      shopModel.getShopByName(shop)
        .then(shopData => {
          let trial = true, trialExpiration = 0, paid = false;
          if (shopData.subscription_plan != CONSTANTS.SUBSCRIPTION.PLAN.TRIAL) {
            trial = false;
            if (shopData.subscription_status == CONSTANTS.SUBSCRIPTION.STATUS.ACTIVE) {
              paid = true;
            } else {
              paid = false;
            }
          } else {
            if (basefunc.isExpired(shopData.trial_expiration_time)) {
              trial = false;
            } else {
              trialExpiration = basefunc.getRemainingTimeInDay(shopData.trial_expiration_time);
            }
          }
          ctx.body = {
            trial: trial,
            trialExpiration: trialExpiration,
            paid: paid,
            connected: shopData.slack_connected ? true : false,
            plan: shopData.subscription_plan,
            settings: JSON.parse(shopData.notifications)
          };
          resolve();
        });
    });
  });

  router.post('/api/settings', verifyRequest(), (ctx) => {
    var notifications = ctx.request.body.settings;
    if (!notifications || Object.keys(notifications).length != CONSTANTS.NOTIFICATION.KEYS.length) {
      ctx.body = { result: CONSTANTS.STATUS.FAILED };
      return;
    }

    for (var i=0;i<CONSTANTS.NOTIFICATION.KEYS.length;i++) {
      var key = CONSTANTS.NOTIFICATION.KEYS[i];
      if (!notifications.hasOwnProperty(key)) {
        ctx.body = { result: CONSTANTS.STATUS.FAILED };
        return;
      } else {
        if (!notifications[key].enabled)
          notifications[key].enabled = false;
        else
          notifications[key].enabled = true;
      }
    }

    const shop = ctx.session.shop;
    return new Promise(function(resolve, reject) {
      shopModel.getShopByName(shop)
        .then(shopData => {
          if (shopData.subscription_plan != CONSTANTS.SUBSCRIPTION.PLAN.PREMIUM ||
            shopData.subscription_status != CONSTANTS.SUBSCRIPTION.STATUS.ACTIVE) {
              notifications.sales_report.enabled = false;
              notifications.low_stock.enabled = false;
            }

          shopModel.updateShop(shop, {'notifications': JSON.stringify(notifications)});
          ctx.body = { result: CONSTANTS.STATUS.SUCCESS };
          resolve();
        });
    });
  });

  router.get('/test', verifyRequest(), async (ctx) => {
    const shop = ctx.session.shop;
    const shopData = await shopModel.getShopByName(shop);

    const query = JSON.stringify({
      query: `{
        shop {
          currencyFormats {
            moneyFormat
          }
        }
        orders(first: 1, reverse: true)	{
          edges {
            node {
              legacyResourceId
              displayFinancialStatus
              displayFulfillmentStatus
              name
              customer {
                legacyResourceId
                displayName
                email
              }
              shippingAddress {
                address1
                address2
                city
                province
                country
                phone
              }
              totalPriceSet {
                shopMoney {
                  amount
                }
              }
              totalRefundedSet{
                shopMoney {
                  amount
                }
              }
              tags
              discountCode
              lineItems(first: 50) {
                edges {
                  node {
                    name
                    quantity
                  }
                }
              }
              refunds {
                refundLineItems(first: 50) {
                  edges {
                    node {
                      lineItem {
                        name
                      }
                      quantity
                    }
                  }
                }
              }
              fulfillments {
                status
                trackingInfo {
                  company
                }
                fulfillmentLineItems(first: 50) {
                  edges {
                    node {
                      lineItem {
                        name
                      }
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
      }`
    });

    return new Promise(function(resolve, reject) {
      fetch(`https://${shop}/admin/api/2020-07/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': shopData.access_token
          },
          body: query
        })
        .then(response => response.json())
        .then(responseJson => {
          const orders = responseJson.data.orders.edges;
          if (orders.length == 0) {
            ctx.body = { result: CONSTANTS.STATUS.FAILED };
          } else {
            const moneyFormat = responseJson.data.shop.currencyFormats.moneyFormat;
            const order = orders[0].node;
            let fields = [];
            let field = new Object();
            let financialStatus = order.displayFinancialStatus;
            let fulfillmentStatus = order.displayFulfillmentStatus;
            let orderType = '';
            if (fulfillmentStatus == 'FULFILLED') {
              orderType = 'FULFILLED_ORDER';
            } else if (fulfillmentStatus == 'PARTIALLY_FULFILLED') {
              orderType = 'PARTIALLY_FULFILLED_ORDER';
            } else {
              if (financialStatus == 'PAID' || financialStatus == 'PARTIALLY_REFUNDED') {
                orderType = 'PAID_ORDER';
              } else if (financialStatus == 'PENDING' || financialStatus == 'AUTHORIZED') {
                orderType = 'NEW_ORDER';
              }
            }
            if (financialStatus == 'VOIDED' || financialStatus == 'REFUNDED')
              orderType = 'CANCELLED_ORDER';

            field['title'] = `${CONSTANTS.ORDER.TITLE[orderType]}:`;
            const orderUrl = `https://${shop}/admin/orders/${order.legacyResourceId}`;
            field['value'] = `<${orderUrl}|${order.name}>`;
            fields.push(field);
            field = new Object();

            field['title'] = 'Customer:';
            const customer = order.customer;
            if (customer) {
              field['value'] = `${customer.displayName} <${customer.email}>`;
            } else {
              field['value'] = 'No customer info provided for this order';
            }
            fields.push(field);
            field = new Object();

            field['title'] = 'Delivery Location:';
            const shippingAddress = order.shippingAddress;
            if (shippingAddress) {
              let shppingAddr = '';
              if (shippingAddress.address1)
                shppingAddr = shppingAddr + shippingAddress.address1 + ', ';
              if (shippingAddress.address2)
                shppingAddr = shppingAddr + shippingAddress.address2 + ', ';
              if (shippingAddress.city)
                shppingAddr = shppingAddr + shippingAddress.city + ', ';
              if (shippingAddress.province)
                shppingAddr = shppingAddr + shippingAddress.province + ', ';
              if (shippingAddress.country)
                shppingAddr = shppingAddr + shippingAddress.country;
              field['value'] = shppingAddr;
            } else {
              field['value'] = 'No delivery location provided for this order';
            }
            fields.push(field);
            field = new Object();

            field['title'] = 'Cart Total:';
            let totalAmount = parseFloat(order.totalPriceSet.shopMoney.amount);
            totalAmount = totalAmount.toFixed(2);
            const cartTotal = moneyFormat.replace('{{amount}}', totalAmount);
            field['value'] = cartTotal;
            fields.push(field);
            field = new Object();

            let refundedAmount = parseFloat(order.totalRefundedSet.shopMoney.amount);
            if (refundedAmount) {
              field['title'] = 'Refunded Amount:';
              refundedAmount = refundedAmount.toFixed(2);
              const refundTotal = moneyFormat.replace('{{amount}}', refundedAmount);
              field['value'] = refundTotal;
              fields.push(field);
              field = new Object();
            }

            if (order.discountCode) {
              field['title'] = 'Discount Codes:';
              field['value'] = order.discountCode;
              fields.push(field);
              field = new Object();
            }

            if (order.tags.length) {
              field['title'] = 'Tags:';
              let tags = '';
              order.tags.forEach(tag => {
                  tags = tags + tag + ', ';
              });
              field['value'] = tags.slice(0, -2);
              fields.push(field);
              field = new Object();
            }

            field['title'] = 'Line Items:';
            field['value'] = '';
            order.lineItems.edges.forEach(item => {
              field.value = field.value + `- ${item.node.quantity} x ${item.node.name}\n`;
            });
            fields.push(field);
            field = new Object();

            // if (order.refunds.length > 0) {
            //   field['title'] = 'Refunded Items:';
            //   field['value'] = '';
            //   order.refunds.forEach(refund => {
            //     refund.refundLineItems.edges.forEach(refundedItem => {
            //       field.value = field.value + `- ${refundedItem.node.quantity} x ${refundedItem.node.lineItem.name}\n`;
            //     });
            //   });
            //   fields.push(field);
            //   field = new Object();
            // }

            if (orderType == 'PARTIALLY_FULFILLED_ORDER' && order.fulfillments.length > 0) {
              field['title'] = 'Fulfilled Items:';
              field['value'] = '';
              order.fulfillments.forEach(fulfillment => {
                if (fulfillment.status == CONSTANTS.ORDER.FULFILLMENT.CANCELLED)
                  return;
                if (fulfillment.trackingInfo.length > 0)
                  field.value = field.value + `- ${fulfillment.trackingInfo[0].company}\n`
                fulfillment.fulfillmentLineItems.edges.forEach(fulfilledItem => {
                  field.value = field.value + `• ${fulfilledItem.node.quantity} x ${fulfilledItem.node.lineItem.name}\n`;
                });
              });
              if (!field.value)
                field.value = 'No items fulfilled';
              fields.push(field);
              field = new Object();
            }

            let customerUrl = null;
            if (customer) {
              customerUrl = `https://${shop}/admin/customers/${customer.legacyResourceId}`;
            } else {
              customerUrl = null;
            }

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

            sendNotification(shopData.slack_webhook_url, fields, ' ', actions);

            ctx.body = { result: CONSTANTS.STATUS.SUCCESS };
          }
          resolve();
        });
    });
  });

  router.get('/api/subscription', verifyRequest(), async (ctx) => {
    const shop = ctx.session.shop;
    const shopData = await shopModel.getShopByName(shop);
    const plan = ctx.query.plan;
    const planUpper = plan.toUpperCase();
    if (!CONSTANTS.SUBSCRIPTION.PLAN[planUpper] || 
      (shopData.subscription_plan == CONSTANTS.SUBSCRIPTION.PLAN[planUpper] &&
      shopData.subscription_status == CONSTANTS.SUBSCRIPTION.STATUS.ACTIVE)) {
      ctx.redirect(`https://${shop}/admin/apps/${process.env.APP_NAME}`);
      return;
    }
    console.log(`> Chosen a plan: ${shop} - ${planUpper}`);
    var fee = process.env.APP_BASIC_PLAN_FEE;
    if (planUpper == CONSTANTS.SUBSCRIPTION.PLAN_NAME.PREMIUM)
      fee = process.env.APP_PREMIUM_PLAN_FEE;

    const query = JSON.stringify({
      query: `mutation {
        appSubscriptionCreate(
          name: "Bellr ${plan} plan fee"
          returnUrl: "${process.env.HOST}/subscription/callback"
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: { amount: ${fee}, currencyCode: USD }
                  interval: EVERY_30_DAYS
                }
              }
            }
          ]
        ) {
          userErrors {
            field
            message
          }
          confirmationUrl
          appSubscription {
            id
          }
        }
      }`
    });

    return new Promise(function(resolve, reject) {
      fetch(`https://${shop}/admin/api/2020-07/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': shopData.access_token
          },
          body: query
        })
        .then(response => response.json())
        .then(responseJson => {
          ctx.session['plan'] = CONSTANTS.SUBSCRIPTION.PLAN[planUpper];
          const confirmationUrl = responseJson.data.appSubscriptionCreate.confirmationUrl;
          ctx.redirect(confirmationUrl);
          resolve();
        });
    });
  });

  router.get('/subscription/callback', verifyRequest(), (ctx) => {
    const shop = ctx.session.shop;
    const subscriptionId = ctx.query.charge_id;
    const shopData = {
      subscription_id: subscriptionId,
      subscription_plan: ctx.session.plan,
      subscription_status: CONSTANTS.SUBSCRIPTION.STATUS.ACTIVE,
      subscription_activated_time: basefunc.getCurrentTimestamp()
    };
    shopModel.updateShop(shop, shopData);
    console.log(`> Subscription activated: ${shop} - ${subscriptionId}`);
    ctx.redirect(`https://${shop}/admin/apps/${process.env.APP_NAME}`);
  });

  router.get('/oauth', verifyRequest(), (ctx) => {
    const shop = ctx.session.shop;
    if (!ctx.query.code) {
      console.log(`> Invalid slack authentication code: ${shop}`);
      ctx.response.status = 500;
      ctx.response.body = 'Invalid slack authentication code.';
    } else {
      return new Promise(function(resolve, reject) {
        request({
          url: 'https://slack.com/api/oauth.v2.access',
          qs: {
            code: ctx.query.code,
            client_id: process.env.SLACK_CLIENT_ID,
            client_secret: process.env.SLACK_CLIENT_SECRET
          },
          method: 'GET'
        }, function (error, response, bodyJSON) {
          if (error) {
            console.log(`> Slack authentication error: ${error}`);
            ctx.response.status = 500;
            ctx.response.body = 'Failed to add Bellr to a Slack channel.';
            resolve();
          } else {
            const body = JSON.parse(bodyJSON);
            if (!body.ok) {
              console.log(`> Slack authentication failed: ${body.error}`);
              ctx.response.status = 500;
              ctx.response.body = 'Failed to add Bellr to the Slack channel.';
            } else {
              shopModel.updateShop(shop, {
                slack_access: bodyJSON,
                slack_webhook_url: body.incoming_webhook.url,
                slack_connected: CONSTANTS.SLACK.CONNECTED
              });
              sendHi(body.incoming_webhook.url);
              ctx.response.body = 'Connected to slack channel';
              ctx.redirect(`https://${shop}/admin/apps/${process.env.APP_NAME}`);
            }
            resolve();
          }
        });
      });
    }
  });

  return router;
};