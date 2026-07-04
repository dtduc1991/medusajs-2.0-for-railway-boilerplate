import * as Lucide from 'lucide-react';
import type { LucideProps } from 'lucide-react';

type IconProps = {
  /** PascalCase lucide icon name, e.g. "Coffee", "MapPin", "ShoppingBag". */
  name: string;
  size?: number;
} & Omit<LucideProps, 'ref'>;

/**
 * Thin wrapper around lucide-react so screens can request icons by name.
 * In a production codebase you'd typically import each icon directly for
 * tree-shaking; the by-name lookup keeps the design handoff compact.
 */
export function Icon({ name, size = 20, ...rest }: IconProps) {
  const Cmp = (Lucide as unknown as Record<string, React.FC<LucideProps>>)[name];
  if (!Cmp) return null;
  return <Cmp size={size} strokeWidth={2} {...rest} />;
}
