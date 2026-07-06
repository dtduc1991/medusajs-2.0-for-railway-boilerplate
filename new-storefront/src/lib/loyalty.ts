import { sdk } from './sdk';
import type { RewardActivity } from '../types';

export interface LoyaltyAccount {
  balance: number;
  activity: RewardActivity[];
}

export interface LoyaltyConfig {
  pointsPerCurrencyUnit: number;
  rewardThreshold: number;
}

interface LoyaltyTransactionDTO {
  id: string;
  amount: number;
  reason: string;
  reference_id: string | null;
  created_at: string;
}

const REASON_LABELS: Record<string, string> = {
  'order.placed': 'Order placed',
  'reward.redeemed': 'Free drink redeemed',
};

function toActivity(transactions: LoyaltyTransactionDTO[]): RewardActivity[] {
  return transactions.map((t) => ({
    id: t.id,
    label: REASON_LABELS[t.reason] ?? t.reason,
    when: new Date(t.created_at).toLocaleDateString(),
    delta: t.amount,
    icon: t.amount > 0 ? 'Coffee' : 'Gift',
  }));
}

/**
 * First use of the SDK's generic `client.fetch` escape hatch in this app —
 * this is a custom backend route (`GET /store/loyalty`), not one of the
 * SDK's typed `sdk.store.*` methods. Publishable-key/JWT headers are still
 * attached automatically by the Client, same as every other call.
 */
export async function getLoyaltyAccount(): Promise<LoyaltyAccount> {
  const { balance, transactions } = await sdk.client.fetch<{
    balance: number;
    transactions: LoyaltyTransactionDTO[];
  }>('/store/loyalty', {
    method: 'GET',
    headers: { accept: 'application/json' },
  });

  return { balance, activity: toActivity(transactions) };
}

/** Public config (points-per-currency-unit, reward threshold) — no auth required. */
export async function getLoyaltyConfig(): Promise<LoyaltyConfig> {
  return sdk.client.fetch<LoyaltyConfig>('/store/loyalty/config', {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
}

/**
 * Debits REWARD_THRESHOLD points for a free-drink reward; 400s if the balance
 * is short. `code` is a real, single-use Medusa promotion code (100% off one
 * drink) minted server-side — the caller is responsible for applying it to a
 * cart (e.g. via `applyPromoCode`), this call only mints and debits.
 */
export async function redeemReward(): Promise<LoyaltyAccount & { code: string }> {
  const { balance, transactions, code } = await sdk.client.fetch<{
    balance: number;
    transactions: LoyaltyTransactionDTO[];
    code: string;
  }>('/store/loyalty/redeem', {
    method: 'POST',
    headers: { accept: 'application/json' },
  });

  return { balance, activity: toActivity(transactions), code };
}
