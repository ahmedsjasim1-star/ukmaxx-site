const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePromise = import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(__dirname, '../assets/js/modules/bundleGroups.js'), 'utf8')).toString('base64'));
test('custom bundle grouping preserves separate selections and extra singles', async () => {
 const {projectBundles,subtractBundle} = await modulePromise;
 const a={id:'a',selection:['RT20','BC5','GHKCU']}, b={id:'b',selection:['BC5','BC5','GHKCU']};
 const cart=[{sku:'RT20',qty:2,bundleQty:1},{sku:'BC5',qty:3,bundleQty:3},{sku:'GHKCU',qty:2,bundleQty:2},{sku:'WA10',qty:3}];
 const view=projectBundles(cart,[a,b]);
 assert.deepEqual(view.groups,[a,b]);
 assert.deepEqual(view.singles.map(i=>[i.sku,i.qty]),[['RT20',1],['WA10',1]]);
 const removed=projectBundles(subtractBundle(cart,a),[b]);
 assert.deepEqual(removed.groups,[b]);
 assert.deepEqual(removed.singles.map(i=>[i.sku,i.qty]),[['RT20',1],['WA10',1]]);
});
test('legacy baskets recover complete groups without losing units', async () => {
 const {projectBundles}=await modulePromise;
 const cart=[{sku:'BC5',qty:4,bundleQty:4},{sku:'WA10',qty:2}];
 const view=projectBundles(cart);
 assert.equal(view.groups.length,1);
 assert.deepEqual(view.groups[0].selection,['BC5','BC5','BC5']);
 assert.deepEqual(view.singles.map(i=>[i.sku,i.qty]),[['BC5',1],['WA10',1]]);
 assert.deepEqual(projectBundles(cart,view.groups),view);
 assert.equal(projectBundles([{sku:'BC5',qty:3,bundleQty:3}]).groups.length,0);
});
test('bundle displayed price uses per-vial penny rounding and excludes free water', async () => {
 const {bundlePrice}=await modulePromise;
 const products={RT20:{price:64.99},BC5:{price:29.99},GHKCU:{price:29.99}};
 assert.equal(bundlePrice(['RT20','BC5','GHKCU'],products),118.72);
 assert.equal(bundlePrice(['RT20','RT20','RT20'],products),185.22);
 assert.equal(Number((118.72*.9).toFixed(2)),106.85);
});
