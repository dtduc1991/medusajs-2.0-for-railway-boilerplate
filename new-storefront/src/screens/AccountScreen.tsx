import { useEffect, useState } from 'react';
import { theme } from '../theme';
import { Icon } from '../components/Icon';
import { money } from '../data';
import { listMyOrders, type Customer, type OrderSummary } from '../lib/auth';

interface AccountScreenProps {
  customer: Customer | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (fields: { email: string; password: string; first_name: string; last_name: string }) => Promise<void>;
  onLogout: () => void;
}

export function AccountScreen({ customer, onLogin, onSignup, onLogout }: AccountScreenProps) {
  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 24px 0' }}>
        <div style={{ font: `700 28px ${theme.display}`, color: theme.ink, letterSpacing: '-0.03em' }}>You</div>
      </div>
      <div style={{ padding: '16px 24px 24px', flex: 1, overflowY: 'auto' }}>
        {customer ? <Profile customer={customer} onLogout={onLogout} /> : <AuthForm onLogin={onLogin} onSignup={onSignup} />}
      </div>
    </div>
  );
}

function Profile({ customer, onLogout }: { customer: Customer; onLogout: () => void }) {
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyOrders()
      .then(setOrders)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 0 20px' }}>
        <div style={{ width: 52, height: 52, borderRadius: 18, background: theme.accentSoft, color: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 20px ${theme.display}` }}>
          {customer.first_name?.[0] ?? customer.email[0].toUpperCase()}
        </div>
        <div>
          <div style={{ font: `700 17px ${theme.display}`, color: theme.ink }}>
            {[customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email}
          </div>
          <div style={{ font: `500 13px ${theme.body}`, color: theme.muted }}>{customer.email}</div>
        </div>
      </div>

      <SectionLabel>ORDER HISTORY</SectionLabel>
      {error && <div style={{ font: `500 13px ${theme.body}`, color: theme.accent, marginTop: 8 }}>{error}</div>}
      {!error && orders === null && (
        <div style={{ font: `500 13px ${theme.body}`, color: theme.muted, marginTop: 8 }}>Loading orders…</div>
      )}
      {orders?.length === 0 && (
        <div style={{ font: `500 13px ${theme.body}`, color: theme.muted, marginTop: 8 }}>No orders yet.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
        {orders?.map((o) => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${theme.line}` }}>
            <div>
              <div style={{ font: `600 14px ${theme.body}`, color: theme.ink }}>Order #{o.display_id}</div>
              <div style={{ font: `500 12px ${theme.body}`, color: theme.muted, marginTop: 2 }}>
                {new Date(o.created_at).toLocaleDateString()} · {o.item_count} item{o.item_count === 1 ? '' : 's'}
              </div>
            </div>
            <div style={{ font: `600 14px ${theme.display}`, color: theme.ink }}>{money(o.total, o.currency_code)}</div>
          </div>
        ))}
      </div>

      <button onClick={onLogout} style={{ ...resetBtn, marginTop: 24, color: theme.accent, font: `600 14px ${theme.body}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="LogOut" size={16} />
        Log out
      </button>
    </>
  );
}

function AuthForm({
  onLogin,
  onSignup,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (fields: { email: string; password: string; first_name: string; last_name: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'login') {
        await onLogin(email, password);
      } else {
        await onSignup({ email, password, first_name: firstName, last_name: lastName });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ font: `700 18px ${theme.display}`, color: theme.ink, marginBottom: 4 }}>
        {mode === 'login' ? 'Log in' : 'Create your account'}
      </div>

      {mode === 'signup' && (
        <div style={{ display: 'flex', gap: 10 }}>
          <input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={fieldStyle} />
          <input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={fieldStyle} />
        </div>
      )}
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} />

      {error && <div style={{ font: `500 13px ${theme.body}`, color: theme.accent }}>{error}</div>}

      <button
        type="submit"
        disabled={submitting || !email || !password || (mode === 'signup' && (!firstName || !lastName))}
        style={{ ...primaryBtn, marginTop: 4, opacity: submitting ? 0.7 : 1 }}
      >
        {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login');
          setError(null);
        }}
        style={{ ...resetBtn, marginTop: 6, color: theme.sub, font: `500 13px ${theme.body}` }}
      >
        {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
      </button>
    </form>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ font: `700 12px ${theme.body}`, letterSpacing: '0.08em', color: theme.muted, marginTop: 18 }}>{children}</div>;
}

const fieldStyle: React.CSSProperties = {
  flex: 1,
  height: 48,
  borderRadius: 14,
  border: `1px solid ${theme.lineStrong}`,
  background: theme.paper,
  padding: '0 14px',
  font: `500 14px ${theme.body}`,
  color: theme.ink,
  outline: 'none',
};

const primaryBtn: React.CSSProperties = {
  height: 52,
  borderRadius: 16,
  background: theme.accent,
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  font: `600 15px ${theme.body}`,
};

const resetBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' };
