import { sdk } from './sdk';

export interface Customer {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
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

function toCustomer(customer: any): Customer {
  return {
    id: customer.id,
    email: customer.email,
    first_name: customer.first_name,
    last_name: customer.last_name,
  };
}

/**
 * `sdk.auth.register`/`login` already persist the resulting JWT themselves (to
 * localStorage by default) and every subsequent sdk.store.* call auto-attaches
 * it — unlike storefront/'s manual setAuthToken()/getAuthHeaders() cookie
 * plumbing, which only exists to work around Next.js server actions having no
 * persistent client instance across requests.
 */
export async function signup(fields: { email: string; password: string; first_name: string; last_name: string }): Promise<Customer> {
  await sdk.auth.register('customer', 'emailpass', { email: fields.email, password: fields.password });
  await sdk.store.customer.create({
    email: fields.email,
    first_name: fields.first_name,
    last_name: fields.last_name,
  });
  await sdk.auth.login('customer', 'emailpass', { email: fields.email, password: fields.password });
  return getCurrentCustomer() as Promise<Customer>;
}

export async function login(email: string, password: string): Promise<Customer> {
  await sdk.auth.login('customer', 'emailpass', { email, password });
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
