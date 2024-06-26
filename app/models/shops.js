const { getCurrentTimestamp } = require('@libs/basefunc');

module.exports = {
  getSettings: function(shop, accessToken) {
    const query = JSON.stringify({
      query: `{
        shop {
          currencyFormats {
            moneyFormat
          }
          timezoneOffset
        }
      }`
    });
    return new Promise(function(resolve, reject) {
      fetch(`https://${shop}/admin/api/2020-07/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
          },
          body: query
        })
        .then(response => response.json())
        .then(responseJson => {
          resolve({
            access_token: accessToken,
            money_format: responseJson.data.shop.currencyFormats.moneyFormat,
            timezone: responseJson.data.shop.timezoneOffset.slice(0, -2)
          });
        });
    });
  },
  addShop: function(shop, accessToken) {
    Promise.all([
      this.getSettings(shop, accessToken),
      this.getShopByName(shop)
    ])
    .then((result) => {
      const settings = result[0];
      let shopData = result[1];
      if (shopData) {
        this.updateShop(shop, settings);
        return;
      }
      const free_trial_period = process.env.APP_FREE_TRIAL_PERIOD;
      shopData = {
        shop_origin: shop,
        access_token: accessToken,
        notifications: '{"new_order":{"enabled":true},"cancelled_order":{"enabled":true},"paid_order":{"enabled":true},"fulfilled_order":{"enabled":true},"partially_fulfilled_order":{"enabled":true},"sales_report":{"enabled":false},"low_stock":{"enabled":false,"limit":"10"}}',
        slack_access: '',
        slack_webhook_url: '',
        first_installed_time: getCurrentTimestamp(),
        trial_expiration_time: Math.floor(new Date().getTime() / 1000) + free_trial_period * 24 * 60 * 60,
        timezone: settings.timezone,
        money_format: settings.money_format
      };
      var query = "INSERT INTO shops SET ?";
      return new Promise(function(resolve, reject) {
        db.query(query, shopData, function(err, result) {
          if (err)
            return reject(err);
          return resolve(result);
        });
      });
    });
  },
  getShopByName: function(shop) {
    var query = "SELECT * FROM shops WHERE shop_origin = ?";
    return new Promise(function(resolve, reject) {
      db.query(query, shop, function(err, result) {
        if (err)
          return reject(err);
        if (result.length > 0)
          return resolve(result[0]);
        else
          return resolve(null);
      });
    });
  },
  updateShop: function(shop, shopData) {
    var query = "UPDATE shops SET ? WHERE shop_origin = ?";
    return new Promise(function(resolve, reject) {
      db.query(query, [shopData, shop], function(err, result) {
        if (err)
          return reject(err);
        return resolve(result);
      });
    });
  },
  updateSubscriptionStatus: function(shop, subscriptionStatus) {
    this.updateShop(shop, { subscription_status: subscriptionStatus });
  },
  updateSubscription: function(subscriptionId, subscriptionData) {
    var query = "UPDATE shops SET ? WHERE subscription_id = ?";
    return new Promise(function(resolve, reject) {
      db.query(query, [subscriptionData, subscriptionId], function(err, result) {
        if (err)
          return reject(err);
        return resolve(result);
      });
    });
  },
  getShopsByTimezone: function(tzOffsetPlus = null, tzOffsetMinus = null) {
    var query = "SELECT * FROM shops WHERE timezone = ? or timezone = ?";
    return new Promise(function(resolve, reject) {
      db.query(query, [tzOffsetPlus, tzOffsetMinus], function(err, result) {
        if (err)
          return reject(err);
        return resolve(result);
      });
    });
  }
};