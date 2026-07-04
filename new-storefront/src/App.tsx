import { useMemo, useState } from 'react';
import { theme } from './theme';
import { PhoneFrame } from './components/PhoneFrame';
import { TabBar } from './components/TabBar';
import { MenuScreen } from './screens/MenuScreen';
import { DrinkDetailScreen } from './screens/DrinkDetailScreen';
import { RewardsScreen } from './screens/RewardsScreen';
import { ChatScreen } from './screens/ChatScreen';
import { CartScreen } from './screens/CartScreen';
import { byId } from './data';
import type { CartItem, Drink, Extra, Milk, Size, Tab, View } from './types';

let lineSeq = 0;
const nextLineId = () => `line-${lineSeq++}`;

export default function App() {
  const [view, setView] = useState<View>({ kind: 'tab', tab: 'menu' });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [chatVariant, setChatVariant] = useState<'bubbles' | 'voice'>('bubbles');

  const bagCount = useMemo(() => cart.reduce((s, it) => s + it.qty, 0), [cart]);

  const addItem = (config: { drink: Drink; size: Size; milk: Milk; extras: Extra[]; unitPrice: number }) => {
    setCart((prev) => [...prev, { lineId: nextLineId(), qty: 1, ...config }]);
  };

  /** Quick-add uses sensible defaults (Medium / Oat / no extras). */
  const quickAdd = (drink: Drink) =>
    addItem({ drink, size: 'Medium', milk: 'Oat', extras: [], unitPrice: drink.price });

  const changeQty = (lineId: string, delta: number) =>
    setCart((prev) =>
      prev
        .map((it) => (it.lineId === lineId ? { ...it, qty: it.qty + delta } : it))
        .filter((it) => it.qty > 0)
    );

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
        {view.kind === 'detail' ? (
          <DrinkDetailScreen
            drink={byId(view.drinkId)!}
            onBack={() => goTab('menu')}
            onAdd={(config) => {
              addItem(config);
              goTab('bag');
            }}
          />
        ) : (
          <>
            {/* Tabbed screens */}
            {view.tab === 'menu' && (
              <MenuScreen onOpenDrink={(id) => setView({ kind: 'detail', drinkId: id })} onQuickAdd={quickAdd} />
            )}
            {view.tab === 'rewards' && <RewardsScreen />}
            {view.tab === 'chat' && (
              <ChatScreen
                variant={chatVariant}
                onToggleVariant={setChatVariant}
                onExit={() => goTab('menu')}
                onAdd={(d) => {
                  quickAdd(d);
                  goTab('bag');
                }}
              />
            )}
            {view.tab === 'bag' && <CartScreen items={cart} onQty={changeQty} onBrowse={() => goTab('menu')} />}
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
