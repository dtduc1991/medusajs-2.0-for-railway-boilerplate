import { sdk } from './sdk';
import { getCartId, removeCartId, setCartId } from './cartStorage';
import type { CartItem, Drink, DrinkVariant, ExtraProduct, Milk, Size } from '../types';

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

/**
 * Extras (add-ons) are seeded as their own single-variant products in a
 * dedicated "Extras" category (see backend/src/scripts/seed-coffee.ts) so
 * they get a real price/tax representation while staying excluded from
 * listDrinks() (they have no Size/Milk variants).
 */
export async function listExtras(): Promise<ExtraProduct[]> {
  const region_id = await getRegionId();
  const { products } = await sdk.store.product.list({
    region_id,
    limit: 100,
    fields: '*variants.calculated_price,*categories',
  });
  return products
    .filter((p: any) => p.categories?.some((c: any) => c.name === 'Extras'))
    .map((p: any) => ({
      id: p.variants?.[0]?.id,
      label: p.title,
      price: p.variants?.[0]?.calculated_price?.calculated_amount ?? 0,
    }))
    .filter((e: ExtraProduct): e is ExtraProduct => !!e.id);
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
      parentLineItemId: item.metadata?.parent_line_item_id as string | undefined,
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

/** Adds an extra (add-on) as its own line item, linked to a parent (drink) line item via metadata. */
export async function addExtraLineItem(
  cartId: string,
  variantId: string,
  quantity: number,
  parentLineItemId: string
): Promise<Cart> {
  await sdk.store.cart.createLineItem(cartId, {
    variant_id: variantId,
    quantity,
    metadata: { parent_line_item_id: parentLineItemId },
  });
  return fetchCart(cartId);
}

/**
 * Adds a drink and, in the same add-to-bag action, each selected extra as its
 * own line item linked to the drink's. The drink's own line item id isn't
 * returned by createLineItem directly (only the whole updated cart is), so
 * it's resolved by diffing the cart's item ids before/after the call.
 */
export async function addDrinkWithExtras(
  variantId: string,
  quantity: number,
  extraVariantIds: string[]
): Promise<Cart> {
  const cartId = await getOrCreateCartId();
  const { cart: before } = await sdk.store.cart.retrieve(cartId, { fields: '*items' });
  const priorItemIds = new Set((before.items ?? []).map((item: any) => item.id));

  const { cart: afterDrink } = await sdk.store.cart.createLineItem(cartId, { variant_id: variantId, quantity });
  const drinkLineItem = (afterDrink.items ?? []).find((item: any) => !priorItemIds.has(item.id));
  if (!drinkLineItem) throw new Error('Could not resolve the newly added line item.');

  for (const extraVariantId of extraVariantIds) {
    await addExtraLineItem(cartId, extraVariantId, quantity, drinkLineItem.id);
  }

  return fetchCart(cartId);
}

/** Removes a line item and, if it's a parent (drink) line, any extras linked to it. */
export async function removeLineItem(cartId: string, lineId: string): Promise<Cart> {
  const { cart } = await sdk.store.cart.retrieve(cartId, { fields: '*items' });
  const linkedExtras = (cart.items ?? []).filter(
    (item: any) => item.metadata?.parent_line_item_id === lineId
  );
  for (const extra of linkedExtras) {
    await sdk.store.cart.deleteLineItem(cartId, extra.id);
  }
  await sdk.store.cart.deleteLineItem(cartId, lineId);
  return fetchCart(cartId);
}

/**
 * Changing a drink's cart quantity also scales its linked extras to match —
 * extras are added 1:1 with the drink's quantity at add-time (see
 * addDrinkWithExtras), so keeping them locked to the parent's new quantity
 * here preserves that ratio (e.g. 2 lattes with an extra shot -> 2 shots).
 */
export async function changeLineItemQty(lineId: string, quantity: number): Promise<Cart> {
  const cartId = getCartId();
  if (!cartId) throw new Error('No cart to update');
  if (quantity <= 0) {
    return removeLineItem(cartId, lineId);
  }
  const { cart } = await sdk.store.cart.retrieve(cartId, { fields: '*items' });
  const linkedExtras = (cart.items ?? []).filter(
    (item: any) => item.metadata?.parent_line_item_id === lineId
  );
  await sdk.store.cart.updateLineItem(cartId, lineId, { quantity });
  for (const extra of linkedExtras) {
    await sdk.store.cart.updateLineItem(cartId, extra.id, { quantity });
  }
  return fetchCart(cartId);
}

/**
 * Associates the current cart with the now-authenticated customer via Medusa's
 * built-in transfer-cart-customer workflow (POST /store/carts/:id/customer).
 * Medusa only sets cart.customer_id from the auth context at cart-*creation*
 * time, so a cart started as a guest never picks up a login after the fact
 * without this — call it right after login/signup. Idempotent no-op server-side
 * if the cart already belongs to this customer; returns null if there's no
 * local cart or the transfer fails (e.g. a stale/already-completed cart id).
 */
export async function transferCartToCustomer(): Promise<Cart | null> {
  const cartId = getCartId();
  if (!cartId) return null;
  try {
    const { cart } = await sdk.store.cart.transferCart(cartId);
    return toCart(cart);
  } catch {
    return null;
  }
}

export async function applyPromoCode(code: string): Promise<Cart> {
  const cartId = getCartId();
  if (!cartId) throw new Error('No cart to apply a promotion to');
  await sdk.store.cart.update(cartId, { promo_codes: [code] });
  return fetchCart(cartId);
}
