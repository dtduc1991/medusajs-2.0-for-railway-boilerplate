import { sdk } from './sdk';
import type { CheckoutAddress } from './checkout';

export interface Customer {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  defaultAddress: CheckoutAddress | null;
}

export interface OrderSummary {
  id: string;
  display_id: number;
  created_at: string;
  item_count: number;
  total: number;
  currency_code: string;
  status: string;
}

function toDefaultAddress(customer: any): CheckoutAddress | null {
  const addresses: any[] = customer.addresses ?? [];
  const address = addresses.find((a) => a.is_default_shipping) ?? addresses[0];
  if (!address) return null;
  return {
    first_name: address.first_name ?? '',
    last_name: address.last_name ?? '',
    address_1: address.address_1 ?? '',
    city: address.city ?? '',
    phone: address.phone ?? '',
  };
}

function toCustomer(customer: any): Customer {
  return {
    id: customer.id,
    email: customer.email,
    phone: customer.phone,
    first_name: customer.first_name,
    last_name: customer.last_name,
    defaultAddress: toDefaultAddress(customer),
  };
}

/**
 * `sdk.auth.register`/`login` already persist the resulting JWT themselves (to
 * localStorage by default) and every subsequent sdk.store.* call auto-attaches
 * it — unlike storefront/'s manual setAuthToken()/getAuthHeaders() cookie
 * plumbing, which only exists to work around Next.js server actions having no
 * persistent client instance across requests.
 *
 * Phone, not email, is the real registered identifier (the `email` field
 * `sdk.auth.register`/`login` expect is just an opaque unique string as far as
 * the emailpass provider cares — no format validation happens server-side).
 * Email is optional, stored on the customer record only. This lets a customer
 * log in with either later — see `login()`'s server-side identifier
 * resolution.
 */
export async function signup(fields: {
  phone: string;
  email?: string;
  password: string;
  first_name: string;
  last_name: string;
  address_1: string;
  city: string;
}): Promise<Customer> {
  try {
    await sdk.auth.register('customer', 'emailpass', { email: fields.phone, password: fields.password });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('already exists')) {
      throw new Error('This phone number is already registered.');
    }
    throw e;
  }
  await sdk.store.customer.create({
    phone: fields.phone,
    email: fields.email || undefined,
    first_name: fields.first_name,
    last_name: fields.last_name,
  });
  await sdk.auth.login('customer', 'emailpass', { email: fields.phone, password: fields.password });
  await sdk.store.customer.createAddress({
    first_name: fields.first_name,
    last_name: fields.last_name,
    address_1: fields.address_1,
    city: fields.city,
    phone: fields.phone,
    is_default_shipping: true,
  } as any);
  return getCurrentCustomer() as Promise<Customer>;
}

/** `identifier` may be the customer's phone number or their email. */
export async function login(identifier: string, password: string): Promise<Customer> {
  const { token } = await sdk.client.fetch<{ token: string }>('/auth/customer/emailpass/login-by-identifier', {
    method: 'POST',
    body: { identifier, password },
  });
  sdk.client.setToken(token);
  return getCurrentCustomer() as Promise<Customer>;
}

export async function logout(): Promise<void> {
  await sdk.auth.logout();
}

export async function getCurrentCustomer(): Promise<Customer | null> {
  try {
    const { customer } = await sdk.store.customer.retrieve();
    return toCustomer(customer);
  } catch {
    return null;
  }
}

export async function listMyOrders(): Promise<OrderSummary[]> {
  const { orders } = await sdk.store.order.list({ limit: 20 });
  return orders.map((o: any) => ({
    id: o.id,
    display_id: o.display_id,
    created_at: o.created_at,
    item_count: (o.items ?? []).reduce((s: number, it: any) => s + it.quantity, 0),
    total: o.total,
    currency_code: o.currency_code,
    status: o.fulfillment_status ?? o.status,
  }));
}
