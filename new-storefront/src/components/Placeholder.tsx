import { theme, placeholder } from '../theme';

interface PlaceholderProps {
  tint: string;
  width?: number | string;
  height?: number | string;
  radius?: number;
  dark?: boolean;
  /** Optional mono caption shown at the bottom (e.g. file name of the real shot). */
  label?: string;
  style?: React.CSSProperties;
}

/** Striped stand-in for a product photo. Drop a real <img> here in production. */
export function Placeholder({
  tint,
  width = '100%',
  height = '100%',
  radius = 16,
  dark = false,
  label,
  style,
}: PlaceholderProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: label ? 8 : 0,
        ...placeholder(tint, dark),
        ...style,
      }}
    >
      {label && (
        <span style={{ font: `500 9px ${theme.mono}`, color: 'rgba(34,27,22,0.4)' }}>{label}</span>
      )}
    </div>
  );
}
