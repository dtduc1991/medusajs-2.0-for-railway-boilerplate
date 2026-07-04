import { useEffect, useMemo, useState } from 'react';
import { theme } from './theme';
import { PhoneFrame } from './components/PhoneFrame';
import { TabBar } from './components/TabBar';
import { MenuScreen } from './screens/MenuScreen';
import { DrinkDetailScreen } from './screens/DrinkDetailScreen';
import { RewardsScreen } from './screens/RewardsScreen';
import { ChatScreen } from './screens/ChatScreen';
import { CartScreen } from './screens/CartScreen';
import {
  addLineItem,
  applyPromoCode,
  changeLineItemQty,
  listDrinks,
  retrieveCart,
  type Cart,
} from './lib/backend';
import type { Drink, Tab, View } from './types';

export default function App() {
  const [view, setView] = useState<View>({ kind: 'tab', tab: 'menu' });
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [chatVariant, setChatVariant] = useState<'bubbles' | 'voice'>('bubbles');

  useEffect(() => {
    Promise.all([listDrinks(), retrieveCart()])
      .then(([fetchedDrinks, fetchedCart]) => {
        setDrinks(fetchedDrinks);
        setCart(fetchedCart);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
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
            onBack={() => goTab('menu')}
            onAdd={(variantId, quantity) => {
              void addVariantToCart(variantId, quantity);
              goTab('bag');
            }}
          />
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
            {view.tab === 'rewards' && <RewardsScreen />}
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
              />
            )}
            {view.tab === 'you' && <ComingSoon label="Profile" />}

            {/* Chat is full-bleed dark; other tabs show the nav bar */}
            {view.tab !== 'chat' && <TabBar active={view.tab} onChange={goTab} bagCount={bagCount} />}
          </>
        )}
      </PhoneFrame>
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `600 16px ${theme.body}`, color: theme.muted }}>
      {label} · coming soon
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
