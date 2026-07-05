import { useState } from 'react';
import { theme } from '../theme';
import { Icon } from '../components/Icon';
import { Placeholder } from '../components/Placeholder';
import { money } from '../data';
import type { Drink, ExtraProduct, Size, Milk } from '../types';

const SIZES: { size: Size; oz: string }[] = [
  { size: 'Small', oz: '12 oz' },
  { size: 'Medium', oz: '16 oz' },
  { size: 'Large', oz: '20 oz' },
];
const MILKS: Milk[] = ['Oat', 'Whole', 'Almond', 'Lactose-free'];

interface DrinkDetailScreenProps {
  drink: Drink;
  /** Real, variant-backed add-ons fetched from the backend (see lib/backend.ts's listExtras()). */
  extras: ExtraProduct[];
  onBack: () => void;
  /** Adds the real backend variant matching the chosen size/milk, plus any selected extras, to the cart. */
  onAdd: (variantId: string, quantity: number, extraVariantIds: string[]) => void;
}

export function DrinkDetailScreen({ drink, extras, onBack, onAdd }: DrinkDetailScreenProps) {
  const [temp, setTemp] = useState<'Iced' | 'Hot'>('Iced');
  const [size, setSize] = useState<Size>('Medium');
  const [milk, setMilk] = useState<Milk>('Oat');
  const [extraIds, setExtraIds] = useState<Set<string>>(() => new Set(extras[0] ? [extras[0].id] : []));
  const [qty, setQty] = useState(1);

  const variant = drink.variants.find((v) => v.size === size && v.milk === milk);
  const selectedExtras = extras.filter((e) => extraIds.has(e.id));
  const unitPrice = (variant?.price ?? drink.price) + selectedExtras.reduce((s, e) => s + e.price, 0);
  const total = unitPrice * qty;

  const toggleExtra = (id: string) =>
    setExtraIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 22px 10px' }}>
        <button onClick={onBack} style={circleBtn(theme.ink)}>
          <Icon name="ArrowLeft" size={19} />
        </button>
        <span style={{ font: `600 13px ${theme.body}`, color: theme.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Customize
        </span>
        <button style={circleBtn(theme.accent)}>
          <Icon name="Heart" size={19} />
        </button>
      </div>

      {/* Hero */}
      <div style={{ margin: '0 22px', position: 'relative', flexShrink: 0 }}>
        <Placeholder tint={drink.tint} height={218} radius={24} label={`${drink.id}.jpg`} />
        <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 6 }}>
          {(['Iced', 'Hot'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTemp(t)}
              style={{
                padding: '7px 13px',
                borderRadius: theme.rPill,
                border: 'none',
                cursor: 'pointer',
                font: `600 12px ${theme.body}`,
                ...(temp === t ? { background: theme.ink, color: '#fff' } : { background: 'rgba(255,255,255,0.7)', color: theme.sub }),
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 22px 0', flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ font: `700 21px ${theme.display}`, color: theme.ink, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {drink.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7, color: theme.sub, font: `500 13px ${theme.body}` }}>
              <Icon name="Star" size={14} color={theme.gold} />
              4.9 · 128 ratings
            </div>
          </div>
          <div style={{ font: `700 22px ${theme.display}`, color: theme.accent }}>{money(drink.price, drink.currencyCode)}</div>
        </div>

        {/* Size */}
        <SectionLabel>SIZE</SectionLabel>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {SIZES.map(({ size: s, oz }) => {
            const sel = s === size;
            return (
              <button
                key={s}
                onClick={() => setSize(s)}
                style={{
                  flex: 1,
                  height: 54,
                  borderRadius: 14,
                  border: sel ? 'none' : `1px solid ${theme.lineStrong}`,
                  background: sel ? theme.ink : theme.paper,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ font: `600 13px ${theme.body}`, color: sel ? theme.cream : theme.ink }}>{s}</span>
                <span style={{ font: `500 11px ${theme.body}`, color: sel ? 'rgba(244,239,230,0.6)' : theme.muted }}>{oz}</span>
              </button>
            );
          })}
        </div>

        {/* Milk */}
        <SectionLabel>MILK</SectionLabel>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {MILKS.map((m) => {
            const sel = m === milk;
            return (
              <button
                key={m}
                onClick={() => setMilk(m)}
                style={{
                  padding: '10px 15px',
                  borderRadius: theme.rPill,
                  border: sel ? 'none' : `1px solid ${theme.lineStrong}`,
                  background: sel ? theme.accent : theme.paper,
                  color: sel ? '#fff' : theme.sub,
                  font: `600 13px ${theme.body}`,
                  cursor: 'pointer',
                }}
              >
                {m}
              </button>
            );
          })}
        </div>

        {/* Extras */}
        <div style={{ marginTop: 4 }}>
          {extras.map((e) => {
            const on = extraIds.has(e.id);
            return (
              <div
                key={e.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 14,
                  paddingTop: 14,
                  borderTop: `1px solid ${theme.line}`,
                }}
              >
                <div>
                  <div style={{ font: `600 14px ${theme.body}`, color: theme.ink }}>{e.label}</div>
                  <div style={{ font: `500 12px ${theme.body}`, color: theme.muted }}>+{money(e.price, drink.currencyCode)}</div>
                </div>
                <button onClick={() => toggleExtra(e.id)} style={toggleTrack(on)}>
                  <span style={toggleKnob(on)} />
                </button>
              </div>
            );
          })}
        </div>
        <div style={{ height: 12 }} />
      </div>

      {/* Sticky CTA */}
      <div
        style={{
          flexShrink: 0,
          padding: '14px 22px 30px',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          background: theme.cream,
          borderTop: `1px solid rgba(34,27,22,0.06)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${theme.lineStrong}`, borderRadius: 14, overflow: 'hidden', background: theme.paper }}>
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} style={stepBtn}>
            <Icon name="Minus" size={18} />
          </button>
          <span style={{ width: 30, textAlign: 'center', font: `600 16px ${theme.display}`, color: theme.ink }}>{qty}</span>
          <button onClick={() => setQty((q) => q + 1)} style={stepBtn}>
            <Icon name="Plus" size={18} />
          </button>
        </div>
        <button
          data-testid="add-to-bag-button"
          disabled={!variant}
          onClick={() => variant && onAdd(variant.id, qty, selectedExtras.map((e) => e.id))}
          style={{
            flex: 1,
            height: 54,
            borderRadius: 16,
            background: variant ? theme.accent : theme.muted,
            color: '#fff',
            border: 'none',
            cursor: variant ? 'pointer' : 'not-allowed',
            font: `600 16px ${theme.body}`,
          }}
        >
          Add to bag · {money(total, drink.currencyCode)}
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ font: `700 12px ${theme.body}`, letterSpacing: '0.08em', color: theme.muted, marginTop: 18 }}>{children}</div>;
}

const circleBtn = (color: string): React.CSSProperties => ({
  width: 38,
  height: 38,
  borderRadius: 12,
  background: theme.paper,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color,
  border: `1px solid ${theme.line}`,
  cursor: 'pointer',
});

const stepBtn: React.CSSProperties = {
  width: 42,
  height: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: theme.ink,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
};

const toggleTrack = (on: boolean): React.CSSProperties => ({
  width: 46,
  height: 27,
  borderRadius: theme.rPill,
  background: on ? theme.accent : 'rgba(34,27,22,0.14)',
  position: 'relative',
  flexShrink: 0,
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.15s',
});

const toggleKnob = (on: boolean): React.CSSProperties => ({
  position: 'absolute',
  top: 3,
  left: on ? 22 : 3,
  width: 21,
  height: 21,
  borderRadius: '50%',
  background: '#fff',
  transition: 'left 0.15s',
});
