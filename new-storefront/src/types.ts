export type Size = 'Small' | 'Medium' | 'Large';
export type Milk = 'Oat' | 'Whole' | 'Almond' | 'Lactose-free';

export interface Extra {
  id: string;
  label: string;
  price: number;
}

export interface Drink {
  id: string;
  name: string;
  desc: string;
  price: number;
  /** Base tint color for the striped image placeholder. */
  tint: string;
  category: string;
  tag?: string;
}

export interface CartItem {
  /** Unique line id (a drink can appear multiple times with different options). */
  lineId: string;
  drink: Drink;
  size: Size;
  milk: Milk;
  extras: Extra[];
  qty: number;
  /** Per-unit price including size + extras. */
  unitPrice: number;
}

export interface ChatMessage {
  id: string;
  from: 'bot' | 'user';
  text: string;
  /** Optional drink recommendation card rendered inside the bubble. */
  card?: Drink;
  /** Optional gold "rewards nudge" styling. */
  nudge?: boolean;
}

export type Tab = 'menu' | 'rewards' | 'chat' | 'bag' | 'you';

export type View =
  | { kind: 'tab'; tab: Tab }
  | { kind: 'detail'; drinkId: string };

export interface RewardActivity {
  id: string;
  label: string;
  when: string;
  delta: number; // +earned / -redeemed
  icon: string;
}
