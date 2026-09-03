const REWARDS = {
  CARD_UNLOCK: { label: 'Loyalty card unlocked', kind: 'none' },
  CREDIT_5: { label: '£5 credit', kind: 'credit', amount: 5 },
  FREE_BAC: { label: 'Free 10ml BAC Water', kind: 'gift', bacQty: 1 },
  CREDIT_10: { label: '£10 credit', kind: 'credit', amount: 10 },
  PERCENT_20_CAP_25: { label: '20% off (maximum £25)', kind: 'percent', rate: 0.20, cap: 25 },
  FREE_VIAL_2999: { label: 'One free vial up to £29.99', kind: 'gift', vialCap: 29.99 },
  CREDIT_20: { label: '£20 credit', kind: 'credit', amount: 20 },
  FREE_BAC_VIAL_2999: { label: 'Free BAC Water + one vial up to £29.99', kind: 'gift', bacQty: 1, vialCap: 29.99 },
  PERCENT_30_CAP_50: { label: '30% off (maximum £50)', kind: 'percent', rate: 0.30, cap: 50 },
  FREE_ANY_VIAL: { label: 'Any one single vial free', kind: 'gift', anyVial: true, forceShipping: true },
};

const ELIGIBLE_VIAL_SKUS = new Set(['RT10', 'RT20', 'BC5', 'GHKCU', 'NJ500', 'IP5']);

function enabled() {
  return String(process.env.LOYALTY_REWARDS_ENABLED || '').toLowerCase() === 'true';
}

async function memberSummary(supabase, user) {
  if (!enabled() || !user?.id || !user?.email) return { enabled: false };
  const { data: memberId, error: syncError } = await supabase.rpc('sync_loyalty_member', {
    p_user_id: user.id,
    p_email: String(user.email).trim().toLowerCase(),
  });
  if (syncError) throw syncError;

  const [{ data: stamps, error: stampError }, { data: rewards, error: rewardError }] = await Promise.all([
    supabase.from('loyalty_stamps').select('id,sequence_number,cycle_number,step_number,awarded_at,reversed_at').eq('member_id', memberId).is('reversed_at', null).order('sequence_number'),
    supabase.from('loyalty_rewards').select('id,reward_code,status,created_at,reserved_at,redeemed_at').eq('member_id', memberId).in('status', ['available', 'reserved']).order('created_at'),
  ]);
  if (stampError) throw stampError;
  if (rewardError) throw rewardError;
  const completed = (stamps || []).length;
  return {
    enabled: true,
    completed_orders: completed,
    rewards: (rewards || []).map((row) => ({
      id: row.id,
      code: row.reward_code,
      label: REWARDS[row.reward_code]?.label || row.reward_code,
      status: row.status,
      created_at: row.created_at,
    })),
  };
}

async function getAvailableReward(supabase, userId, rewardId) {
  if (!enabled() || !userId || !rewardId) return null;
  const { data: member, error: memberError } = await supabase.from('loyalty_members').select('id').eq('user_id', userId).maybeSingle();
  if (memberError) throw memberError;
  if (!member) throw new Error('Rewards account not found. Open My Account and try again.');
  const { data: reward, error } = await supabase
    .from('loyalty_rewards')
    .select('id,reward_code,status')
    .eq('id', rewardId)
    .eq('member_id', member.id)
    .eq('status', 'available')
    .maybeSingle();
  if (error) throw error;
  if (!reward) throw new Error('This reward is no longer available.');
  return { ...reward, definition: REWARDS[reward.reward_code] };
}

function rewardQuote(reward, eligibleSubtotal, selectedProduct) {
  if (!reward?.definition) return { discount: 0, gifts: [], forceShipping: false };
  if (Number(eligibleSubtotal || 0) < 50) throw new Error('A £50 qualifying product subtotal is required to use this reward.');
  const definition = reward.definition;
  const gifts = [];
  let discount = 0;
  if (definition.kind === 'credit') discount = Math.min(definition.amount, eligibleSubtotal);
  if (definition.kind === 'percent') discount = Math.min(definition.cap, Number((eligibleSubtotal * definition.rate).toFixed(2)));
  if (definition.bacQty) gifts.push({ sku: 'WA10', qty: definition.bacQty, label: 'UKMAXX Rewards gift' });
  if (definition.vialCap || definition.anyVial) {
    if (!selectedProduct || !ELIGIBLE_VIAL_SKUS.has(selectedProduct.sku) || !selectedProduct.is_active || Number(selectedProduct.stock_quantity) < 1) {
      throw new Error('Choose an available single vial for this reward.');
    }
    if (definition.vialCap && Number(selectedProduct.price) > definition.vialCap) {
      throw new Error(`Choose a vial priced at £${definition.vialCap.toFixed(2)} or less.`);
    }
    gifts.push({ sku: selectedProduct.sku, qty: 1, label: 'UKMAXX Rewards free vial' });
  }
  return { discount: Number(discount.toFixed(2)), gifts, forceShipping: Boolean(definition.forceShipping), label: definition.label };
}

async function reserveReward(supabase, rewardId, reference) {
  if (!rewardId) return;
  const { data, error } = await supabase.from('loyalty_rewards').update({
    status: 'reserved', reserved_reference: reference, reserved_at: new Date().toISOString(),
  }).eq('id', rewardId).eq('status', 'available').select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This reward was already used or reserved.');
}

async function releaseReward(supabase, rewardId, reference) {
  if (!rewardId) return;
  await supabase.from('loyalty_rewards').update({ status: 'available', reserved_reference: null, reserved_at: null })
    .eq('id', rewardId).eq('status', 'reserved').eq('reserved_reference', reference);
}

async function redeemReward(supabase, rewardId, reference, orderId) {
  if (!rewardId) return;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('loyalty_rewards').update({
    status: 'redeemed', redeemed_order_id: orderId, redeemed_at: now,
  }).eq('id', rewardId).eq('status', 'reserved').eq('reserved_reference', reference).select('id').maybeSingle();
  if (error) throw error;
  if (!data) return;
  const { error: orderError } = await supabase.from('orders').update({ loyalty_reward_id: rewardId }).eq('id', orderId);
  if (orderError) throw orderError;
}

module.exports = { REWARDS, enabled, memberSummary, getAvailableReward, rewardQuote, reserveReward, releaseReward, redeemReward };
