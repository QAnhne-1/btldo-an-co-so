const namesVI = require('./tieng-viet.json').names;
/* Real HTTP + MySQL integration; creates a fresh qzstore_qa_<timestamp> DB.
   Original application is spawned unchanged with explicit test-only env.
   No Gemini calls. Requires a local, disposable MySQL instance. */
const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawn,execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'../..');
const out=path.join(root,'qa/results'); fs.mkdirSync(out,{recursive:true});
const dbName='qzstore_qa_'+Date.now();
const port=Number(process.env.QA_HTTP_PORT||3100), dbPort=Number(process.env.QA_DB_PORT||3307);
const base=`http://127.0.0.1:${port}`;
const results=[]; let db, child; let logs=''; let counter=0;
const marker='QA-INTEGRATION';
async function test(name,fn,rule='confirmed'){const id='IT'+String(++counter).padStart(2,'0');name=namesVI[id]||name;try{const evidence=await fn(id);results.push({id,name,rule,status:'PASS',evidence:evidence||'Assertions satisfied'});}catch(e){results.push({id,name,rule,status:'FAIL',evidence:e.message});}console.log(`${results.at(-1).status === 'PASS' ? 'ĐẠT' : 'KHÔNG ĐẠT'} ${id} ${name}`);}
function jar(){return {cookie:''};}
async function http(url,session=jar(),body,method){const headers={};if(session.cookie)headers.Cookie=session.cookie;if(body!==undefined)headers['Content-Type']='application/x-www-form-urlencoded';const r=await fetch(base+url,{method:method||(body===undefined?'GET':'POST'),headers,body:body===undefined?undefined:new URLSearchParams(body),redirect:'manual',signal:AbortSignal.timeout(12000)});const cookie=r.headers.get('set-cookie');if(cookie)session.cookie=cookie.split(';')[0];return {status:r.status,location:r.headers.get('location'),text:await r.text()};}
async function sql(q,p=[]){return (await db.query(q,p))[0];}
async function login(email,password){const j=jar();await http('/auth/login',j,{email,password});return j;}
async function cartSession(quantity='1'){const j=jar();await http('/cart/add',j,{variant_id:'1',quantity:String(quantity)});return j;}
async function storedCart(j){const sid=decodeURIComponent(j.cookie.split('=').slice(1).join('='));assert.ok(sid.startsWith('s:'),'No signed session cookie');const id=sid.slice(2,sid.lastIndexOf('.'));const rows=await sql('SELECT data FROM sessions WHERE session_id=?',[id]);assert.equal(rows.length,1);return JSON.parse(rows[0].data).cart||[];}
async function checkout(j,overrides={}){return http('/checkout',j,{customer_name:'QA Customer',customer_phone:'0900000000',shipping_address:'QA TEST ADDRESS',payment_method:'cod',note:marker,...overrides});}
async function newOrder(qty=1){const j=await cartSession(qty);const r=await checkout(j);assert.match(r.location||'',/^\/order-success\?code=/);const code=new URL(r.location,base).searchParams.get('code');const rows=await sql('SELECT * FROM orders WHERE order_code=?',[code]);assert.equal(rows.length,1);return {j,order:rows[0]};}
async function change(admin,id,status){return http(`/admin/orders/${id}/status`,admin,{new_status:status});}
async function status(id){return (await sql('SELECT order_status FROM orders WHERE id=?',[id]))[0].order_status;}
async function stock(){return (await sql('SELECT stock_quantity FROM product_variants WHERE id=1'))[0].stock_quantity;}
async function resetProduct(){await sql('UPDATE product_variants SET stock_quantity=50,price=100000 WHERE id=1');}
async function start(){
 for(let attempt=0;attempt<100;attempt++){try{db=await mysql.createConnection({host:'127.0.0.1',port:dbPort,user:process.env.QA_DB_USER||'root',password:process.env.QA_DB_PASSWORD||'',multipleStatements:true,dateStrings:true});break;}catch(e){if(attempt===99)throw e;await new Promise(r=>setTimeout(r,100));}}
 // Schema is only applied to a new random DB on loopback. Never use .env.
 const schema=fs.readFileSync(path.join(root,'scripts/schema_and_seed.sql'),'utf8').replaceAll('qz_store_db',dbName);
 await db.query(schema);await db.query('USE `'+dbName+'`');
 child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DB_HOST:'127.0.0.1',DB_PORT:String(dbPort),DB_USER:process.env.QA_DB_USER||'root',DB_PASSWORD:process.env.QA_DB_PASSWORD||'',DB_NAME:dbName,NODE_ENV:'test',SESSION_SECRET:'qa-only-local-disposable-session',GEMINI_API_KEY:''},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 for(let i=0;i<100;i++){try{const r=await http('/auth/login');if(r.status===200)return;}catch{} if(child.exitCode!==null)throw Error('Server exited: '+logs);await new Promise(r=>setTimeout(r,100));}
 throw Error('Server not ready: '+logs);
}
async function main(){
 await start();
 for(const url of ['/','/products','/products?category=tai-nghe-am-thanh','/product/tai-nghe-khong-day-chong-on-sony-wh-1000xm5','/cart','/warranty','/auth/login','/auth/register'])await test(`GET ${url}`,async()=>{const r=await http(url);assert.equal(r.status,200);assert.ok(r.text.includes('<html'));return {http:r.status,htmlBytes:Buffer.byteLength(r.text)};});
 await test('Unknown page returns 404',async()=>assert.equal((await http('/qa-nonexistent-page')).status,404));
 await test('Guest admin access redirects to login',async()=>{const r=await http('/admin/dashboard');assert.equal(r.status,302);assert.ok(r.location.startsWith('/auth/login'));});
 const customer=await login('customer@gmail.com','Customer@123456');
 const admin=await login('admin@qzstore.com','Admin@123456');
 const staff=await login('staff@qzstore.com','Staff@123456');
 await test('Customer denied admin with real session',async()=>assert.equal((await http('/admin/dashboard',customer)).status,403));
 await test('Admin dashboard renders',async()=>assert.equal((await http('/admin/dashboard',admin)).status,200));
 await test('Staff dashboard renders',async()=>assert.equal((await http('/admin/dashboard',staff)).status,200));
 await test('Wrong password does not authenticate',async()=>{const j=await login('admin@qzstore.com','wrong-password');assert.equal((await http('/admin/dashboard',j)).status,302);});
 await test('Register valid new account and hash password',async()=>{const j=jar();const email='qa-new@example.test';const r=await http('/auth/register',j,{fullname:'QA New',email,phone:'0900000001',password:'Test123456',confirm_password:'Test123456'});assert.equal(r.location,'/');const u=await sql('SELECT role,password FROM users WHERE email=?',[email]);assert.equal(u[0].role,'customer');assert.notEqual(u[0].password,'Test123456');assert.equal((await http('/admin/dashboard',j)).status,403);});
 await test('Duplicate email not inserted',async()=>{const before=(await sql('SELECT COUNT(*) n FROM users'))[0].n;await http('/auth/register',jar(),{fullname:'QA',email:'customer@gmail.com',phone:'0900000000',password:'Test123456',confirm_password:'Test123456'});assert.equal((await sql('SELECT COUNT(*) n FROM users'))[0].n,before);});
 await test('Short registration password rejected',async()=>{await http('/auth/register',jar(),{fullname:'QA',email:'qa-short@example.test',phone:'0900000000',password:'12345',confirm_password:'12345'});assert.equal((await sql('SELECT id FROM users WHERE email=?',['qa-short@example.test'])).length,0);});
 await resetProduct();
 await test('Valid cart add persists quantity in MySQL session',async()=>{const j=await cartSession(2);assert.equal((await storedCart(j))[0].quantity,2);});
 for(const value of ['-2','abc','1.5'])await test(`Cart rejects invalid quantity ${value}`,async()=>{const j=await cartSession(value);const c=await storedCart(j);assert.equal(c.length,0,`Stored cart: ${JSON.stringify(c)}`);},'proposed-positive-integer-validation');
 await test('Cart update text does not corrupt quantity',async()=>{const j=await cartSession(1);await http('/cart/update',j,{variant_id:'1',quantity:'abc'});const c=await storedCart(j);assert.equal(c[0].quantity,1,`Stored cart: ${JSON.stringify(c)}`);});
 await test('Empty checkout rejected',async()=>{const r=await checkout(jar());assert.equal(r.location,'/cart');});
 await test('Missing address does not insert order',async()=>{const j=await cartSession(1);const r=await checkout(j,{shipping_address:''});assert.equal(r.location,'/checkout');});
 await test('COD checkout inserts correct order and clears cart',async()=>{await resetProduct();const {j,order}=await newOrder(2);assert.equal(Number(order.total_amount),230000);assert.equal(order.order_status,'pending');assert.equal(order.payment_method,'cod');const items=await sql('SELECT quantity FROM order_items WHERE order_id=?',[order.id]);assert.equal(items[0].quantity,2);assert.equal((await storedCart(j)).length,0);return {orderId:order.id,total:Number(order.total_amount),quantity:2};});
 await test('Negative quantity cannot create actual DB order',async()=>{const j=await cartSession(-2);const r=await checkout(j);assert.ok(!r.location?.startsWith('/order-success'),`Created order: ${r.location}`);});
 await test('Whitespace recipient cannot create order',async()=>{const j=await cartSession(1);const r=await checkout(j,{customer_name:' ',shipping_address:' '});assert.ok(!r.location?.startsWith('/order-success'),`Created order: ${r.location}`);});
 await test('Stock decreases after cart: checkout rolls back',async()=>{await resetProduct();const j=await cartSession(5);await sql('UPDATE product_variants SET stock_quantity=1 WHERE id=1');const before=(await sql('SELECT COUNT(*) n FROM orders'))[0].n;const r=await checkout(j);assert.equal(r.location,'/checkout');assert.equal((await sql('SELECT COUNT(*) n FROM orders'))[0].n,before);await resetProduct();});
 for(const price of [499999,500000,500001])await test(`Shipping policy at ${price}`,async()=>{await resetProduct();await sql('UPDATE product_variants SET price=? WHERE id=1',[price]);const {order}=await newOrder();const fee=Number(order.total_amount)-price;assert.equal(fee,price>=500000?0:30000,`Charged shipping ${fee}`);},price===500000?'policy-conflict-from-vs-above-500000':'confirmed');
 await resetProduct();
 let normal;
 await test('Admin confirms order and deducts stock once',async()=>{normal=await newOrder(2);const before=await stock();await change(admin,normal.order.id,'confirmed');assert.equal(await status(normal.order.id),'confirmed');assert.equal(await stock(),before-2);await change(admin,normal.order.id,'confirmed');assert.equal(await stock(),before-2);});
 await test('Admin cancels confirmed order and restores stock once',async()=>{assert.ok(normal);const before=await stock();await change(admin,normal.order.id,'cancelled');assert.equal(await status(normal.order.id),'cancelled');assert.equal(await stock(),before+2);await change(admin,normal.order.id,'cancelled');assert.equal(await stock(),before+2);});
 await test('Reject confirmation if stock became insufficient',async()=>{await resetProduct();const {order}=await newOrder(2);await sql('UPDATE product_variants SET stock_quantity=0 WHERE id=1');await change(admin,order.id,'confirmed');assert.equal(await status(order.id),'pending');});
 await test('Reject direct completion without stock',async()=>{await resetProduct();const {order}=await newOrder(2);await sql('UPDATE product_variants SET stock_quantity=0 WHERE id=1');await change(admin,order.id,'completed');assert.equal(await status(order.id),'pending',`Actual status ${await status(order.id)}`);});
 let completed;
 await test('Normal lifecycle generates warranty and avoids duplicates',async()=>{await resetProduct();completed=await newOrder(2);const id=completed.order.id;for(const s of ['confirmed','shipping','completed'])await change(admin,id,s);assert.equal(await status(id),'completed');const q='SELECT w.* FROM warranties w JOIN order_items oi ON w.order_item_id=oi.id WHERE oi.order_id=?';const w=await sql(q,[id]);assert.ok(w.length>0);await change(admin,id,'completed');assert.equal((await sql(q,[id])).length,w.length);completed.warranties=w;return {orderId:id,warrantyCount:w.length,quantity:2};});
 await test('Completed order cannot return to pending',async()=>{assert.ok(completed);await change(admin,completed.order.id,'pending');assert.equal(await status(completed.order.id),'completed');},'proposed-terminal-state-rule');
 await test('Cancelled order cannot return to confirmed',async()=>{assert.ok(normal);await change(admin,normal.order.id,'confirmed');assert.equal(await status(normal.order.id),'cancelled');},'proposed-terminal-state-rule');
 await test('Warranty lookup finds generated serial',async()=>{assert.ok(completed?.warranties?.length);const serial=completed.warranties[0].serial_number;const r=await http('/warranty',jar(),{query:serial});assert.equal(r.status,200);assert.ok(r.text.includes(serial));assert.ok(r.text.includes('CÒN BẢO HÀNH'));});
 await test('Void warranty must not show valid badge',async()=>{const w=completed.warranties[0];await sql('UPDATE warranties SET status=? WHERE id=?',['void',w.id]);const r=await http('/warranty',jar(),{query:w.serial_number});assert.ok(!r.text.includes('CÒN BẢO HÀNH ('),'Void warranty shown as valid');});
 await test('Chat rejects empty input over HTTP',async()=>assert.equal((await http('/api/chat',jar(),{message:''})).status,400));
 await test('Chat works with fallback and no external AI',async()=>{const r=await http('/api/chat',jar(),{message:'Xin chào'});assert.equal(r.status,200);assert.ok(JSON.parse(r.text).reply.length>0);});
 await test('Chat valid warranty does not say expired',async()=>{await sql('UPDATE warranties SET status=? WHERE id=?',['valid',completed.warranties[0].id]);const r=await http('/api/chat',jar(),{message:'Tra cứu bảo hành 0900000000'});assert.equal(r.status,200);const reply=JSON.parse(r.text).reply;assert.ok(!reply.includes('**Hết hạn**'),reply);});
 await test('Customer cannot modify order status',async()=>{const id=completed.order.id,before=await status(id);const r=await change(customer,id,'cancelled');assert.equal(r.status,403);assert.equal(await status(id),before);});
 await test('Sensitive order receipt requires customer authorization',async()=>{const r=await http('/order-success?code='+completed.order.order_code,jar());assert.ok(r.status!==200 || !r.text.includes('QA TEST ADDRESS'),'Guest with order code can read recipient address');},'proposed-order-privacy-rule');
 await resetProduct();
}
(async()=>{let fatal;try{await main();}catch(e){fatal=e.stack;console.error(e);}finally{if(child){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}const version=db?await sql('SELECT VERSION() version').catch(()=>[]):[];if(db)await db.end();const report={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),executedAt:new Date().toISOString(),scope:'Real HTTP, EJS server rendering, MySQL queries/transactions and persistent session; no browser, no concurrency/load test, no paid AI',database:dbName,mysqlVersion:version[0]?.version,node:process.version,total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,fatal,results};fs.writeFileSync(path.join(out,'integration-results.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'integration-server.log'),logs);console.log(`TỔNG ${report.total}; ĐẠT ${report.passed}; KHÔNG ĐẠT ${report.failed}`);process.exitCode=fatal?2:report.failed?1:0;}})();
