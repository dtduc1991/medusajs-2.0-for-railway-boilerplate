import type { Drink, Extra, Size, RewardActivity } from './types';

export const STORE = { name: 'Ember', location: 'Mission St', etaMinutes: 8 };
export const USER = { firstName: 'Alex', stars: 240, starsToReward: 4, rewardThreshold: 8 };

/** Price multipliers per cup size. */
export const SIZE_DELTA: Record<Size, number> = {
  Small: -0.5,
  Medium: 0,
  Large: 0.6,
};

export const EXTRAS: Extra[] = [
  { id: 'shot', label: 'Extra espresso shot', price: 0.9 },
  { id: 'foam', label: 'Cold foam top', price: 0.7 },
];

export const DRINKS: Drink[] = [
  {
    id: 'bs-oat-latte',
    name: 'Brown Sugar Oat Latte',
    desc: 'Espresso, oat milk and slow-cooked brown sugar over ice.',
    price: 5.75,
    tint: '#F7E8D6',
    category: 'Espresso',
    tag: "Editor's pick",
  },
  {
    id: 'iced-cortado',
    name: 'Iced Cortado',
    desc: 'Double shot, splash of milk.',
    price: 4.25,
    tint: '#EFE2D2',
    category: 'Espresso',
  },
  {
    id: 'pistachio-matcha',
    name: 'Pistachio Matcha',
    desc: 'Stone-ground matcha, oat milk, pistachio.',
    price: 6.25,
    tint: '#E4E9DC',
    category: 'Matcha',
  },
  {
    id: 'cold-brew-tonic',
    name: 'Cold Brew Tonic',
    desc: '18-hour cold brew over tonic and citrus.',
    price: 5.5,
    tint: '#E7DECF',
    category: 'Cold',
  },
];

export const CATEGORIES = ['Espresso', 'Cold', 'Matcha', 'Bakery'];

export const REWARD_ACTIVITY: RewardActivity[] = [
  { id: 'a1', label: 'Iced Cortado', when: 'Today · 8:14 AM', delta: 12, icon: 'Coffee' },
  { id: 'a2', label: 'Free drink redeemed', when: 'Mar 18', delta: -80, icon: 'Gift' },
  { id: 'a3', label: 'Cold Brew Tonic', when: 'Mar 16', delta: 14, icon: 'Coffee' },
];

export const byId = (id: string): Drink | undefined => DRINKS.find((d) => d.id === id);

export const money = (n: number): string => `$${n.toFixed(2)}`;
