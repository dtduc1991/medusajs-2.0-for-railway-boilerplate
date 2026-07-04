import { theme } from '../theme';
import { Icon } from '../components/Icon';
import { USER, REWARD_ACTIVITY } from '../data';

export function RewardsScreen() {
  const filled = USER.rewardThreshold - USER.starsToReward;

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '10px 24px 0' }}>
        <div style={{ font: `700 30px ${theme.display}`, color: theme.ink, letterSpacing: '-0.03em' }}>Rewards</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: theme.sub, font: `600 12px ${theme.body}` }}>
          <span>{USER.firstName.toUpperCase()}</span>
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
            {USER.firstName[0]}
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
          <span style={{ font: `700 42px ${theme.display}`, color: theme.cream, letterSpacing: '-0.02em' }}>{USER.stars}</span>
          <Icon name="Star" size={24} color={theme.gold} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
          {Array.from({ length: USER.rewardThreshold }).map((_, i) => (
            <Icon key={i} name="Star" size={22} color={i < filled ? theme.gold : 'rgba(244,239,230,0.22)'} />
          ))}
        </div>
        <div style={{ font: `500 13px ${theme.body}`, color: 'rgba(244,239,230,0.75)', marginTop: 14 }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>{USER.starsToReward} more stars</span> until your next free drink
        </div>
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
      {REWARD_ACTIVITY.map((a) => {
        const earned = a.delta > 0;
        return (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px 0' }}>
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
