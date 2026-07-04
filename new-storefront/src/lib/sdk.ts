import Medusa from '@medusajs/js-sdk';

export const MEDUSA_BACKEND_URL = import.meta.env.VITE_MEDUSA_BACKEND_URL ?? 'http://localhost:9000';

// Note: the backend's /key-exchange route (used to auto-resolve this at Railway
// build time, see docs/railway.md) isn't reachable from a browser at runtime —
// it isn't covered by STORE_CORS, only server-to-server build-time fetches are.
// So, same as storefront/, the publishable key must be set explicitly.
export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: import.meta.env.DEV,
  publishableKey: import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY,
});
