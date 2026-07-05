/**
 * STORE and USER stay mocked — neither has a first-class Medusa backend
 * equivalent yet (see new-storefront/docs/backend-integration.md "Gaps with
 * no first-class Medusa equivalent"). Drinks/categories, the cart, extras and
 * the loyalty ledger are fetched for real via src/lib/backend.ts/loyalty.ts.
 */

export const STORE = { name: 'Ember', location: 'Mission St', etaMinutes: 8 };
export const USER = { firstName: 'Alex' };

export const money = (n: number, currencyCode: string = 'eur'): string =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode.toUpperCase() }).format(n);
