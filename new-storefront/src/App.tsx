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
import type { Drink, ExtraProduct, Tab, View } from './types';

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

  useEffect(() => {
    Promise.all([listDrinks(), listExtras(), retrieveCart()])
      .then(([fetchedDrinks, fetchedExtras, fetchedCart]) => {
        setDrinks(fetchedDrinks);
        setExtras(fetchedExtras);
        setCart(fetchedCart);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));

    // Independent of the drinks/cart bootstrap above — a failed/slow auth
    // check shouldn't block menu/cart from rendering.
    getCurrentCustomer().then(setCustomer);
  }, []);

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

  /** Quick-add uses sensible defaults (Medium / Oat). */
  const quickAdd = (drink: Drink) => {
    const variant = drink.variants.find((v) => v.size === 'Medium' && v.milk === 'Oat') ?? drink.variants[0];
    if (!variant) return;
    void addVariantToCart(variant.id, 1);
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

  const goTab = (tab: Tab) => setView({ kind: 'tab', tab });

  // A cart created before login/signup is otherwise never attributed to the
  // customer (Medusa fixes cart->customer at cart-creation time), so any order
  // placed from it wouldn't earn loyalty points. Transfer it right after auth.
  const handleLogin = async (email: string, password: string) => {
    setCustomer(await login(email, password));
    const transferred = await transferCartToCustomer();
    if (transferred) setCart(transferred);
  };
  const handleSignup = async (fields: { email: string; password: string; first_name: string; last_name: string }) => {
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
              onBack={() => goTab('bag')}
              onPlaced={(orderId, displayId) => {
                setCart(null);
                setView({ kind: 'orderConfirmation', orderId, displayId });
              }}
            />
          ) : (
            <StatusMessage text="Your bag is empty." />
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
                onOpenDrink={(id) => setView({ kind: 'detail', drinkId: id })}
                onQuickAdd={quickAdd}
              />
            )}
            {view.tab === 'rewards' && <RewardsScreen customer={customer} />}
            {view.tab === 'chat' && (
              <ChatScreen
                drinks={drinks}
                variant={chatVariant}
                onToggleVariant={setChatVariant}
                onExit={() => goTab('menu')}
                onAdd={(d) => {
                  quickAdd(d);
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
