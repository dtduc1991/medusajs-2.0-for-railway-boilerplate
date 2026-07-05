export type Size = 'Small' | 'Medium' | 'Large';
export type Milk = 'Oat' | 'Whole' | 'Almond' | 'Lactose-free';

/** A purchasable add-on (extra shot, cold foam), backed by a real single-variant Medusa product. */
export interface ExtraProduct {
  id: string;
  label: string;
  price: number;
}

/** One purchasable Size x Milk combination of a Drink, backed by a real Medusa product variant. */
export interface DrinkVariant {
  id: string;
  size: Size;
  milk: Milk;
  price: number;
}

export interface Drink {
  id: string;
  handle: string;
  name: string;
  desc: string;
  /** Cheapest variant's price — used for list-view display before a size/milk is chosen. */
  price: number;
  /** Base tint color for the striped image placeholder — cosmetic only, Medusa has no such field. */
  tint: string;
  category: string;
  tag?: string;
  variants: DrinkVariant[];
  currencyCode: string;
}

/** One line item in the real backend cart. */
export interface CartItem {
  lineId: string;
  productId: string;
  title: string;
  tint: string;
  size: Size | null;
  milk: Milk | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  /** Set when this line item is an extra (add-on) linked to another line item. */
  parentLineItemId?: string;
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
  | { kind: 'detail'; drinkId: string }
  | { kind: 'checkout' }
  | { kind: 'orderConfirmation'; orderId: string; displayId: number };

export interface RewardActivity {
  id: string;
  label: string;
  when: string;
  delta: number; // +earned / -redeemed
  icon: string;
}
