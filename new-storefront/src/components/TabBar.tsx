import { theme } from '../theme';
import { Icon } from './Icon';
import type { Tab } from '../types';

const ITEMS: { tab: Tab; icon: string; label: string }[] = [
  { tab: 'menu', icon: 'Coffee', label: 'Menu' },
  { tab: 'rewards', icon: 'Star', label: 'Rewards' },
  { tab: 'chat', icon: 'MessageCircle', label: 'Chat' },
  { tab: 'bag', icon: 'ShoppingBag', label: 'Bag' },
  { tab: 'you', icon: 'User', label: 'You' },
];

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  /** Bag badge count. */
  bagCount?: number;
}

export function TabBar({ active, onChange, bagCount = 0 }: TabBarProps) {
  return (
    <div
      style={{
        flexShrink: 0,
        height: 90,
        background: 'rgba(251,248,242,0.94)',
        backdropFilter: 'blur(12px)',
        borderTop: `1px solid rgba(34,27,22,0.07)`,
        display: 'flex',
        justifyContent: 'space-around',
        padding: '12px 14px 24px',
      }}
    >
      {ITEMS.map((item) => {
        const isActive = item.tab === active;
        return (
          <button
            key={item.tab}
            data-testid={`tab-${item.tab}`}
            onClick={() => onChange(item.tab)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              color: isActive ? theme.accent : theme.faint,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <Icon name={item.icon} size={23} />
            <span style={{ font: `600 10px ${theme.body}` }}>{item.label}</span>
            {item.tab === 'bag' && bagCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: 4,
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  borderRadius: 999,
                  background: theme.accent,
                  color: '#fff',
                  font: `700 10px ${theme.display}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {bagCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
