import { useEffect, useMemo, useState } from 'react';
import { theme } from './theme';
import { PhoneFrame } from './components/PhoneFrame';
import { TabBar } from './components/TabBar';
import { MenuScreen } from './screens/MenuScreen';
import { DrinkDetailScreen } from './screens/DrinkDetailScreen';
import { RewardsScreen } from './screens/RewardsScreen';
import { ChatScreen } from './screens/ChatScreen';
import { CartScreen } from './screens/CartScreen';
import { CheckoutScreen } from './screens/CheckoutScreen';
import { OrderConfirmationScreen } from './screens/OrderConfirmationScreen';
import { AccountScreen } from './screens/AccountScreen';
import {
  addDrinkWithExtras,
  addLineItem,
  applyPromoCode,
  changeLineItemQty,
  listDrinks,
  listExtras,
  retrieveCart,
  transferCartToCustomer,
  type Cart,
} from './lib/backend';
import { getCurrentCustomer, login, logout, signup, type Customer } from './lib/auth';
import { getLoyaltyConfig, redeemReward, type LoyaltyConfig } from './lib/loyalty';
import type { Drink, ExtraProduct, Tab, View } from './types';

/** Used until the real config loads (and if it fails to) — matches the backend's own default. */
const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = { pointsPerCurrencyUnit: 2, rewardThreshold: 8 };

export default function App() {
  const [view, setView] = useState<View>({ kind: 'tab', tab: 'menu' });
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [extras, setExtras] = useState<ExtraProduct[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [chatVariant, setChatVariant] = useState<'bubbles' | 'voice'>('bubbles');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loyaltyConfig, setLoyaltyConfig] = useState<LoyaltyConfig>(DEFAULT_LOYALTY_CONFIG);

  useEffect(() => {
    Promise.all([listDrinks(), listExtras(), retrieveCart()])
      .then(([fetchedDrinks, fetchedExtras, fetchedCart]) => {
        setDrinks(fetchedDrinks);
        setExtras(fetchedExtras);
        setCart(fetchedCart);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));

    // Public config, independent of the drinks/cart bootstrap — a guest with
    // no account still needs it for the cart's "Earns +N stars" estimate.
    getLoyaltyConfig()
      .then(setLoyaltyConfig)
      .catch(() => {});

    // Independent of the drinks/cart bootstrap above — a failed/slow auth
    // check shouldn't block menu/cart from rendering.
    getCurrentCustomer().then(setCustomer);
  }, []);

  // Finding 3 (docs/handoffs/new-storefront-high-severity-ux-fixes): reaching
  // the checkout view with an empty/null cart (e.g. a race where the cart
  // empties out from under the user between pressing "Pay" and this screen
  // mounting) used to render a bare, TabBar-less "Your bag is empty." dead
  // end with no way back. Instead, reroute to the Bag tab, whose empty-cart
  // state already has the right icon/heading/"Browse the menu" CTA and a
  // normal, functional TabBar.
  useEffect(() => {
    if (view.kind === 'checkout' && (!cart || cart.items.length === 0)) {
      setView({ kind: 'tab', tab: 'bag' });
    }
  }, [view, cart]);

  // Only categories that a fetched drink actually belongs to — no point showing an
  // empty category chip (see listDrinks() in lib/backend.ts for why some products
  // are filtered out entirely).
  const categories = useMemo(() => Array.from(new Set(drinks.map((d) => d.category))), [drinks]);

  const bagCount = useMemo(() => cart?.items.reduce((s, it) => s + it.qty, 0) ?? 0, [cart]);

  const byId = (id: string) => drinks.find((d) => d.id === id);

  const addVariantToCart = async (variantId: string, quantity: number) => {
    const next = await addLineItem(variantId, quantity);
    setCart(next);
  };

  const addDrinkWithExtrasToCart = async (variantId: string, quantity: number, extraVariantIds: string[]) => {
    const next = await addDrinkWithExtras(variantId, quantity, extraVariantIds);
    setCart(next);
  };

  /**
   * Quick-add uses sensible defaults (Medium / Oat). Returns the
   * add-to-cart promise (rather than being fire-and-forget) so callers
   * (MenuScreen, ChatScreen) can await/catch it and only show success state
   * once the cart update actually lands — see
   * docs/handoffs/new-storefront-high-severity-ux-fixes for the bug this
   * fixes (a false-positive success checkmark on a rejected network call).
   */
  const quickAdd = (drink: Drink): Promise<void> => {
    const variant = drink.variants.find((v) => v.size === 'Medium' && v.milk === 'Oat') ?? drink.variants[0];
    if (!variant) return Promise.reject(new Error('This drink has no available options right now.'));
    return addVariantToCart(variant.id, 1);
  };

  const changeQty = (lineId: string, delta: number) => {
    const current = cart?.items.find((it) => it.lineId === lineId);
    if (!current) return;
    changeLineItemQty(lineId, current.qty + delta).then(setCart);
  };

  const applyPromo = (code: string) => {
    setPromoError(null);
    applyPromoCode(code)
      .then(setCart)
      .catch((e) => setPromoError(e instanceof Error ? e.message : String(e)));
  };

  // Mints the real, single-use promotion code server-side, then tries to apply
  // it to the current cart right away (same mechanism as the manual "Apply a
  // promo code" flow). There may be no cart yet (e.g. redeeming right after an
  // order, before adding anything new) — that's not an error, the code is
  // still valid and shown to the customer to apply later.
  const handleRedeem = async () => {
    const { balance, activity, code } = await redeemReward();
    let appliedToCart = false;
    try {
      const next = await applyPromoCode(code);
      setCart(next);
      appliedToCart = true;
    } catch {
      // No cart to apply to right now — the code itself is still redeemed and valid.
    }
    return { account: { balance, activity }, code, appliedToCart };
  };

  const goTab = (tab: Tab) => setView({ kind: 'tab', tab });

  // A cart created before login/signup is otherwise never attributed to the
  // customer (Medusa fixes cart->customer at cart-creation time), so any order
  // placed from it wouldn't earn loyalty points. Transfer it right after auth.
  const handleLogin = async (identifier: string, password: string) => {
    setCustomer(await login(identifier, password));
    const transferred = await transferCartToCustomer();
    if (transferred) setCart(transferred);
  };
  const handleSignup = async (fields: {
    phone: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    address_1: string;
    city: string;
  }) => {
    setCustomer(await signup(fields));
    const transferred = await transferCartToCustomer();
    if (transferred) setCart(transferred);
  };
  const handleLogout = () => {
    void logout();
    setCustomer(null);
  };

  const dark = view.kind === 'tab' && view.tab === 'chat' && chatVariant === 'voice';

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: dark ? theme.dark : '#E8E1D5',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <PhoneFrame dark={dark}>
        {loading ? (
          <StatusMessage text="Loading menu…" />
        ) : error ? (
          <StatusMessage text={`Couldn't reach the backend: ${error}`} />
        ) : view.kind === 'detail' ? (
          <DrinkDetailScreen
            drink={byId(view.drinkId)!}
            extras={extras}
            onBack={() => goTab('menu')}
            onAdd={(variantId, quantity, extraVariantIds) => {
              void addDrinkWithExtrasToCart(variantId, quantity, extraVariantIds);
              goTab('bag');
            }}
          />
        ) : view.kind === 'checkout' ? (
          cart && cart.items.length > 0 ? (
            <CheckoutScreen
              cart={cart}
              customer={customer}
              onBack={() => goTab('bag')}
              onGoToAccount={() => goTab('you')}
              onPlaced={(orderId, displayId) => {
                setCart(null);
                setView({ kind: 'orderConfirmation', orderId, displayId });
              }}
            />
          ) : (
            // Transient: the useEffect above corrects `view` to the Bag tab
            // on the very next render — never a permanent, affordance-less
            // dead end (see Finding 3).
            null
          )
        ) : view.kind === 'orderConfirmation' ? (
          <OrderConfirmationScreen displayId={view.displayId} onDone={() => goTab('menu')} />
        ) : (
          <>
            {/* Tabbed screens */}
            {view.tab === 'menu' && (
              <MenuScreen
                drinks={drinks}
                categories={categories}
                customer={customer}
                onOpenDrink={(id) => setView({ kind: 'detail', drinkId: id })}
                onQuickAdd={quickAdd}
              />
            )}
            {view.tab === 'rewards' && (
              <RewardsScreen customer={customer} rewardThreshold={loyaltyConfig.rewardThreshold} onRedeem={handleRedeem} />
            )}
            {view.tab === 'chat' && (
              <ChatScreen
                drinks={drinks}
                variant={chatVariant}
                onToggleVariant={setChatVariant}
                onExit={() => goTab('menu')}
                onAdd={async (d) => {
                  await quickAdd(d);
                  goTab('bag');
                }}
              />
            )}
            {view.tab === 'bag' && (
              <CartScreen
                cart={cart}
                onQty={changeQty}
                onApplyPromo={applyPromo}
                promoError={promoError}
                onBrowse={() => goTab('menu')}
                onPay={() => setView({ kind: 'checkout' })}
                pointsPerCurrencyUnit={loyaltyConfig.pointsPerCurrencyUnit}
              />
            )}
            {view.tab === 'you' && (
              <AccountScreen customer={customer} onLogin={handleLogin} onSignup={handleSignup} onLogout={handleLogout} />
            )}

            {/* Chat is full-bleed dark; other tabs show the nav bar */}
            {view.tab !== 'chat' && <TabBar active={view.tab} onChange={goTab} bagCount={bagCount} />}
          </>
        )}
      </PhoneFrame>
    </div>
  );
}

function StatusMessage({ text }: { text: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', font: `500 14px ${theme.body}`, color: theme.muted }}>
      {text}
    </div>
  );
}
