import { sdk } from './sdk';
import { removeCartId } from './cartStorage';

export interface CheckoutAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  city: string;
  postal_code: string;
  country_code: string;
}

export interface ShippingOption {
  id: string;
  name: string;
  amount: number;
}

export async function listShippingOptions(cartId: string): Promise<ShippingOption[]> {
  const { shipping_options } = await sdk.store.fulfillment.listCartOptions({ cart_id: cartId });
  return shipping_options.map((o: any) => ({
    id: o.id,
    name: o.name,
    amount: o.calculated_price?.calculated_amount ?? o.amount ?? 0,
  }));
}

export async function setCheckoutAddress(cartId: string, address: CheckoutAddress, email: string): Promise<void> {
  await sdk.store.cart.update(cartId, {
    email,
    shipping_address: address,
    billing_address: address,
  });
}

export async function setShippingMethod(cartId: string, optionId: string): Promise<void> {
  await sdk.store.cart.addShippingMethod(cartId, { option_id: optionId });
}

/**
 * Completes the checkout: initiates a payment session against whichever provider
 * the region has configured (this repo's seed only ever configures one,
 * `pp_system_default` — a manual/no-gateway provider that authorizes on complete
 * with no further user interaction) and completes the cart into an order.
 *
 * Unlike storefront/'s placeOrder(), a `{ type: "cart" }` response (completion
 * rejected server-side) throws instead of silently returning — storefront/'s
 * silent-failure branch is a documented bug (docs/flows/checkout-flow.md), not a
 * pattern to repeat here.
 */
export async function placeOrder(cartId: string, regionId: string): Promise<{ id: string; display_id: number }> {
  const { cart } = await sdk.store.cart.retrieve(cartId);
  const { payment_providers } = await sdk.store.payment.listPaymentProviders({ region_id: regionId });
  if (!payment_providers.length) {
    throw new Error('No payment providers configured for this region.');
  }
  await sdk.store.payment.initiatePaymentSession(cart, { provider_id: payment_providers[0].id });

  const result: any = await sdk.store.cart.complete(cartId);
  if (result.type !== 'order') {
    throw new Error(result.error?.message ?? 'Checkout could not be completed. Please review your details and try again.');
  }
  removeCartId();
  return result.order;
}
