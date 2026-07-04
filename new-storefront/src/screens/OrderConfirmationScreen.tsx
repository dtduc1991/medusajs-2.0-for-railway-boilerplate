import { theme } from '../theme';
import { Icon } from '../components/Icon';

interface OrderConfirmationScreenProps {
  displayId: number;
  onDone: () => void;
}

export function OrderConfirmationScreen({ displayId, onDone }: OrderConfirmationScreenProps) {
  return (
    <div data-testid="order-confirmation" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
      <div style={{ width: 72, height: 72, borderRadius: 24, background: theme.green, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="Check" size={32} />
      </div>
      <div style={{ font: `700 22px ${theme.display}`, color: theme.ink, textAlign: 'center' }}>Order placed!</div>
      <div data-testid="order-display-id" style={{ font: `500 14px ${theme.body}`, color: theme.muted, textAlign: 'center' }}>
        Order #{displayId} is confirmed. We'll have it ready shortly.
      </div>
      <button
        data-testid="back-to-menu-button"
        onClick={onDone}
        style={{
          marginTop: 6,
          height: 48,
          padding: '0 24px',
          borderRadius: 16,
          background: theme.accent,
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          font: `600 15px ${theme.body}`,
        }}
      >
        Back to menu
      </button>
    </div>
  );
}
