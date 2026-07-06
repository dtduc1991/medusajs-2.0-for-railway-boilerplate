import { useEffect, useState } from 'react';
import { theme } from '../theme';
import { Icon } from '../components/Icon';
import { Placeholder } from '../components/Placeholder';
import { STORE, USER, money } from '../data';
import type { Drink } from '../types';

interface MenuScreenProps {
  drinks: Drink[];
  categories: string[];
  onOpenDrink: (id: string) => void;
  onQuickAdd: (drink: Drink) => void;
}

export function MenuScreen({ drinks, categories, onOpenDrink, onQuickAdd }: MenuScreenProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // Quick-add's cart update is async (bag badge lags a network round trip) —
  // flip the plus icon to a checkmark immediately on click so the tap reads
  // as instant regardless of that delay.
  const [justAdded, setJustAdded] = useState(false);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCategory && categories.length) setSelectedCategory(categories[0]);
  }, [categories, selectedCategory]);

  const filtered = selectedCategory ? drinks.filter((d) => d.category === selectedCategory) : drinks;
  const featured = filtered[0];
  const popular = filtered.slice(1, 3);

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '8px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: theme.sub,
              font: `600 11px ${theme.body}`,
              letterSpacing: '0.05em',
            }}
          >
            <Icon name="MapPin" size={15} color={theme.accent} />
            {STORE.name.toUpperCase()} · {STORE.location.toUpperCase()}
          </div>
          <button style={iconButton}>
            <Icon name="Bell" size={18} />
          </button>
        </div>
        <div style={{ font: `600 12px ${theme.body}`, letterSpacing: '0.1em', color: theme.muted, marginTop: 16 }}>
          GOOD MORNING, {USER.firstName.toUpperCase()}
        </div>
        <div style={{ font: `700 31px ${theme.display}`, color: theme.ink, letterSpacing: '-0.03em', marginTop: 2 }}>
          Order ahead
        </div>
      </div>

      {/* Search */}
      <div
        style={{
          margin: '15px 24px 0',
          height: 46,
          borderRadius: theme.rField,
          background: theme.paper,
          border: `1px solid ${theme.line}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 16px',
          color: theme.muted,
        }}
      >
        <Icon name="Search" size={18} />
        <span style={{ font: `500 14px ${theme.body}` }}>Search drinks, food…</span>
      </div>

      {/* Categories */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 24px 2px', overflowX: 'auto' }}>
        {categories.map((cat) => {
          const sel = cat === selectedCategory;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '9px 16px',
                borderRadius: theme.rPill,
                whiteSpace: 'nowrap',
                font: `600 13px ${theme.body}`,
                cursor: 'pointer',
                ...(sel
                  ? { background: theme.ink, color: theme.cream, border: 'none' }
                  : { background: theme.paper, border: `1px solid ${theme.lineStrong}`, color: theme.sub }),
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {!featured ? (
        <div style={{ padding: '32px 24px', font: `500 14px ${theme.body}`, color: theme.muted }}>
          No drinks in this category yet.
        </div>
      ) : (
        <>
          {/* Featured */}
          <button
            data-testid="featured-drink-card"
            onClick={() => onOpenDrink(featured.id)}
            style={{
              margin: '16px 24px 0',
              borderRadius: theme.rCard,
              background: theme.accent,
              padding: 18,
              display: 'flex',
              gap: 14,
              position: 'relative',
              overflow: 'hidden',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ flex: 1 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(255,255,255,0.18)',
                  color: '#fff',
                  font: `600 10px ${theme.body}`,
                  letterSpacing: '0.07em',
                  padding: '5px 9px',
                  borderRadius: theme.rPill,
                }}
              >
                <Icon name="Star" size={11} />
                FEATURED
              </span>
              <div style={{ font: `700 21px ${theme.display}`, color: '#fff', marginTop: 11, lineHeight: 1.08 }}>
                {featured.name}
              </div>
              <div style={{ font: `600 15px ${theme.body}`, color: '#fff', marginTop: 9 }}>
                {money(featured.price, featured.currencyCode)}
              </div>
            </div>
            <Placeholder tint={featured.tint} width={106} height={120} label={`${featured.handle}.jpg`} />
            <span
              data-testid="featured-quick-add-button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAdd(featured);
                setJustAdded(true);
                setTimeout(() => setJustAdded(false), 900);
              }}
              style={{
                position: 'absolute',
                right: 16,
                bottom: 16,
                width: 38,
                height: 38,
                borderRadius: 12,
                background: '#fff',
                color: theme.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                transform: justAdded ? 'scale(1.15)' : 'scale(1)',
                transition: 'transform 150ms ease',
              }}
            >
              <Icon name={justAdded ? 'Check' : 'Plus'} size={20} />
            </span>
          </button>

          {/* Popular */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0' }}>
            <span style={{ font: `700 17px ${theme.display}`, color: theme.ink }}>Popular today</span>
            <span style={{ font: `600 13px ${theme.body}`, color: theme.accent }}>See all</span>
          </div>
          {popular.map((d) => (
            <div key={d.id} data-testid="popular-drink-row" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 24px 0' }}>
              <button onClick={() => onOpenDrink(d.id)} style={{ ...resetBtn, display: 'flex', gap: 14, alignItems: 'center', flex: 1 }}>
                <Placeholder tint={d.tint} width={62} height={62} />
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ font: `600 15px ${theme.body}`, color: theme.ink }}>{d.name}</div>
                  <div style={{ font: `400 12px ${theme.body}`, color: theme.muted, marginTop: 2 }}>{d.desc}</div>
                  <div style={{ font: `600 14px ${theme.display}`, color: theme.ink, marginTop: 5 }}>
                    {money(d.price, d.currencyCode)}
                  </div>
                </div>
              </button>
              <button
                data-testid="quick-add-button"
                onClick={() => {
                  onQuickAdd(d);
                  setJustAddedId(d.id);
                  setTimeout(() => setJustAddedId((cur) => (cur === d.id ? null : cur)), 900);
                }}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  border: `1.5px solid ${theme.lineStrong}`,
                  color: theme.ink,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transform: justAddedId === d.id ? 'scale(1.15)' : 'scale(1)',
                  transition: 'transform 150ms ease',
                }}
              >
                <Icon name={justAddedId === d.id ? 'Check' : 'Plus'} size={18} />
              </button>
            </div>
          ))}
        </>
      )}
      <div style={{ height: 16 }} />
    </div>
  );
}

const iconButton: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 11,
  background: theme.paper,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: theme.ink,
  border: `1px solid ${theme.line}`,
  cursor: 'pointer',
};

const resetBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer' };
