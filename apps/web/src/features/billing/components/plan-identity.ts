import { Building2, Sprout, TrendingUp, Zap, type LucideIcon } from 'lucide-react';

export interface PlanIdentity {
  icon: LucideIcon;
  color: string;
  tint: string;
}

/** One icon and accent per plan, used by the plan cards and the current-subscription header. Unknown plans fall back to neutral. */
const IDENTITY: Record<string, PlanIdentity> = {
  free: { icon: Sprout, color: '#62656D', tint: '#F1F2F5' },
  starter: { icon: Zap, color: '#2B8FD9', tint: '#EAF4FD' },
  growth: { icon: TrendingUp, color: '#5B5CE2', tint: '#F0F0FF' },
  scale: { icon: Building2, color: '#7C3AED', tint: '#F5F0FF' },
};
export const planIdentity = (key: string): PlanIdentity =>
  IDENTITY[key] ?? { icon: Sprout, color: '#62656D', tint: '#F1F2F5' };
