const Router = require('koa-router');
const router = new Router({ prefix: '/webhook' });
const shopModel = require('@models/shops');
const CONSTANTS = require('@libs/constants');
const basefunc = require('@libs/basefunc');
const slack = require('@libs/slack');

module.exports = function(webhook) {

  router.post('/orders/create', webhook, async (ctx) => {
    const shop = ctx.headers['x-shopify-shop-domain'];
    const order = ctx.request.body;
    console.log(`> New order created: ${shop} - ${order.id}`);
    const shopData = await shopModel.getShopByName(shop);

    if (basefunc.isSendable(shopData, 'new_order'))
      slack.sendNotificationFromOrder(order, 'NEW_ORDER', shop, shopData);
  });

  router.post('/orders/cancelled', webhook, async (ctx) => {
    const shop = ctx.headers['x-shopify-shop-domain'];
    const order = ctx.request.body;
    console.log(`> Order cancelled: ${shop} - ${order.id}`);
    const shopData = await shopModel.getShopByName(shop);
    
    if (basefunc.isSendable(shopData, 'cancelled_order'))
      slack.sendNotificationFromOrder(order, 'CANCELLED_ORDER', shop, shopData);
  });

  router.post('/orders/paid', webhook, async (ctx) => {
    const shop = ctx.headers['x-shopify-shop-domain'];
    const order = ctx.request.body;
    console.log(`> Order paid: ${shop} - ${order.id}`);
    const shopData = await shopModel.getShopByName(shop);

    if (basefunc.isSendable(shopData, 'paid_order'))
      slack.sendNotificationFromOrder(order, 'PAID_ORDER', shop, shopData);
  });

  router.post('/orders/fulfilled', webhook, async (ctx) => {
    const shop = ctx.headers['x-shopify-shop-domain'];
    const order = ctx.request.body;
    console.log(`> Order fulfilled: ${shop} - ${order.id}`);
    const shopData = await shopModel.getShopByName(shop);

    if (basefunc.isSendable(shopData, 'fulfilled_order'))
      slack.sendNotificationFromOrder(order, 'FULFILLED_ORDER', shop, shopData);
  });

  router.post('/orders/partially_fulfilled', webhook, async (ctx) => {
    const shop = ctx.headers['x-shopify-shop-domain'];
    const order = ctx.request.body;
    console.log(`> Order partially fulfilled: ${shop} - ${order.id}`);
    const shopData = await shopModel.getShopByName(shop);

    if (basefunc.isSendable(shopData, 'partially_fulfilled_order'))
      slack.sendNotificationFromOrder(order, 'PARTIALLY_FULFILLED_ORDER', shop, shopData);
  });

  router.post('/product/update', webhook, async (ctx) => {
    const shop = ctx.headers['x-shopify-shop-domain'];
    const product = ctx.request.body;
    console.log(`> Product updated: ${shop} - ${product.id}`);
    const shopData = await shopModel.getShopByName(shop);

    if (!basefunc.isSendable(shopData, 'low_stock', true))
      return;

    const productUrl = `https://${shop}/admin/products/${product.id}`;
    product.variants.forEach(variant => {
      const variantId = variant.id;
      if (variant.inventory_quantity > shopData.notifications.low_stock.limit) {
        delete inventory[variantId];
        return;
      }

      const oldInventoryStatus = inventory[variantId];
      const currentTimestamp = Math.floor(new Date().getTime() / 1000);
      if (oldInventoryStatus) {
        if (oldInventoryStatus.quantity == variant.inventory_quantity &&
          (currentTimestamp - oldInventoryStatus.lastSent) < 60 * 60 * 24)
          return;
      }
      inventory[variantId] = {
        quantity: variant.inventory_quantity,
        lastSent: currentTimestamp
      }

      const variantUrl = `https://${shop}/admin/products/${product.id}/variants/${variantId}`;
      let fields = [];
      let field = new Object();
      field['title'] = `Product:`;
      if (product.options.length > 1 && product.variants.length > 1) {
        field['value'] = `<${variantUrl}|${product.title} - ${variant.title}>`;
      } else {
        field['value'] = `<${productUrl}|${product.title}>`;
      }
      fields.push(field);
      field = new Object();

      if (variant.sku) {
        field['title'] = `SKU:`;
        field['value'] = `${variant.sku}`;
        fields.push(field);
        field = new Object();
      }

      if (product.options.length > 1) {
        product.options.forEach((option, idx) => {
          field['title'] = `${option.name}:`;
          idx += 1;
          field['value'] = `${variant['option'+idx]}`;
          if (field.value) {
            fields.push(field);
            field = new Object();
          }
        });
      }

      field['title'] = `Inventory Quantity:`;
      field['value'] = `${variant.inventory_quantity}`;
      fields.push(field);
      field = new Object();

      let actions = [];
      actions.push({
        type: 'button',
        text: 'View Product',
        url: productUrl
      });
      if (product.options.length > 1 && product.variants.length > 1) {
        actions.push({
          type: 'button',
          text: 'View Variant',
          url: variantUrl
        });
      }

      slack.sendNotification(shopData.slack_webhook_url, fields, 'Low Stock Alert', actions);
    });
  });

  router.post('/subscriptions/update', webhook, async (ctx) => {
    const appSubscription = ctx.request.body.app_subscription;
    if (appSubscription.status != CONSTANTS.SUBSCRIPTION.SHOPIFY_STATUS.ACTIVE &&
      appSubscription.status != CONSTANTS.SUBSCRIPTION.SHOPIFY_STATUS.CANCELLED &&
      appSubscription.status != CONSTANTS.SUBSCRIPTION.SHOPIFY_STATUS.EXPIRED)
      return;
    const graphqlApiId = appSubscription.admin_graphql_api_id;
    const subscriptionId = graphqlApiId.split('/')[4];
    var plan = appSubscription.name;
    plan = plan.split(' ')[1].toUpperCase();
    var subscriptionPlan = CONSTANTS.SUBSCRIPTION.PLAN.BASIC;
    if (plan == CONSTANTS.SUBSCRIPTION.PLAN_NAME.PREMIUM)
      subscriptionPlan = CONSTANTS.SUBSCRIPTION.PLAN.PREMIUM;
    const subscriptionStatus = CONSTANTS.SUBSCRIPTION.STATUS[appSubscription.status];
    shopModel.updateSubscription(subscriptionId, {
      subscription_plan: subscriptionPlan,
      subscription_status: subscriptionStatus
    });
    console.log(`> Subscription updated: ${subscriptionId} - ${plan} - ${appSubscription.status}`);
  });

  router.post('/app/uninstalled', webhook, async (ctx) => {
    const shop = ctx.request.body.myshopify_domain;
    shopModel.updateSubscriptionStatus(shop, CONSTANTS.SUBSCRIPTION.STATUS.CANCELLED);
    console.log(`> App uninstalled: ${shop}`);
  });

  router.post('/shop/update', webhook, async (ctx) => {
    const plan = ctx.request.body.plan_name;
    if (plan != CONSTANTS.STATUS.CANCELLED)
      return;
    const shop = ctx.request.body.myshopify_domain;
    shopModel.updateSubscriptionStatus(shop, CONSTANTS.SUBSCRIPTION.STATUS.CANCELLED);
    console.log(`> Shop plan cancelled: ${shop}`);
  });

  router.post('/shop/redact', webhook, (ctx) => {
    ctx.response.status = 200;
  });

  router.post('/customers/redact', webhook, (ctx) => {
    ctx.response.status = 200;
  });

  router.post('/customers/data_request', webhook, (ctx) => {
    ctx.response.status = 200;
  });
  return router;
}