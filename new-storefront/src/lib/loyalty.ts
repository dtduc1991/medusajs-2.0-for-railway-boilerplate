import { sdk } from './sdk';
import type { RewardActivity } from '../types';

export interface LoyaltyAccount {
  balance: number;
  activity: RewardActivity[];
}

interface LoyaltyTransactionDTO {
  id: string;
  amount: number;
  reason: string;
  reference_id: string | null;
  created_at: string;
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

  return {
    balance,
    activity: transactions.map((t) => ({
      id: t.id,
      label: t.reason === 'order.placed' ? 'Order placed' : t.reason,
      when: new Date(t.created_at).toLocaleDateString(),
      delta: t.amount,
      icon: t.amount > 0 ? 'Coffee' : 'Gift',
    })),
  };
}
