import { useMemo, useState } from 'react';
import { theme } from '../theme';
import { Icon } from '../components/Icon';
import { Placeholder } from '../components/Placeholder';
import { money } from '../data';
import type { Drink, ChatMessage } from '../types';

const QUICK_REPLIES = ['Add to bag', 'Make it decaf', 'Sweeter'];

interface ChatScreenProps {
  /** The real product catalog, so the recommendation card is a real add-to-cart-able drink. */
  drinks: Drink[];
  variant: 'bubbles' | 'voice';
  onToggleVariant: (v: 'bubbles' | 'voice') => void;
  onExit: () => void;
  /** Rejects (and does not navigate to the Bag tab) if the add-to-cart call fails. */
  onAdd: (drink: Drink) => Promise<void>;
}

export function ChatScreen({ drinks, variant, onToggleVariant, onExit, onAdd }: ChatScreenProps) {
  // Canned recommendation only — a real assistant would pick this from a
  // conversation/LLM, which is out of scope for the Medusa backend wiring
  // (see new-storefront/docs/backend-integration.md "Chat" section).
  const rec = drinks.find((d) => d.handle === 'brown-sugar-oat-latte') ?? drinks[0];

  if (!rec) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `600 14px ${theme.body}`, color: theme.muted }}>
        No drinks available yet.
      </div>
    );
  }

  return variant === 'bubbles' ? (
    <BubbleChat rec={rec} onAdd={onAdd} onExit={onExit} onSwitch={() => onToggleVariant('voice')} />
  ) : (
    <VoiceChat rec={rec} onAdd={onAdd} onExit={onExit} onSwitch={() => onToggleVariant('bubbles')} />
  );
}

/* ----------------------------- Variant A: light bubbles ----------------------------- */

function BubbleChat({
  rec,
  onAdd,
  onExit,
  onSwitch,
}: {
  rec: Drink;
  onAdd: (d: Drink) => Promise<void>;
  onExit: () => void;
  onSwitch: () => void;
}) {
  const [chatAddError, setChatAddError] = useState<string | null>(null);
  const handleAdd = async (d: Drink) => {
    setChatAddError(null);
    try {
      await onAdd(d);
    } catch (err) {
      setChatAddError(`Couldn't add to bag: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const initial: ChatMessage[] = useMemo(
    () => [
      { id: 'm1', from: 'bot', text: 'Morning, Alex! Feeling something bold, sweet, or iced today?' },
      { id: 'm2', from: 'user', text: 'Something sweet and iced, not too strong please' },
      { id: 'm3', from: 'bot', text: 'Perfect — light, sweet and refreshing. This one’s a favourite:', card: rec },
      { id: 'm4', from: 'bot', text: "You're 4 ★ from a free drink — add it and you're almost there!", nudge: true },
    ],
    [rec]
  );
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState('');

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: `u${Date.now()}`, from: 'user', text };
    setMessages((m) => [...m, userMsg]);
    setDraft('');
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        { id: `b${Date.now()}`, from: 'bot', text: 'On it — here’s a great match for that:', card: rec },
      ]);
    }, 600);
  };

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 18px 14px', borderBottom: `1px solid rgba(34,27,22,0.07)` }}>
        <button onClick={onExit} title="Back" aria-label="Back" style={{ ...resetBtn, color: theme.ink, display: 'flex' }}>
          <Icon name="ArrowLeft" size={22} />
        </button>
        <div style={{ width: 42, height: 42, borderRadius: 14, background: theme.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <Icon name="Flame" size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ font: `700 16px ${theme.display}`, color: theme.ink }}>Ember</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, font: `500 12px ${theme.body}`, color: theme.muted }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: theme.green }} />
            Barista assistant · online
          </div>
        </div>
        <button onClick={onSwitch} title="Switch to voice" style={{ ...resetBtn, color: theme.muted }}>
          <Icon name="AudioLines" size={22} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 0', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ alignSelf: 'center', font: `600 11px ${theme.body}`, color: '#b0a499', letterSpacing: '0.05em' }}>TODAY · 8:32 AM</div>
        {messages.map((m) =>
          m.card ? (
            <div key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '86%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Bubble from="bot">{m.text}</Bubble>
              <div style={{ background: theme.paper, borderRadius: 18, padding: 12, boxShadow: '0 2px 8px rgba(34,27,22,0.05)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Placeholder tint={m.card.tint} width={52} height={52} radius={13} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: `600 14px ${theme.body}`, color: theme.ink }}>Iced {m.card.name}</div>
                    <div style={{ font: `500 12px ${theme.body}`, color: theme.muted, marginTop: 2 }}>Medium · light ice · half-caff</div>
                  </div>
                  <div style={{ font: `700 14px ${theme.display}`, color: theme.accent }}>{money(m.card.price, m.card.currencyCode)}</div>
                </div>
                <button
                  onClick={() => handleAdd(m.card!)}
                  style={{ marginTop: 11, width: '100%', height: 40, borderRadius: 12, background: theme.accent, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, font: `600 14px ${theme.body}` }}
                >
                  <Icon name="Plus" size={16} />
                  Add to bag
                </button>
              </div>
            </div>
          ) : m.nudge ? (
            <div key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '88%', display: 'flex', alignItems: 'center', gap: 9, background: '#FFF6E9', border: '1px solid #F4E3C4', borderRadius: 14, padding: '10px 13px' }}>
              <Icon name="Star" size={16} color={theme.gold} />
              <span style={{ font: `500 12.5px ${theme.body}`, lineHeight: 1.4, color: '#8a6d3b' }}>{m.text}</span>
            </div>
          ) : (
            <Bubble key={m.id} from={m.from}>{m.text}</Bubble>
          )
        )}
      </div>

      {chatAddError && (
        <div data-testid="chat-quick-add-error" role="alert" style={{ margin: '10px 18px 0', font: `500 13px ${theme.body}`, color: theme.accent }}>
          {chatAddError}
        </div>
      )}

      {/* Quick replies */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 18px 0', overflowX: 'auto' }}>
        {QUICK_REPLIES.map((q, i) => (
          <button
            key={q}
            onClick={() => (i === 0 ? handleAdd(rec) : send(q))}
            style={{
              padding: '9px 15px',
              borderRadius: theme.rPill,
              whiteSpace: 'nowrap',
              font: `600 13px ${theme.body}`,
              cursor: 'pointer',
              ...(i === 0 ? { background: theme.ink, color: theme.cream, border: 'none' } : { background: theme.paper, border: `1px solid ${theme.lineStrong}`, color: theme.sub }),
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(draft); }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 28px' }}
      >
        <div style={{ flex: 1, height: 48, borderRadius: 16, background: theme.paper, border: `1px solid ${theme.line}`, display: 'flex', alignItems: 'center', padding: '0 8px 0 16px' }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message Ember…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: `500 14px ${theme.body}`, color: theme.ink }}
          />
          <Icon name="Mic" size={20} color={theme.ink} />
        </div>
        <button type="submit" style={{ width: 48, height: 48, borderRadius: 16, background: theme.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <Icon name="ArrowUp" size={22} />
        </button>
      </form>
    </>
  );
}

function Bubble({ from, children }: { from: 'bot' | 'user'; children: React.ReactNode }) {
  const isUser = from === 'user';
  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        background: isUser ? theme.accent : theme.paper,
        color: isUser ? '#fff' : theme.ink,
        borderRadius: isUser ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
        padding: '12px 15px',
        font: `400 14px ${theme.body}`,
        lineHeight: 1.45,
        boxShadow: isUser ? 'none' : '0 2px 8px rgba(34,27,22,0.05)',
      }}
    >
      {children}
    </div>
  );
}

/* ----------------------------- Variant B: dark voice ----------------------------- */

const MOODS = [
  { icon: 'Flame', label: 'Bold & hot', active: false },
  { icon: 'Snowflake', label: 'Sweet & iced', active: true },
  { icon: 'Sparkles', label: 'Surprise me', active: false },
];

function VoiceChat({
  rec,
  onAdd,
  onExit,
  onSwitch,
}: {
  rec: Drink;
  onAdd: (d: Drink) => Promise<void>;
  onExit: () => void;
  onSwitch: () => void;
}) {
  const [chatAddError, setChatAddError] = useState<string | null>(null);
  const handleAdd = async (d: Drink) => {
    setChatAddError(null);
    try {
      await onAdd(d);
    } catch (err) {
      setChatAddError(`Couldn't add to bag: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', color: theme.cream }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 22px 8px' }}>
        <button onClick={onExit} title="Close" aria-label="Close" style={darkBtn}>
          <Icon name="X" size={18} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ font: `700 14px ${theme.display}`, letterSpacing: '0.12em', color: theme.cream }}>EMBER</div>
          <div style={{ font: `500 11px ${theme.body}`, color: theme.gold }}>AI barista</div>
        </div>
        <button aria-label="History" style={darkBtn}>
          <Icon name="History" size={18} />
        </button>
      </div>

      <div style={{ padding: '14px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, font: `600 11px ${theme.body}`, letterSpacing: '0.12em', color: theme.accent }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: theme.accent }} />
          LIVE BARISTA
        </div>
        <div style={{ font: `700 28px ${theme.display}`, color: theme.cream, marginTop: 10, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
          What are you in<br />the mood for?
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '18px 24px 0' }}>
        {MOODS.map((m) => (
          <div
            key={m.label}
            style={{
              flex: 1,
              borderRadius: 18,
              padding: 14,
              minWidth: 0,
              ...(m.active ? { background: theme.accent } : { background: 'rgba(244,239,230,0.06)', border: '1px solid rgba(244,239,230,0.08)' }),
            }}
          >
            <Icon name={m.icon} size={20} color="#fff" />
            <div style={{ font: `600 13px ${theme.body}`, marginTop: 9, color: '#fff' }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, padding: '18px 24px 0', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <div style={{ alignSelf: 'flex-end', background: 'rgba(244,239,230,0.1)', borderRadius: '16px 16px 6px 16px', padding: '10px 14px', font: `500 13px ${theme.body}`, color: theme.cream }}>
          Sweet & iced, low caffeine
        </div>
        <div style={{ alignSelf: 'flex-start', width: '90%', background: theme.darkElev, border: '1px solid rgba(244,239,230,0.07)', borderRadius: 18, padding: 16 }}>
          <div style={{ font: `400 13.5px ${theme.body}`, lineHeight: 1.5, color: 'rgba(244,239,230,0.82)' }}>Got it. This hits the spot today —</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 13 }}>
            <Placeholder tint="#3a2f26" dark width={48} height={48} radius={13} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 14px ${theme.body}`, color: theme.cream }}>Iced {rec.name}</div>
              <div style={{ font: `500 12px ${theme.body}`, color: '#9b8d80', marginTop: 2 }}>Half-caff · oat · light ice</div>
            </div>
            <div style={{ font: `700 14px ${theme.display}`, color: theme.gold }}>{money(rec.price, rec.currencyCode)}</div>
          </div>
          <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
            <button onClick={() => handleAdd(rec)} style={{ flex: 1, height: 42, borderRadius: 13, background: theme.accent, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, font: `600 13px ${theme.body}` }}>
              <Icon name="Plus" size={16} />
              Add to bag
            </button>
            <button style={{ padding: '0 16px', height: 42, borderRadius: 13, border: '1px solid rgba(244,239,230,0.16)', background: 'none', color: theme.cream, cursor: 'pointer', font: `600 13px ${theme.body}` }}>
              Tell me more
            </button>
          </div>
        </div>
      </div>

      {chatAddError && (
        <div data-testid="chat-quick-add-error" role="alert" style={{ margin: '0 24px 14px', font: `500 13px ${theme.body}`, color: theme.gold }}>
          {chatAddError}
        </div>
      )}

      <div style={{ flexShrink: 0, padding: '14px 24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(244,239,230,0.08)' }}>
        <button onClick={onSwitch} style={{ ...darkBtn, width: 46, height: 46, borderRadius: 14 }}>
          <Icon name="Keyboard" size={20} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 66, height: 66, borderRadius: '50%', background: theme.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 8px rgba(238,90,36,0.18)' }}>
            <Icon name="Mic" size={28} />
          </div>
          <span style={{ font: `600 11px ${theme.body}`, color: 'rgba(244,239,230,0.55)' }}>Hold to talk</span>
        </div>
        <button aria-label="Suggestions" style={{ ...darkBtn, width: 46, height: 46, borderRadius: 14 }}>
          <Icon name="Sparkles" size={20} />
        </button>
      </div>
    </div>
  );
}

const resetBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer' };
const darkBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  background: 'rgba(244,239,230,0.07)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: theme.cream,
  border: 'none',
  cursor: 'pointer',
};
