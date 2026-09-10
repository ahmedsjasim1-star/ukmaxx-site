const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(__dirname,'../assets/js/modules/bundleOffer.js'),'utf8')).toString('base64'));
const products = {RT20:{price:64.99,stockCount:46},BC5:{price:29.99,stockCount:17},GHKCU:{price:29.99,stockCount:18},WA10:{price:8.99,stockCount:53},RT20X3:{price:184.99,stockCount:15}};
const eligible = ['RT20','BC5','GHKCU'];
const components = {RT20X3:{RT20:3,WA10:1}};
test('five singles: cheaper fixed pack plus two singles; paid water retained',async()=>{
 const {quoteBundle}=await load; const cart=[{sku:'RT20',qty:5},{sku:'WA10',qty:2}];
 const snapshot=JSON.stringify(cart); const q=quoteBundle(cart,['RT20','RT20','RT20'],products,eligible,components);
 assert.equal(q.fixedSku,'RT20X3'); assert.equal(q.price,184.99); assert.equal(q.saving,9.98);
 assert.deepEqual(q.cart,[{sku:'RT20',qty:2},{sku:'WA10',qty:2},{sku:'RT20X3',qty:1}]); assert.equal(JSON.stringify(cart),snapshot);
});
test('six singles can convert twice without double discount',async()=>{
 const {quoteBundle}=await load; const selection=Array(3).fill('RT20');
 const first=quoteBundle([{sku:'RT20',qty:6}],selection,products,eligible,components);
 const second=quoteBundle(first.cart,selection,products,eligible,components);
 assert.deepEqual(second.cart,[{sku:'RT20X3',qty:2}]); assert.equal(quoteBundle(second.cart,selection,products,eligible,components),null);
});
test('mixed custom offer marks only three units and adds one water',async()=>{
 const {quoteBundle}=await load;
 const q=quoteBundle([{sku:'RT20',qty:3},{sku:'BC5',qty:1},{sku:'GHKCU',qty:1},{sku:'WA10',qty:1}],['RT20','BC5','GHKCU'],products,eligible,components);
 assert.equal(q.fixedSku,''); assert.equal(q.price,118.72); assert.equal(q.cart[0].bundleQty,1); assert.equal(q.cart[3].qty,2);
});
test('already grouped units and water cannot qualify',async()=>{
 const {quoteBundle}=await load;
 assert.equal(quoteBundle([{sku:'RT20',qty:3,bundleQty:3},{sku:'WA10',qty:1}],Array(3).fill('RT20'),products,eligible,components),null);
 assert.equal(quoteBundle([{sku:'WA10',qty:3}],Array(3).fill('WA10'),products,eligible,components),null);
});
test('aggregate stock includes fixed packs and extra paid water',async()=>{
 const {quoteBundle}=await load; const selection=Array(3).fill('RT20');
 assert.equal(quoteBundle([{sku:'RT20',qty:3},{sku:'WA10',qty:53}],selection,products,eligible,components),null);
 assert.equal(quoteBundle([{sku:'RT20',qty:3},{sku:'RT20X3',qty:15}],selection,products,eligible,components),null);
});
test('loyalty threshold and promo switching are explicit on client',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../assets/js/modules/cart.js'),'utf8');
 assert.match(s,/eligibleSpend < 50 \? 'disabled'/);
 assert.match(s,/selectedLoyaltyReward = null;\s*selectedRewardSku = '';\s*setRaw\(PROMO_KEY, code\)/);
});
