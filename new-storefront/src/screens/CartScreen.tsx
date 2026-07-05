import { useState } from 'react';
import { theme } from '../theme';
import { Icon } from '../components/Icon';
import { Placeholder } from '../components/Placeholder';
import { STORE, money } from '../data';
import type { Cart } from '../lib/backend';

interface CartScreenProps {
  cart: Cart | null;
  onQty: (lineId: string, delta: number) => void;
  onApplyPromo: (code: string) => void;
  promoError: string | null;
  onBrowse: () => void;
  onPay: () => void;
  /** Cosmetic pre-checkout estimate rate — sourced from the backend's loyalty config. */
  pointsPerCurrencyUnit: number;
}

export function CartScreen({ cart, onQty, onApplyPromo, promoError, onBrowse, onPay, pointsPerCurrencyUnit }: CartScreenProps) {
  const [promoCode, setPromoCode] = useState('');
  const [showPromoInput, setShowPromoInput] = useState(false);

  const allItems = cart?.items ?? [];
  const items = allItems.filter((it) => !it.parentLineItemId);
  const extrasByParent = new Map<string, typeof allItems>();
  for (const it of allItems) {
    if (!it.parentLineItemId) continue;
    extrasByParent.set(it.parentLineItemId, [...(extrasByParent.get(it.parentLineItemId) ?? []), it]);
  }
  const currencyCode = cart?.currencyCode ?? 'eur';

  if (items.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: theme.accentSoft, color: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="ShoppingBag" size={28} />
        </div>
        <div style={{ font: `700 20px ${theme.display}`, color: theme.ink }}>Your bag is empty</div>
        <div style={{ font: `400 14px ${theme.body}`, color: theme.muted, textAlign: 'center' }}>Add a drink from the menu or ask Ember for a recommendation.</div>
        <button onClick={onBrowse} style={{ marginTop: 6, height: 48, padding: '0 24px', borderRadius: 16, background: theme.accent, color: '#fff', border: 'none', cursor: 'pointer', font: `600 15px ${theme.body}` }}>
          Browse the menu
        </button>
      </div>
    );
  }

  // Cosmetic pre-checkout estimate — the real award happens server-side in
  // award-loyalty-points.ts using the same configurable rate (see lib/loyalty.ts).
  const stars = Math.round((cart?.subtotal ?? 0) * pointsPerCurrencyUnit);

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '8px 24px 0' }}>
        <div style={{ font: `700 28px ${theme.display}`, color: theme.ink, letterSpacing: '-0.03em' }}>Your bag</div>
        <span style={{ font: `600 13px ${theme.body}`, color: theme.accent }}>Edit</span>
      </div>

      {/* Pickup */}
      <div style={{ margin: '16px 24px 0', borderRadius: 18, background: theme.paper, border: `1px solid ${theme.line}`, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 13 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: theme.accentSoft, color: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="MapPin" size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ font: `600 14px ${theme.body}`, color: theme.ink }}>Pickup · {STORE.name} {STORE.location}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, font: `500 12px ${theme.body}`, color: theme.green, marginTop: 2 }}>
            <Icon name="Clock" size={13} />
            Ready in ~{STORE.etaMinutes} min
          </div>
        </div>
        <Icon name="ChevronRight" size={20} color="#b0a499" />
      </div>

      {/* Items */}
      <div style={{ padding: '8px 24px 0', flex: 1, overflowY: 'auto' }}>
        {items.map((it) => (
          <div key={it.lineId}>
            <div data-testid="cart-item" style={{ display: 'flex', gap: 13, alignItems: 'center', padding: '16px 0 0', borderBottom: extrasByParent.has(it.lineId) ? 'none' : `1px solid ${theme.line}`, paddingBottom: extrasByParent.has(it.lineId) ? 0 : 16 }}>
              <Placeholder tint={it.tint} width={58} height={58} radius={15} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `600 15px ${theme.body}`, color: theme.ink }}>{it.title}</div>
                <div style={{ font: `500 12px ${theme.body}`, color: theme.muted, marginTop: 2 }}>
                  {[it.size, it.milk].filter(Boolean).join(' · ')}
                </div>
                <div style={{ font: `600 14px ${theme.display}`, color: theme.ink, marginTop: 5 }}>{money(it.unitPrice, currencyCode)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${theme.lineStrong}`, borderRadius: 11, background: theme.paper }}>
                <button onClick={() => onQty(it.lineId, -1)} style={miniStep}>
                  <Icon name="Minus" size={15} />
                </button>
                <span style={{ width: 22, textAlign: 'center', font: `600 14px ${theme.display}`, color: theme.ink }}>{it.qty}</span>
                <button onClick={() => onQty(it.lineId, 1)} style={miniStep}>
                  <Icon name="Plus" size={15} />
                </button>
              </div>
            </div>
            {(extrasByParent.get(it.lineId) ?? []).map((extra) => (
              <div
                key={extra.lineId}
                data-testid="cart-item-extra"
                style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 12px 71px', font: `500 13px ${theme.body}`, color: theme.muted, borderBottom: `1px solid ${theme.line}` }}
              >
                <span>+ {extra.title}</span>
                <span>{money(extra.unitPrice, currencyCode)}</span>
              </div>
            ))}
          </div>
        ))}

        {/* Promo */}
        {showPromoInput ? (
          <div style={{ borderBottom: `1px solid ${theme.line}` }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (promoCode.trim()) onApplyPromo(promoCode.trim());
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0 4px' }}
            >
              <Icon name="Tag" size={18} color={theme.accent} />
              <input
                autoFocus
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="Promo code"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: `600 14px ${theme.body}`, color: theme.ink }}
              />
              <button type="submit" style={{ background: 'none', border: 'none', color: theme.accent, font: `600 13px ${theme.body}`, cursor: 'pointer' }}>
                Apply
              </button>
            </form>
            {promoError && (
              <div style={{ font: `500 12px ${theme.body}`, color: theme.accent, padding: '0 0 12px 28px' }}>{promoError}</div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setShowPromoInput(true)}
            style={{ ...resetBtn, width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', borderBottom: `1px solid ${theme.line}`, color: theme.ink }}
          >
            <Icon name="Tag" size={18} color={theme.accent} />
            <span style={{ flex: 1, font: `600 14px ${theme.body}`, textAlign: 'left' }}>Apply a promo code</span>
            <Icon name="ChevronRight" size={18} color="#b0a499" />
          </button>
        )}

        {/* Summary */}
        <div style={{ padding: '16px 0 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <SummaryRow label="Subtotal" value={money(cart?.subtotal ?? 0, currencyCode)} />
          <SummaryRow label="Taxes" value={money(cart?.tax ?? 0, currencyCode)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: `500 14px ${theme.body}`, color: theme.green }}>
            <Icon name="Star" size={14} />
            Earns +{stars} ★
          </div>
        </div>
        <div style={{ height: 12 }} />
      </div>

      {/* Pay */}
      <div style={{ flexShrink: 0, padding: '14px 24px 30px', background: theme.cream, borderTop: `1px solid rgba(34,27,22,0.06)` }}>
        <button data-testid="pay-button" onClick={onPay} style={{ width: '100%', height: 56, borderRadius: 16, background: theme.accent, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
          <Icon name="Lock" size={18} />
          <span style={{ font: `600 16px ${theme.body}` }}>Pay {money(cart?.total ?? 0, currencyCode)}</span>
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', font: `500 14px ${theme.body}`, color: theme.sub }}>
      <span>{label}</span>
      <span style={{ color: theme.ink }}>{value}</span>
    </div>
  );
}

const miniStep: React.CSSProperties = {
  width: 30,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: theme.ink,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
};

const resetBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer' };
