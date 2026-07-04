/**
 * This app is a pure client-side SPA (no server actions, no httpOnly cookies
 * like the sibling `storefront/` app has) so the cart id just lives in
 * localStorage instead.
 */
const CART_ID_KEY = 'ember_cart_id';

export const getCartId = (): string | null => localStorage.getItem(CART_ID_KEY);
export const setCartId = (id: string): void => localStorage.setItem(CART_ID_KEY, id);
export const removeCartId = (): void => localStorage.removeItem(CART_ID_KEY);
