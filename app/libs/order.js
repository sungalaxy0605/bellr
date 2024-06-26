const Shopify = require('shopify-api-node');
const moment = require('moment');
const CONSTANTS = require('@libs/constants');

function createNotification(order, orderType, shop, moneyFormat) {
  let fields = [];
  var field = new Object();

  const orderUrl = `https://${shop}/admin/orders/${order.id}`;
  field['title'] = `${CONSTANTS.ORDER.TITLE[orderType]}:`;
  field['value'] = `<${orderUrl}|${order.name}>`;
  fields.push(field);
  field = new Object();

  const customer = order.customer;
  field['title'] = `Customer:`;
  if (customer) {
    field['value'] = `${customer.first_name} ${customer.last_name} <${customer.email}>`;
  } else {
    field['value'] = `No customer info provided for this order`;
  }
  fields.push(field);
  field = new Object();

  const shippingAddress = order.shipping_address;
  field['title'] = `Delivery Location:`;
  if (shippingAddress) {
    let shppingAddr = '';
    if (shippingAddress.address1)
      shppingAddr = shppingAddr + shippingAddress.address1 + `, `;
    if (shippingAddress.address2)
      shppingAddr = shppingAddr + shippingAddress.address2 + `, `;
    if (shippingAddress.city)
      shppingAddr = shppingAddr + shippingAddress.city + `, `;
    if (shippingAddress.province)
      shppingAddr = shppingAddr + shippingAddress.province + `, `;
    if (shippingAddress.country)
      shppingAddr = shppingAddr + shippingAddress.country;
    field['value'] = shppingAddr;
  } else {
    field['value'] = `No delivery location provided for this order`;
  }
  fields.push(field);
  field = new Object();

  field['title'] = `Cart Total:`;
  const cartTotal = moneyFormat.replace('{{amount}}', order.total_price);
  field['value'] = cartTotal;
  fields.push(field);
  field = new Object();

  if (order.refunds.length > 0) {
    let refundedAmount = 0;
    order.refunds.forEach(refund => {
      refund.transactions.forEach(transaction => {
        refundedAmount = refundedAmount + parseFloat(transaction.amount);
      });
    });
    if (refundedAmount > 0) {
      field['title'] = `Refunded Amount:`;
      refundedAmount = refundedAmount.toFixed(2);
      refundedAmount = moneyFormat.replace('{{amount}}', refundedAmount);
      field['value'] = refundedAmount;
      fields.push(field);
      field = new Object();
    }
  }

  const discountCodes = order.discount_codes;
  if (discountCodes.length > 0) {
    let codes = '';
    field['title'] = `Discount Codes:`;
    discountCodes.forEach(discountCode => {
      codes = codes + discountCode.code + `, `;
    });
    field['value'] = codes.slice(0, -2);
    fields.push(field);
    field = new Object();
  }

  if (order.tags) {
    field['title'] = `Tags:`;
    field['value'] = order.tags;
    fields.push(field);
    field = new Object();
  }

  const items = order.line_items;
  field['title'] = `Line Items:`;
  field['value'] = ``;
  items.forEach(item => {
    field.value = field.value + `- ${item.quantity} x ${item.title}\n`;
  });
  fields.push(field);
  field = new Object();

  // if (order.refunds.length > 0) {
  //   field['title'] = `Refunded Items:`;
  //   field['value'] = ``;
  //   order.refunds.forEach(refund => {
  //     refund.refund_line_items.forEach(refundedItem => {
  //       field.value = field.value + `- ${refundedItem.quantity} x ${refundedItem.line_item.name}\n`;
  //     });
  //   });
  //   if (field.value) {
  //     fields.push(field);
  //     field = new Object();
  //   }
  // }

  if (orderType == 'PARTIALLY_FULFILLED_ORDER' && order.fulfillments.length > 0) {
    field['title'] = `Fulfilled Items:`;
    field['value'] = ``;
    order.fulfillments.forEach(fulfillment => {
      if (fulfillment.status == CONSTANTS.STATUS.CANCELLED)
        return;
      if (fulfillment.tracking_company)
        field.value = field.value + `- ${fulfillment.tracking_company}\n`
      fulfillment.line_items.forEach(fulfilledItem => {
        field.value = field.value + ` • ${fulfilledItem.quantity} x ${fulfilledItem.title}\n`;
      });
    });
    if (!field.value)
      field.value = `No items fulfilled`;
    fields.push(field);
    field = new Object();
  }

  return fields;
}

function createReport(shopData) {
  const targetHour = parseInt(process.env.REPORT_TIME);
  const curHour = moment.utc().hour();
  const sign = shopData.timezone.slice(0, 1);
  let today = moment.utc();

  if (targetHour > curHour) {
    if (sign == '+') {
      today = today.subtract(1, 'days');
    } else if (sign == '-') {
      today = today.subtract(2, 'days');
    }
  } else if (targetHour < curHour) {
    if (sign == '-') {
      today = today.subtract(1, 'days');
    }
  }

  let yesterday = today.clone();
  yesterday = yesterday.subtract(1, 'days');
  let dayOfLastweek = today.clone();
  dayOfLastweek = dayOfLastweek.subtract(7, 'days');

  const shopify = new Shopify({
    shopName: shopData.shop_origin,
    accessToken: shopData.access_token,
    apiVersion: '2020-07'
  });

  return new Promise(function(resolve, reject) {
    Promise.all([
      getReportOfDay(shopify, today, shopData.timezone),
      getReportOfDay(shopify, yesterday, shopData.timezone),
      getReportOfDay(shopify, dayOfLastweek, shopData.timezone)
    ])
    .then((result) => {
      let reportToday = result[0];
      let reportYesterday = result[1];
      let reportLastweek = result[2];

      let blocks = [];
      let block = {};
      let element = {};

      // Report title
      const reportTitle = `:chart_with_upwards_trend: Report (${today.format('YYYY-MM-DD')})`;

      // Divider      
      block['type'] = `divider`;
      blocks.push(block);
      block = new Object();
      
      // Sales title
      let formattedPercent = '';
      let formattedSales = getFormattedAmount(shopData.money_format, reportToday.sales);
      block['type'] = `section`;
      block['text'] = {};
      block.text['type'] = `mrkdwn`;
      block.text['text'] = `:moneybag: *Total Sales:* \`${formattedSales}\``;
      blocks.push(block);
      block = new Object();
      
      // Sales content
      block['type'] = `context`;
      block['elements'] = [];
      element['type'] = `mrkdwn`;
      formattedPercent = getFormattedPercent(reportToday.sales, reportYesterday.sales);
      formattedSales = getFormattedAmount(shopData.money_format, reportYesterday.sales);
      element['text'] = `${formattedPercent} vs *Prev. Day:* \`${formattedSales}\`\n`;
      formattedPercent = getFormattedPercent(reportToday.sales, reportLastweek.sales);
      formattedSales = getFormattedAmount(shopData.money_format, reportLastweek.sales);
      element.text = element.text + `${formattedPercent} vs *Last ${dayOfLastweek.format('dddd')}:* \`${formattedSales}\``;
      block.elements.push(element);
      blocks.push(block);
      element = new Object();
      block = new Object();

      // Orders title
      block['type'] = `section`;
      block['text'] = {};
      block.text['type'] = `mrkdwn`;
      block.text['text'] = `:handshake: *Orders:* \`${reportToday.orders}\``;
      blocks.push(block);
      block = new Object();

      // Orders content
      block['type'] = `context`;
      block['elements'] = [];
      element['type'] = `mrkdwn`;
      formattedPercent = getFormattedPercent(reportToday.orders, reportYesterday.orders);
      element['text'] = `${formattedPercent} vs *Prev. Day:* \`${reportYesterday.orders}\`\n`;
      formattedPercent = getFormattedPercent(reportToday.orders, reportLastweek.orders);
      element.text = element.text + `${formattedPercent} vs *Last ${dayOfLastweek.format('dddd')}:* \`${reportLastweek.orders}\``;
      block.elements.push(element);
      blocks.push(block);
      element = new Object();
      block = new Object();

      // Customers title
      block['type'] = `section`;
      block['text'] = {};
      block.text['type'] = `mrkdwn`;
      block.text['text'] = `:male-office-worker: *Customers:* \`${reportToday.customers}\``;
      blocks.push(block);
      block = new Object();

      // Customers content
      block['type'] = `context`;
      block['elements'] = [];
      element['type'] = `mrkdwn`;
      formattedPercent = getFormattedPercent(reportToday.customers, reportYesterday.customers);
      element['text'] = `${formattedPercent} vs *Prev. Day:* \`${reportYesterday.customers}\`\n`;
      formattedPercent = getFormattedPercent(reportToday.customers, reportLastweek.customers);
      element.text = element.text + `${formattedPercent} vs *Last ${dayOfLastweek.format('dddd')}:* \`${reportLastweek.customers}\``;
      block.elements.push(element);
      blocks.push(block);
      element = new Object();
      block = new Object();

      // Aov title
      let formattedAov = getFormattedAmount(shopData.money_format, reportToday.aov);
      block['type'] = `section`;
      block['text'] = {};
      block.text['type'] = `mrkdwn`;
      block.text['text'] = `:shopping_bags: *Avg. Order Value:* \`${formattedAov}\``;
      blocks.push(block);
      block = new Object();

      // Aov content
      block['type'] = `context`;
      block['elements'] = [];
      element['type'] = `mrkdwn`;
      formattedPercent = getFormattedPercent(reportToday.aov, reportYesterday.aov);
      formattedAov = getFormattedAmount(shopData.money_format, reportYesterday.aov);
      element['text'] = `${formattedPercent} vs *Prev. Day:* \`${formattedAov}\`\n`;
      formattedPercent = getFormattedPercent(reportToday.aov, reportLastweek.aov);
      formattedAov = getFormattedAmount(shopData.money_format, reportLastweek.aov);
      element.text = element.text + `${formattedPercent} vs *Last ${dayOfLastweek.format('dddd')}:* \`${formattedAov}\``;
      block.elements.push(element);
      blocks.push(block);
      element = new Object();
      block = new Object();

      if (reportToday.referrings.length == 0 &&
        reportToday.landings.length == 0 &&
        reportToday.gateways.length == 0) {
        resolve({
          title: reportTitle,
          blocks: blocks
        });
        return;
      }

      // Divider      
      block['type'] = `divider`;
      blocks.push(block);
      block = new Object();

      // Breakdown
      block['type'] = `section`;
      block['text'] = {};
      block.text['type'] = `mrkdwn`;
      block.text['text'] = `*Sales Breakdown (Top 3 by Revenue)*`;
      blocks.push(block);
      block = new Object();

      // Source title
      block['type'] = `section`;
      block['text'] = {};
      block.text['type'] = `mrkdwn`;
      block.text['text'] = `:spider_web: Source`;
      blocks.push(block);
      block = new Object();

      // Source content
      if (reportToday.referrings.length > 0) {
        block['type'] = `context`;
        block['elements'] = [];
        element['type'] = `mrkdwn`;
        element['text'] = '';
        reportToday.referrings.forEach((referring, idx) => {
          if (idx > 2)
            return;
          const amount = getFormattedAmount(shopData.money_format, referring.value);
          element.text = element.text + `• ${referring.key}: \`${amount}\` (${referring.percent}%)\n`;
        });
        block.elements.push(element);
        blocks.push(block);
        element = new Object();
        block = new Object();
      }

      // Landing page title
      block['type'] = `section`;
      block['text'] = {};
      block.text['type'] = `mrkdwn`;
      block.text['text'] = `:bookmark_tabs: Landing Pages`;
      blocks.push(block);
      block = new Object();

      // Landing page content
      if (reportToday.landings.length > 0) {
        block['type'] = `context`;
        block['elements'] = [];
        element['type'] = `mrkdwn`;
        element['text'] = '';
        reportToday.landings.forEach((landing, idx) => {
          if (idx > 2)
            return;
          const amount = getFormattedAmount(shopData.money_format, landing.value);
          element.text = element.text + `• ${landing.key}: \`${amount}\` (${landing.percent}%)\n`;
        });
        block.elements.push(element);
        blocks.push(block);
        element = new Object();
        block = new Object();
      }

      // Payment gateway title
      block['type'] = `section`;
      block['text'] = {};
      block.text['type'] = `mrkdwn`;
      block.text['text'] = `:bank: Payment Gateways`;
      blocks.push(block);
      block = new Object();

      // Payment gateway content
      if (reportToday.gateways.length > 0) {
        block['type'] = `context`;
        block['elements'] = [];
        element['type'] = `mrkdwn`;
        element['text'] = '';
        reportToday.gateways.forEach((gateway, idx) => {
          if (idx > 2)
            return;
          const amount = getFormattedAmount(shopData.money_format, gateway.value);
          element.text = element.text + `• ${gateway.key}: \`${amount}\` (${gateway.percent}%)\n`;
        });
        block.elements.push(element);
        blocks.push(block);
        element = new Object();
        block = new Object();
      }

      resolve({
        title: reportTitle,
        blocks: blocks
      });
    });
  });
}

function getReportOfDay(shopify, date, timezone) {
  const sign = timezone.slice(0, 1);
  let targetDate = date.clone();
  if (sign == '+') {
    targetDate.hour(0).minute(0).second(0);
  } else if (sign == '-') {
    targetDate.hour(23).minute(0).second(0);
  }
  targetDate.utcOffset(timezone + ':00');
  targetDate.hour(0).minute(0).second(0);

  let createdAtMin = targetDate.format();
  targetDate.add(1, 'days');
  let createdAtMax = targetDate.format();
  return new Promise(async function(resolve, reject) {
    let params = {
      created_at_min: createdAtMin,
      created_at_max: createdAtMax,
      status: 'any',
      limit: 250
    };
    let orders = [];
    do {
      const ordersResult = await shopify.order.list(params);
      orders = orders.concat(ordersResult);
      params = ordersResult.nextPageParameters;
    } while (params !== undefined);
    
    let totalSales = 0;
    let totalOrders = 0;
    let totalTransactions = 0;
    let orderCount = 0;
    let customers = [];
    let gateways = {};
    let landings = {};
    let referrings = {};
    for (const order of orders) {
      const totalPrice = parseFloat(order.total_price);

      // Order count
      orderCount++;
      totalOrders += totalPrice;

      // Customer count
      if (order.customer) {
        customerId = order.customer.id;
        if (!customers.includes(customerId))
          customers.push(customerId);
      }

      // order.landing_site
      let landingSite = 'None';
      if (order.landing_site)
        landingSite = order.landing_site.split('?')[0];
      if (!landings[landingSite]) {
        landings[landingSite] = totalPrice;
      } else {
        landings[landingSite] += totalPrice;
      }

      // order.s_site
      let referringSite = 'None';
      if (order.referring_site) {
        const referringURL = new URL(order.referring_site);
        referringSite = referringURL.host;
      }
      if (!referrings[referringSite]) {
        referrings[referringSite] = totalPrice;
      } else {
        referrings[referringSite] += totalPrice;
      }

      // Total, gateway
      if (order.financial_status == 'voided' || order.financial_status == 'refunded')
        continue;
      let orderTotal = totalPrice;
      const transactions = await shopify.transaction.list(order.id);
      transactions.forEach(transaction => {
        if (transaction.kind == 'void')
          return;
        if (transaction.status != 'success')
          return;

        const transactionAmount = parseFloat(transaction.amount);
        if (transaction.kind == 'refund') {
          orderTotal -= transactionAmount;
        } else {
          totalTransactions += transactionAmount;
          let gateway = transaction.gateway;
          gateway = uppercaseFirst(gateway);
          if (!gateways[gateway]) {
            gateways[gateway] = transactionAmount;
          } else {
            gateways[gateway] += transactionAmount;
          }
        }
      });
      totalSales += orderTotal;
    }

    let aov = 0;
    if (orderCount > 0)
      aov = parseFloat(totalOrders / orderCount);

    referrings = sortByValue(referrings, totalOrders);
    landings = sortByValue(landings, totalOrders);
    gateways = sortByValue(gateways, totalTransactions);

    let result = {
      sales: totalSales,
      orders: orderCount,
      aov: aov,
      customers: customers.length,
      referrings: referrings,
      landings: landings,
      gateways: gateways
    }
    resolve(result);
  });
}

function getFormattedAmount(moneyFormat, amount) {
  return moneyFormat.replace('{{amount}}', amount.toFixed(2));
}

function getFormattedPercent(num1, num2) {
  num1 = Math.max(0, parseFloat(num1));
  num2 = Math.max(0, parseFloat(num2));
  let symbol = '';
  let sign = '';
  let percent = 0;

  if (num1 == num2) {
    symbol = `:heavy_check_mark:`;
    if (num1 == 0)
      symbol = `:white_check_mark:`;
    percent = 0;
  } else if (num1 == 0) {
    symbol = `:small_red_triangle_down:`;
    sign = `-`;
    percent = 100;
  } else if (num2 == 0) {
    symbol = `:small_red_triangle:`;
    sign = `+`;
    percent = 100;
  } else {
    percent = (num1 - num2) / num2 * 100;
    if (percent > 0) {
      sign = `+`;
      symbol = `:small_red_triangle:`;
    } else {
      sign = `-`;
      symbol = `:small_red_triangle_down:`;
    }
  }

  percent = Math.abs(percent).toFixed(2);
  return `${symbol}\`${sign}${percent}%\``;
}

function sortByValue(obj, sum) {
  let arr = [];
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      let val = obj[key];
      let percent = parseFloat(100 * val / sum).toFixed(2);
      arr.push({
        key: key,
        value: val,
        percent: percent
      });
    }
  }
  arr.sort(function(a, b) {
    return b.value - a.value;
  });
  return arr;
}

function uppercaseFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = {
  createNotification: createNotification,
  createReport: createReport
}