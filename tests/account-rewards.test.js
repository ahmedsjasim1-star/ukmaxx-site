const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('account rewards card publishes the agreed ten-step ladder', () => {
  const account = read('assets/js/modules/account.js');
  assert.match(account, /Loyalty card unlocked/);
  assert.match(account, /£5 credit/);
  assert.match(account, /Free 10ml BAC Water/);
  assert.match(account, /£10 credit/);
  assert.match(account, /20% off · maximum £25/);
  assert.match(account, /One free vial up to £29\.99/);
  assert.match(account, /£20 credit/);
  assert.match(account, /Free BAC Water \+ one vial up to £29\.99/);
  assert.match(account, /30% off · maximum £50/);
  assert.match(account, /Any one single vial free · delivery applies/);
  assert.match(account, /Spend at least <strong>£50 on products<\/strong>/);
});

test('account history uses order-level batch allocations', () => {
  const api = read('api/account-orders.js');
  const account = read('assets/js/modules/account.js');
  assert.match(api, /from\('order_batch_allocations'\)/);
  assert.match(api, /batch_code,product_name,coa_url,release_status/);
  assert.match(account, /View supplied COA/);
  assert.doesNotMatch(account, /product\?\.coaUrl/);
});

test('authentication redirects stay on the UKMAXX origin', () => {
  const auth = read('assets/js/modules/auth.js');
  assert.match(auth, /target\.origin !== window\.location\.origin/);
  assert.doesNotMatch(auth, /Supabase response/);
  assert.match(auth, /setupPasswordToggles/);
});

test('live rewards stay hidden until the feature flag is enabled', () => {
  const account = read('assets/js/modules/account.js');
  const loyalty = read('api/_lib/loyalty.js');
  assert.match(account, /if \(!data\.loyalty\?\.enabled\)/);
  assert.match(account, /root\.hidden = true/);
  assert.match(loyalty, /LOYALTY_REWARDS_ENABLED/);
});

test('checkout supports one non-stacking reward with server-side enforcement', () => {
  const cart = read('assets/js/modules/cart.js');
  const checkout = read('api/create-fena-payment.js');
  const webhook = read('api/fena-webhook.js');
  assert.match(cart, /loyaltyRewardId/);
  assert.match(cart, /removeStorage\(PROMO_KEY\)/);
  assert.doesNotMatch(cart, /id="rewardVialSelect"/);
  assert.match(checkout, /Use either a UKMAXX reward or a promo code/);
  assert.match(checkout, /reserveReward/);
  assert.match(webhook, /redeemReward/);
  assert.match(webhook, /releaseReward/);
});

test('loyalty migration records delivered qualifying orders in a ten-step cycle', () => {
  const migration = read('supabase/migrations/20260903_loyalty_rewards.sql');
  assert.match(migration, /o\.status = 'delivered'/);
  assert.match(migration, />= 50/);
  assert.match(migration, /\(\(v_sequence - 1\) % 10\) \+ 1/);
  assert.match(migration, /when 10 then 'FREE_ANY_VIAL'/);
  assert.match(migration, /security definer/);
  assert.match(migration, /grant execute on function public\.sync_loyalty_member\(uuid,text\) to service_role/);
});
