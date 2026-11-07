const namesVI = require('./tieng-viet.json').names;
/* QA component tests: execute original handlers; replace Express registration,
 * database, bcrypt and AI SDK with explicit test doubles. NOT HTTP/SQL/E2E tests.
 * No network, real database, paid AI calls or source modifications.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const results = [];

function load(file, pool = {}) {
  const routes = {};
  const router = {};
  for (const verb of ['get', 'post', 'all']) router[verb] = (url, ...handlers) => {
    routes[`${verb.toUpperCase()} ${url}`] = handlers.at(-1);
  };
  const module = {exports: {}};
  const quiet = {log() {}, warn() {}, error() {}};
  const sandbox = {module, console: quiet, process: {env: {}}, require(name) {
    if (name === 'express') return {Router: () => router};
    if (name === '../config/database') return pool;
    if (name === 'bcryptjs') return {compare: async (p) => p === 'Correct123!', genSalt: async () => 'salt', hash: async () => 'fake-hash'};
    if (name === '@google/generative-ai') return {GoogleGenerativeAI: class {
      constructor() { throw new Error('AI network disabled in component tests'); }
    }};
    if (name === 'crypto') return require('node:crypto');
    throw new Error(`Unexpected dependency: ${name}`);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file});
  return {routes, exports: module.exports};
}
function request(body = {}, session = {}) { return {body, session, query: {}, params: {}, originalUrl: '/admin/dashboard', path: '/'}; }
function response() {return {statusCode: 200, locals: {}, status(n) {this.statusCode = n; return this;}, redirect(url) {this.location = url; return this;}, render(view, data) {this.view = view; this.data = data; return this;}, json(data) {this.data = data; return this;}};}
async function check(id, name, fn) {
  name = namesVI[id] || name;
  try {const actual = await fn(); results.push({id, name, status: 'PASS', actual: actual || 'Assertions satisfied'});}
  catch (e) {results.push({id, name, status: 'FAIL', actual: e.message});}
}
async function invoke(file, route, req, pool) {
  const res = response();
  const handler = load(file, pool).routes[route];
  assert.ok(handler, `Missing route ${route}`);
  await handler(req, res);
  return res;
}
const client = 'routes/clientRoutes.js';
const admin = 'routes/adminRoutes.js';
const variant = {id: 1, variant_id: 1, stock_quantity: 5, price: 100000, variant_name: 'Black', product_name: 'Test product'};
const variantPool = (changes = {}) => ({query: async () => [[{...variant, ...changes}]]});
function databaseFixture({stock = 5, oldStatus = 'pending', quantity = 1} = {}) {
  const calls = [];
  const conn = {committed: false, rolledBack: false, released: false,
    async beginTransaction() {calls.push({sql: 'BEGIN'});},
    async commit() {this.committed = true;}, async rollback() {this.rolledBack = true;}, release() {this.released = true;},
    async query(sql, params) {
      sql = sql.replace(/\s+/g, ' ').trim(); calls.push({sql, params});
      if (sql.startsWith('SELECT * FROM orders')) return [[{id: 1, order_status: oldStatus, order_code: 'ORD-TEST', customer_phone: '0900000000'}]];
      if (sql.startsWith('SELECT oi.id as order_item_id')) return [[{order_item_id: 1, variant_id: 1, quantity, stock_quantity: stock, warranty_months: 12, product_name: 'Test', variant_name: 'Black'}]];
      if (sql.startsWith('SELECT w.id FROM warranties')) return [[]];
      if (sql.startsWith('SELECT pv.id')) return [[{...variant, stock_quantity: stock}]];
      if (sql.startsWith('INSERT INTO orders')) return [{insertId: 1}];
      if (/^(INSERT INTO order_items|INSERT INTO warranties|UPDATE orders|UPDATE product_variants)/.test(sql)) return [{affectedRows: 1}];
      throw new Error(`Unexpected SQL in fixture: ${sql}`);
    }
  };
  return {calls, conn, pool: {getConnection: async () => conn}};
}
const checkoutBody = {customer_name: 'Test customer', customer_phone: '0900000000', shipping_address: 'Test address', payment_method: 'cod'};

async function main() {
  const auth = load('middleware/auth.js').exports;
  await check('LG01', 'Guest redirected to login', () => {const r = response(); auth.isAuthenticated(request(), r, () => assert.fail('Guest allowed')); assert.ok(r.location.startsWith('/auth/login?'));});
  await check('LG02', 'Authenticated customer passes login middleware', () => {let next = false; auth.isAuthenticated(request({}, {user: {role: 'customer'}}), response(), () => next = true); assert.equal(next, true);});
  for (const role of ['admin', 'staff']) await check(role === 'admin' ? 'LG03' : 'LG04', `${role} allowed into admin area`, () => {let next = false; auth.checkRole(['admin', 'staff'])(request({}, {user: {role}}), response(), () => next = true); assert.equal(next, true);});
  await check('LG05', 'Customer denied admin area', () => {const r = response(); auth.checkRole()(request({}, {user: {role: 'customer'}}), r, () => assert.fail('Customer allowed')); assert.equal(r.statusCode, 403);});
  await check('LG06', 'Unknown role denied admin area', () => {const r = response(); auth.checkRole()(request({}, {user: {role: 'unknown'}}), r, () => assert.fail('Unknown role allowed')); assert.equal(r.statusCode, 403);});
  for (const [id, input, expected] of [['LG07','1',1], ['LG08','5',5], ['LG09','6',5]]) await check(id, `Add quantity ${input}, stock 5`, async () => {const req = request({variant_id: '1', quantity: input}); await invoke(client, 'POST /cart/add', req, variantPool()); assert.equal(req.session.cart[0].quantity, expected);});
  await check('LG10', 'Out-of-stock product not added', async () => {const req = request({variant_id: '1', quantity: '1'}); await invoke(client, 'POST /cart/add', req, variantPool({stock_quantity: 0})); assert.equal((req.session.cart || []).length, 0);});
  await check('LG11', 'Missing variant not added', async () => {const req = request({variant_id: '999', quantity: '1'}); await invoke(client, 'POST /cart/add', req, {query: async () => [[]]}); assert.equal((req.session.cart || []).length, 0);});
  for (const [id, input] of [['LG12','-2'], ['LG13','abc'], ['LG14','1.5']]) await check(id, `Reject invalid add quantity ${input}`, async () => {const req = request({variant_id: '1', quantity: input}); await invoke(client, 'POST /cart/add', req, variantPool()); assert.equal((req.session.cart || []).length, 0, `Invalid input ${input} stored as ${req.session.cart?.[0]?.quantity}`);});
  await check('LG15', 'Adding same variant merges quantity', async () => {const req = request({variant_id: '1', quantity: '2'}, {cart: [{variant_id: 1, quantity: 2}]}); await invoke(client, 'POST /cart/add', req, variantPool()); assert.equal(req.session.cart.length, 1); assert.equal(req.session.cart[0].quantity, 4);});
  await check('LG16', 'Update zero removes cart line per current implementation', async () => {const req = request({variant_id: '1', quantity: '0'}, {cart: [{variant_id: 1, quantity: 1}]}); await invoke(client, 'POST /cart/update', req); assert.equal(req.session.cart.length, 0);});
  await check('LG17', 'Update text must not corrupt quantity', async () => {const req = request({variant_id: '1', quantity: 'abc'}, {cart: [{variant_id: 1, quantity: 1}]}); await invoke(client, 'POST /cart/update', req); assert.equal(req.session.cart[0].quantity, 1, `Stored quantity: ${req.session.cart[0].quantity}`);});
  await check('LG18', 'Remove only selected variant', async () => {const req = request({variant_id: '1'}, {cart: [{variant_id: 1, quantity: 1}, {variant_id: 2, quantity: 2}]}); await invoke(client, 'POST /cart/remove', req); assert.equal(req.session.cart.length, 1); assert.equal(req.session.cart[0].variant_id, 2);});
  await check('LG19', 'Empty cart checkout redirected', async () => {const r = await invoke(client, 'GET /checkout', request()); assert.equal(r.location, '/products');});
  await check('LG20', 'Checkout rejects missing recipient fields', async () => {const r = await invoke(client, 'POST /checkout', request({}, {cart: [{variant_id: 1, quantity: 1}]})); assert.equal(r.location, '/checkout');});
  for (const [id, qty, shouldCommit] of [['LG21',1,true], ['LG22',6,false], ['LG23',-2,false]]) await check(id, `Checkout quantity ${qty}, stock 5`, async () => {const db = databaseFixture(); await invoke(client, 'POST /checkout', request(checkoutBody, {cart: [{variant_id: 1, quantity: qty}]}), db.pool); assert.equal(db.conn.committed, shouldCommit, `Transaction committed: ${db.conn.committed}`); assert.equal(db.conn.released, true); if (!shouldCommit) assert.equal(db.conn.rolledBack, true);});
  await check('LG24', 'Checkout rejects whitespace recipient fields', async () => {const db = databaseFixture(); await invoke(client, 'POST /checkout', request({...checkoutBody, customer_name: ' ', shipping_address: ' '}, {cart: [{variant_id: 1, quantity: 1}]}), db.pool); assert.equal(db.conn.committed, false, 'Whitespace-only recipient accepted');});
  for (const [id, price, expected] of [['LG25',499999,30000], ['LG26',500000,0], ['LG27',500001,0]]) await check(id, `Shipping at subtotal ${price}; policy free from 500000`, async () => {const r = await invoke(client, 'GET /checkout', request({}, {cart: [{variant_id: 1, quantity: 1}]}), variantPool({price})); assert.equal(r.data.shippingFee, expected, `Actual fee: ${r.data.shippingFee}`);});
  await check('LG28', 'Empty warranty search rejected', async () => {const r = await invoke(client, 'POST /warranty', request({query: ' '})); assert.equal(r.location, '/warranty');});
  await check('LG29', 'Warranty search masks customer identity', async () => {const w = {customer_name: 'Nguyen Van An', customer_phone: '0901234567', end_date: '2099-12-31', status: 'valid'}; const r = await invoke(client, 'POST /warranty', request({query: 'SN-TEST'}), {query: async () => [[w]]}); assert.notEqual(r.data.warranties[0].maskedPhone, w.customer_phone); assert.notEqual(r.data.warranties[0].maskedName, w.customer_name); assert.equal(r.data.warranties[0].isExpired, false);});
  for (const [id, message] of [['LG30',''], ['LG31',123]]) await check(id, 'Chat rejects empty/non-string message', async () => {const r = await invoke(client, 'POST /api/chat', request({message})); assert.equal(r.statusCode, 400);});
  await check('LG32', 'Chat replies without paid AI key', async () => {const r = await invoke(client, 'POST /api/chat', request({message: 'Xin chào'}), {query: async () => [[]]}); assert.equal(r.statusCode, 200); assert.equal(typeof r.data.reply, 'string'); assert.ok(r.data.reply.length > 0);});
  for (const [id, oldStatus, newStatus, stock, expectCommit] of [
    ['LG33','pending','confirmed',5,true], ['LG34','pending','confirmed',0,false],
    ['LG35','confirmed','cancelled',5,true], ['LG36','pending','completed',0,false],
    ['LG37','completed','pending',5,false], ['LG38','cancelled','confirmed',5,false]
  ]) await check(id, `Order transition ${oldStatus} -> ${newStatus}, stock ${stock}`, async () => {
    const db = databaseFixture({stock, oldStatus}); const req = request({new_status: newStatus}); req.params.id = '1';
    await invoke(admin, 'POST /orders/:id/status', req, db.pool);
    assert.equal(db.conn.committed, expectCommit, `Transaction committed: ${db.conn.committed}`);
    if (id === 'LG33') assert.ok(db.calls.some(c => /stock_quantity = stock_quantity -/.test(c.sql)));
    if (id === 'LG35') assert.ok(db.calls.some(c => /stock_quantity = stock_quantity \+/.test(c.sql)));
  });
  const report = {baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), executedAt: new Date().toISOString(), node: process.version, scope: 'Component handlers with mocked Express/DB/bcrypt/AI; no real SQL, HTTP, UI, concurrency, or AI model evaluation', total: results.length, passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, results};
  fs.mkdirSync(path.join(root, 'qa/results'), {recursive: true});
  fs.writeFileSync(path.join(root, 'qa/results/logic-results.json'), JSON.stringify(report, null, 2) + '\n');
  for (const r of results) console.log(`${r.status === 'PASS' ? 'ĐẠT' : 'KHÔNG ĐẠT'} ${r.id}: ${r.name}`);
  console.log(`TỔNG ${report.total}; ĐẠT ${report.passed}; KHÔNG ĐẠT ${report.failed}`);
  process.exitCode = report.failed ? 1 : 0;
}
main().catch(e => {console.error(e); process.exitCode = 2;});
