import { useEffect, useState } from 'react';
import { theme } from '../theme';
import { Icon } from '../components/Icon';
import { getLoyaltyAccount, type LoyaltyAccount } from '../lib/loyalty';
import type { Customer } from '../lib/auth';

interface RedeemResult {
  account: LoyaltyAccount;
  code: string;
  appliedToCart: boolean;
}

interface RewardsScreenProps {
  customer: Customer | null;
  /** Points required to redeem a free drink — sourced from the backend's loyalty config. */
  rewardThreshold: number;
  /** Mints the real promotion code and tries to apply it to the current cart. */
  onRedeem: () => Promise<RedeemResult>;
}

export function RewardsScreen({ customer, rewardThreshold, onRedeem }: RewardsScreenProps) {
  if (!customer) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: theme.accentSoft, color: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="Star" size={28} />
        </div>
        <div style={{ font: `700 20px ${theme.display}`, color: theme.ink }}>Log in to see your rewards</div>
        <div data-testid="rewards-login-prompt" style={{ font: `400 14px ${theme.body}`, color: theme.muted, textAlign: 'center' }}>
          Your star balance and activity are tied to your account — head to the You tab to log in or sign up.
        </div>
      </div>
    );
  }

  return <RewardsContent customer={customer} rewardThreshold={rewardThreshold} onRedeem={onRedeem} />;
}

function RewardsContent({
  customer,
  rewardThreshold,
  onRedeem,
}: {
  customer: Customer;
  rewardThreshold: number;
  onRedeem: () => Promise<RedeemResult>;
}) {
  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemResult, setRedeemResult] = useState<{ code: string; appliedToCart: boolean } | null>(null);

  useEffect(() => {
    setAccount(null);
    setError(null);
    getLoyaltyAccount()
      .then(setAccount)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [customer.id]);

  const balance = account?.balance ?? 0;
  const canRedeem = balance >= rewardThreshold;
  // Once redeemable, show a full bar rather than wrapping back to 0/threshold.
  const progress = canRedeem ? rewardThreshold : balance % rewardThreshold;
  const starsToReward = rewardThreshold - progress;

  const handleRedeem = () => {
    setRedeeming(true);
    setRedeemError(null);
    setRedeemResult(null);
    onRedeem()
      .then(({ account, code, appliedToCart }) => {
        setAccount(account);
        setRedeemResult({ code, appliedToCart });
      })
      .catch((e) => setRedeemError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRedeeming(false));
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '10px 24px 0' }}>
        <div style={{ font: `700 30px ${theme.display}`, color: theme.ink, letterSpacing: '-0.03em' }}>Rewards</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: theme.sub, font: `600 12px ${theme.body}` }}>
          <span>{(customer.first_name ?? customer.phone ?? customer.email ?? '').toUpperCase()}</span>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: theme.ink,
              color: theme.cream,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: `700 13px ${theme.display}`,
            }}
          >
            {(customer.first_name ?? customer.phone ?? customer.email ?? '?')[0]}
          </div>
        </div>
      </div>

      {/* Star balance card */}
      <div
        style={{
          margin: '16px 24px 0',
          borderRadius: 24,
          background: theme.ink,
          color: theme.cream,
          padding: 22,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', right: -30, top: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(233,162,59,0.12)' }} />
        <div style={{ font: `700 11px ${theme.body}`, letterSpacing: '0.12em', color: theme.gold }}>STAR BALANCE</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <span data-testid="star-balance" style={{ font: `700 42px ${theme.display}`, color: theme.cream, letterSpacing: '-0.02em' }}>
            {account === null && !error ? '…' : balance}
          </span>
          <Icon name="Star" size={24} color={theme.gold} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
          {Array.from({ length: rewardThreshold }).map((_, i) => (
            <Icon key={i} name="Star" size={22} color={i < progress ? theme.gold : 'rgba(244,239,230,0.22)'} />
          ))}
        </div>
        {canRedeem ? (
          <button
            data-testid="redeem-reward-button"
            onClick={handleRedeem}
            disabled={redeeming}
            style={{
              marginTop: 14,
              width: '100%',
              height: 44,
              borderRadius: 14,
              border: 'none',
              background: theme.gold,
              color: theme.ink,
              font: `700 14px ${theme.body}`,
              cursor: redeeming ? 'default' : 'pointer',
              opacity: redeeming ? 0.7 : 1,
            }}
          >
            {redeeming ? 'Redeeming…' : 'Redeem free drink'}
          </button>
        ) : (
          <div style={{ font: `500 13px ${theme.body}`, color: 'rgba(244,239,230,0.75)', marginTop: 14 }}>
            <span style={{ color: '#fff', fontWeight: 600 }}>{starsToReward} more stars</span> until your next free drink
          </div>
        )}
        {redeemError && (
          <div data-testid="redeem-error" style={{ font: `500 12px ${theme.body}`, color: theme.gold, marginTop: 8 }}>
            {redeemError}
          </div>
        )}
        {redeemResult && (
          <div data-testid="redeem-confirmation" style={{ font: `500 12px ${theme.body}`, color: theme.gold, marginTop: 8 }}>
            {redeemResult.appliedToCart
              ? 'Applied! Your free drink discount is in your bag.'
              : `Reward unlocked — enter code ${redeemResult.code} in your bag to redeem it.`}
          </div>
        )}
      </div>

      {/* Offers */}
      <div style={{ display: 'flex', gap: 12, padding: '16px 24px 0' }}>
        <div style={{ flex: 1, borderRadius: 18, background: theme.accent, padding: 16, color: '#fff', minWidth: 0 }}>
          <Icon name="Zap" size={22} />
          <div style={{ font: `700 16px ${theme.display}`, marginTop: 10 }}>2× stars</div>
          <div style={{ font: `500 12px ${theme.body}`, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>Every Tuesday</div>
        </div>
        <div style={{ flex: 1, borderRadius: 18, background: theme.paper, border: `1px solid ${theme.line}`, padding: 16, color: theme.ink, minWidth: 0 }}>
          <Icon name="Gift" size={22} color={theme.accent} />
          <div style={{ font: `700 16px ${theme.display}`, marginTop: 10 }}>Free oat</div>
          <div style={{ font: `500 12px ${theme.body}`, color: theme.muted, marginTop: 2 }}>Upgrade · this week</div>
        </div>
      </div>

      {/* Activity */}
      <div style={{ font: `700 17px ${theme.display}`, color: theme.ink, padding: '22px 24px 0' }}>Activity</div>
      {error && <div style={{ font: `500 13px ${theme.body}`, color: theme.accent, padding: '8px 24px 0' }}>{error}</div>}
      {!error && account === null && (
        <div style={{ font: `500 13px ${theme.body}`, color: theme.muted, padding: '8px 24px 0' }}>Loading…</div>
      )}
      {account?.activity.length === 0 && (
        <div data-testid="no-activity-message" style={{ font: `500 13px ${theme.body}`, color: theme.muted, padding: '8px 24px 0' }}>
          No activity yet.
        </div>
      )}
      {account?.activity.map((a) => {
        const earned = a.delta > 0;
        return (
          <div key={a.id} data-testid="reward-activity-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px 0' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: earned ? theme.accentSoft : theme.goldSoft,
                color: earned ? theme.accent : theme.gold,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={a.icon} size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: `600 14px ${theme.body}`, color: theme.ink }}>{a.label}</div>
              <div style={{ font: `500 12px ${theme.body}`, color: theme.muted }}>{a.when}</div>
            </div>
            <div style={{ font: `700 14px ${theme.display}`, color: earned ? theme.green : theme.muted }}>
              {earned ? '+' : '−'}
              {Math.abs(a.delta)} ★
            </div>
          </div>
        );
      })}
      <div style={{ height: 16 }} />
    </div>
  );
}
