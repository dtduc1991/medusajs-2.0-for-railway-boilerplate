import { theme } from '../theme';
import { Icon } from '../components/Icon';
import { Placeholder } from '../components/Placeholder';
import { STORE, money } from '../data';
import type { CartItem } from '../types';

const TAX_RATE = 0.078;

interface CartScreenProps {
  items: CartItem[];
  onQty: (lineId: string, delta: number) => void;
  onBrowse: () => void;
}

export function CartScreen({ items, onQty, onBrowse }: CartScreenProps) {
  const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  const stars = Math.round(subtotal * 2);

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
          <div key={it.lineId} style={{ display: 'flex', gap: 13, alignItems: 'center', padding: '16px 0', borderBottom: `1px solid ${theme.line}` }}>
            <Placeholder tint={it.drink.tint} width={58} height={58} radius={15} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 15px ${theme.body}`, color: theme.ink }}>{it.drink.name}</div>
              <div style={{ font: `500 12px ${theme.body}`, color: theme.muted, marginTop: 2 }}>
                {it.size} · {it.milk}
                {it.extras.length > 0 && ` · ${it.extras.map((e) => e.label.replace('Extra espresso shot', 'Extra shot')).join(' · ')}`}
              </div>
              <div style={{ font: `600 14px ${theme.display}`, color: theme.ink, marginTop: 5 }}>{money(it.unitPrice)}</div>
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
        ))}

        {/* Promo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', borderBottom: `1px solid ${theme.line}`, color: theme.ink }}>
          <Icon name="Tag" size={18} color={theme.accent} />
          <span style={{ flex: 1, font: `600 14px ${theme.body}` }}>Apply a promo code</span>
          <Icon name="ChevronRight" size={18} color="#b0a499" />
        </div>

        {/* Summary */}
        <div style={{ padding: '16px 0 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
          <SummaryRow label="Subtotal" value={money(subtotal)} />
          <SummaryRow label="Taxes" value={money(tax)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: `500 14px ${theme.body}`, color: theme.green }}>
            <Icon name="Star" size={14} />
            Earns +{stars} ★
          </div>
        </div>
        <div style={{ height: 12 }} />
      </div>

      {/* Pay */}
      <div style={{ flexShrink: 0, padding: '14px 24px 30px', background: theme.cream, borderTop: `1px solid rgba(34,27,22,0.06)` }}>
        <button style={{ width: '100%', height: 56, borderRadius: 16, background: theme.accent, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
          <Icon name="Lock" size={18} />
          <span style={{ font: `600 16px ${theme.body}` }}>Pay {money(total)}</span>
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
