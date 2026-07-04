import { sdk } from './sdk';
import { getCartId, removeCartId, setCartId } from './cartStorage';
import type { CartItem, Drink, DrinkVariant, Milk, Size } from '../types';

/** Cosmetic-only tints keyed by product handle — Medusa has no "photo tint" field. */
const TINTS: Record<string, string> = {
  'brown-sugar-oat-latte': '#F7E8D6',
  'iced-cortado': '#EFE2D2',
  'pistachio-matcha': '#E4E9DC',
  'cold-brew-tonic': '#E7DECF',
};
const FALLBACK_TINT = '#EFE2D2';

let regionIdPromise: Promise<string> | null = null;

/** This app assumes a single region/currency, resolved once and cached for the session. */
export async function getRegionId(): Promise<string> {
  if (!regionIdPromise) {
    regionIdPromise = sdk.store.region
      .list({})
      .then(({ regions }) => {
        if (!regions.length) {
          throw new Error('No regions configured on the backend.');
        }
        return regions[0].id;
      });
  }
  return regionIdPromise;
}

function toVariant(variant: any, optionTitleById: Map<string, string>): DrinkVariant | null {
  let size: Size | undefined;
  let milk: Milk | undefined;
  for (const opt of variant.options ?? []) {
    const title = optionTitleById.get(opt.option_id);
    if (title === 'Size') size = opt.value;
    if (title === 'Milk') milk = opt.value;
  }
  if (!size || !milk) return null;
  return {
    id: variant.id,
    size,
    milk,
    price: variant.calculated_price?.calculated_amount ?? 0,
  };
}

function toDrink(product: any): Drink {
  const optionTitleById = new Map<string, string>(
    (product.options ?? []).map((o: any) => [o.id, o.title])
  );
  const variants = (product.variants ?? [])
    .map((v: any) => toVariant(v, optionTitleById))
    .filter((v: DrinkVariant | null): v is DrinkVariant => v !== null);

  const price = variants.length ? Math.min(...variants.map((v: DrinkVariant) => v.price)) : 0;

  return {
    id: product.id,
    handle: product.handle,
    name: product.title,
    desc: product.description ?? '',
    price,
    tint: TINTS[product.handle] ?? FALLBACK_TINT,
    category: product.categories?.[0]?.name ?? 'Coffee',
    variants,
    currencyCode: product.variants?.[0]?.calculated_price?.currency_code ?? 'eur',
  };
}

/**
 * This backend also carries the generic Medusa demo catalog (shirts, etc.) from
 * backend/src/scripts/seed.ts alongside the coffee catalog from seed-coffee.ts.
 * Ember only knows how to render a Size x Milk drink, so products without both
 * option dimensions (i.e. everything that isn't a seeded coffee product) are
 * dropped here rather than shown with a broken/zero price.
 */
export async function listDrinks(): Promise<Drink[]> {
  const region_id = await getRegionId();
  const { products } = await sdk.store.product.list({
    region_id,
    limit: 100,
    fields: '*variants.calculated_price,*variants.options,*options,*categories',
  });
  return products.map(toDrink).filter((d: Drink) => d.variants.length > 0);
}

/* ---------------------------------- Cart --------------------------------- */

export interface Cart {
  id: string;
  currencyCode: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
}

function parseVariantTitle(variantTitle: string | null | undefined): { size: Size | null; milk: Milk | null } {
  const [size, milk] = (variantTitle ?? '').split(' / ');
  return { size: (size as Size) ?? null, milk: (milk as Milk) ?? null };
}

function toCart(cart: any): Cart {
  const items: CartItem[] = (cart.items ?? []).map((item: any) => {
    const { size, milk } = parseVariantTitle(item.variant_title);
    return {
      lineId: item.id,
      productId: item.product_id,
      title: item.product_title ?? item.title,
      tint: TINTS[item.product_handle] ?? FALLBACK_TINT,
      size,
      milk,
      qty: item.quantity,
      unitPrice: item.unit_price,
      lineTotal: item.total ?? item.subtotal ?? item.unit_price * item.quantity,
    };
  });

  return {
    id: cart.id,
    currencyCode: cart.currency_code,
    items,
    subtotal: cart.item_subtotal ?? cart.subtotal ?? 0,
    tax: cart.tax_total ?? 0,
    total: cart.total ?? 0,
  };
}

async function fetchCart(cartId: string): Promise<Cart> {
  const { cart } = await sdk.store.cart.retrieve(cartId, { fields: '*items' });
  return toCart(cart);
}

export async function retrieveCart(): Promise<Cart | null> {
  const cartId = getCartId();
  if (!cartId) return null;
  try {
    return await fetchCart(cartId);
  } catch {
    removeCartId();
    return null;
  }
}

async function getOrCreateCartId(): Promise<string> {
  const existing = getCartId();
  if (existing) return existing;
  const region_id = await getRegionId();
  const { cart } = await sdk.store.cart.create({ region_id });
  setCartId(cart.id);
  return cart.id;
}

export async function addLineItem(variantId: string, quantity: number): Promise<Cart> {
  const cartId = await getOrCreateCartId();
  await sdk.store.cart.createLineItem(cartId, { variant_id: variantId, quantity });
  return fetchCart(cartId);
}

export async function changeLineItemQty(lineId: string, quantity: number): Promise<Cart> {
  const cartId = getCartId();
  if (!cartId) throw new Error('No cart to update');
  if (quantity <= 0) {
    await sdk.store.cart.deleteLineItem(cartId, lineId);
  } else {
    await sdk.store.cart.updateLineItem(cartId, lineId, { quantity });
  }
  return fetchCart(cartId);
}

export async function applyPromoCode(code: string): Promise<Cart> {
  const cartId = getCartId();
  if (!cartId) throw new Error('No cart to apply a promotion to');
  await sdk.store.cart.update(cartId, { promo_codes: [code] });
  return fetchCart(cartId);
}
