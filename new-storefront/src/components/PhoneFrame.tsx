import type { ReactNode } from 'react';
import { theme } from '../theme';

interface AppShellProps {
  children: ReactNode;
  dark?: boolean;
}

/**
 * Responsive app shell.
 * - Phone: fills the viewport edge-to-edge.
 * - Web / tablet: centers as a single app column (max 480px) on a soft gutter.
 *
 * No device bezel and no status bar — this renders as a real responsive app.
 * Children lay out as a flex column; the active screen uses `flex:1; overflowY:auto`
 * so its content scrolls while pinned headers / CTAs / nav stay put.
 */
export function PhoneFrame({ children, dark = false }: AppShellProps) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 480,
        marginInline: 'auto',
        height: '100dvh',
        background: dark ? theme.dark : theme.cream,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {children}
    </div>
  );
}
