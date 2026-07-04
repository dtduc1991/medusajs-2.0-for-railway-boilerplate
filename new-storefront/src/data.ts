import type { Extra, RewardActivity } from './types';

/**
 * STORE, USER, EXTRAS and REWARD_ACTIVITY stay mocked — none of them have a
 * first-class Medusa backend equivalent yet (see new-storefront/docs/backend-integration.md
 * "Gaps with no first-class Medusa equivalent"). Drinks/categories and the cart
 * are fetched for real via src/lib/backend.ts.
 */

export const STORE = { name: 'Ember', location: 'Mission St', etaMinutes: 8 };
export const USER = { firstName: 'Alex', stars: 240, starsToReward: 4, rewardThreshold: 8 };

export const EXTRAS: Extra[] = [
  { id: 'shot', label: 'Extra espresso shot', price: 0.9 },
  { id: 'foam', label: 'Cold foam top', price: 0.7 },
];

export const REWARD_ACTIVITY: RewardActivity[] = [
  { id: 'a1', label: 'Iced Cortado', when: 'Today · 8:14 AM', delta: 12, icon: 'Coffee' },
  { id: 'a2', label: 'Free drink redeemed', when: 'Mar 18', delta: -80, icon: 'Gift' },
  { id: 'a3', label: 'Cold Brew Tonic', when: 'Mar 16', delta: 14, icon: 'Coffee' },
];

export const money = (n: number, currencyCode: string = 'eur'): string =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode.toUpperCase() }).format(n);
