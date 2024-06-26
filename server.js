require('isomorphic-fetch');
require('dotenv').config();
require('module-alias/register');
const Koa = require('koa');
const next = require('next');
const mysql = require('mysql');
const { default: createShopifyAuth } = require('@shopify/koa-shopify-auth');
const { verifyRequest } = require('@shopify/koa-shopify-auth');
const session = require('koa-session');
const cors = require('@koa/cors');
const Router = require('koa-router');
const serve = require('koa-static');
const bodyParser = require('koa-body');
const CronJob = require('cron').CronJob;
const { default: graphQLProxy } = require('@shopify/koa-shopify-graphql-proxy');
const { ApiVersion } = require('@shopify/koa-shopify-graphql-proxy');
const { receiveWebhook, registerWebhook } = require('@shopify/koa-shopify-webhooks');
const { checkStores } = require('@libs/cron');

var dbConn = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

dbConn.connect(function(err) {
  if (err) throw err;
  console.log('> Connected to mysql server');
});
global.db = dbConn;

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const { SHOPIFY_API_SECRET_KEY, SHOPIFY_API_KEY, HOST } = process.env;

app.prepare().then(() => {
  const server = new Koa();
  server.context.db = dbConn;
  server.use(session({ secure: true, sameSite: 'none' }, server));
  server.keys = [SHOPIFY_API_SECRET_KEY];

  server.use(
    createShopifyAuth({
      apiKey: SHOPIFY_API_KEY,
      secret: SHOPIFY_API_SECRET_KEY,
      scopes: ['read_orders', 'write_orders', 'read_customers', 'read_products', 'write_products', 'read_inventory', 'write_inventory'],
      accessMode: 'offline',
      async afterAuth(ctx) {
        const { shop, accessToken } = ctx.session;
        ctx.cookies.set('shopOrigin', shop, {
          httpOnly: false,
          secure: true,
          sameSite: 'none'
        });
        console.log(`> Authenticated: ${shop} - ${accessToken}`);
        const shopModel = require('@models/shops');
        Promise.all([
          registerWebhook({
            address: `${HOST}/webhook/orders/create`,
            topic: 'ORDERS_CREATE',
            accessToken,
            shop,
            apiVersion: ApiVersion.July20
          }),
          registerWebhook({
            address: `${HOST}/webhook/orders/cancelled`,
            topic: 'ORDERS_CANCELLED',
            accessToken,
            shop,
            apiVersion: ApiVersion.July20
          }),
          registerWebhook({
            address: `${HOST}/webhook/orders/paid`,
            topic: 'ORDERS_PAID',
            accessToken,
            shop,
            apiVersion: ApiVersion.July20
          }),
          registerWebhook({
            address: `${HOST}/webhook/orders/fulfilled`,
            topic: 'ORDERS_FULFILLED',
            accessToken,
            shop,
            apiVersion: ApiVersion.July20
          }),
          registerWebhook({
            address: `${HOST}/webhook/orders/partially_fulfilled`,
            topic: 'ORDERS_PARTIALLY_FULFILLED',
            accessToken,
            shop,
            apiVersion: ApiVersion.July20
          }),
          registerWebhook({
            address: `${HOST}/webhook/product/update`,
            topic: 'PRODUCTS_UPDATE',
            accessToken,
            shop,
            apiVersion: ApiVersion.July20
          }),
          registerWebhook({
            address: `${HOST}/webhook/subscriptions/update`,
            topic: 'APP_SUBSCRIPTIONS_UPDATE',
            accessToken,
            shop,
            apiVersion: ApiVersion.July20
          }),
          registerWebhook({
            address: `${HOST}/webhook/shop/update`,
            topic: 'SHOP_UPDATE',
            accessToken,
            shop,
            apiVersion: ApiVersion.July20
          }),
          registerWebhook({
            address: `${HOST}/webhook/app/uninstalled`,
            topic: 'APP_UNINSTALLED',
            accessToken,
            shop,
            apiVersion: ApiVersion.July20
          }),
          shopModel.addShop(shop, accessToken)
        ])
        .then((result) => {
          if (result[0].success && result[1].success && result[2].success &&
            result[3].success && result[4].success && result[5].success &&
            result[6].success && result[7].success && result[8].success) {
            console.log(`> Webhook Registered: ${shop}`);
          } else {
            console.log(`> Webhook registration failed: ${shop}`);
          }
        });
        ctx.redirect('https://'+shop+'/admin/apps/' + process.env.APP_NAME);
      },
    }),
  );

  server.use(graphQLProxy({version: ApiVersion.July20}))
  server.use(serve('./public'));
  server.use(cors());

  const router = new Router();
  const webhook = receiveWebhook({ secret: SHOPIFY_API_SECRET_KEY });
  const webhookRouter = require('@routes/webhook')(webhook);
  const apiRouter = require('@routes/api')(verifyRequest);

  router.all('/(.*)', verifyRequest(), async (ctx) => {
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
    ctx.res.statusCode = 200;
  });

  server.use(webhookRouter.routes());
  server.use(webhookRouter.allowedMethods());

  server.use(bodyParser());

  server.use(apiRouter.routes());
  server.use(apiRouter.allowedMethods());  
  server.use(router.routes());
  server.use(router.allowedMethods());

  server.listen(port, () => {
    console.log(`> Server started on port: ${port}`);
  });
});

global.inventory = {};

const job = new CronJob('0 0 * * * *', function() {
  console.log('> Check for report');
  checkStores();
}, null, true);
job.start();