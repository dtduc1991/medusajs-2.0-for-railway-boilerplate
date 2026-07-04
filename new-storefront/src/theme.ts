/**
 * Ember design tokens.
 * Bold, high-contrast, warm. Cream surfaces + warm ink + punchy orange,
 * with an espresso-dark variant for the voice-forward chat.
 */
export const theme = {
  // Surfaces & text
  cream: '#F4EFE6',
  paper: '#FFFFFF',
  ink: '#221B16',
  sub: '#6B5E54',
  muted: '#9A8D80',
  faint: '#B4A99E',
  line: 'rgba(34,27,22,0.08)',
  lineStrong: 'rgba(34,27,22,0.12)',

  // Accents
  accent: '#EE5A24',
  accentSoft: '#FBE3D6',
  dark: '#1E1713',
  darkElev: '#2A211B',
  gold: '#E9A23B',
  goldSoft: '#FFF1DA',
  green: '#1F8A5B',

  // Type
  display: "'Space Grotesk', sans-serif",
  body: "'DM Sans', sans-serif",
  mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",

  // Radii
  rCard: 22,
  rField: 15,
  rPill: 999,
} as const;

/** Striped placeholder background used wherever a product photo will go. */
export function placeholder(baseColor: string, dark = false): React.CSSProperties {
  const stripe = dark ? 'rgba(244,239,230,0.08)' : 'rgba(34,27,22,0.06)';
  return {
    backgroundColor: baseColor,
    backgroundImage: `repeating-linear-gradient(135deg, ${stripe} 0 9px, transparent 9px 18px)`,
  };
}

export type Theme = typeof theme;
