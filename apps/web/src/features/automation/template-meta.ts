import { LifeBuoy, ListChecks, UserPlus, Users, Heart, type LucideIcon } from 'lucide-react';
import { describeStep, triggerOf, type Template } from '@torio/contracts';

export const CATEGORIES = [
  { key: 'support', label: 'Customer support', icon: LifeBuoy },
  { key: 'team', label: 'Team management', icon: Users },
  { key: 'leads', label: 'Lead management', icon: UserPlus },
  { key: 'engagement', label: 'Customer engagement', icon: Heart },
  { key: 'productivity', label: 'Productivity', icon: ListChecks },
] as const satisfies readonly { key: string; label: string; icon: LucideIcon }[];
export type CategoryKey = (typeof CATEGORIES)[number]['key'];

/** Presentation grouping only: the templates themselves (triggers, steps) come from the contracts. */
const CATEGORY_OF: Record<string, CategoryKey> = {
  'tag-instagram-customers': 'engagement',
  'assign-new-leads': 'leads',
  'flag-large-orders': 'productivity',
  'note-fully-paid': 'productivity',
  'resolved-reminder': 'support',
  'assignment-follow-up': 'team',
};

export const categoryOf = (t: Template) =>
  CATEGORIES.find((c) => c.key === (CATEGORY_OF[t.key] ?? 'productivity'))!;

export const triggerLabel = (t: Template) =>
  triggerOf(t.definition.trigger.type)?.label ?? t.definition.trigger.type;

export const actionSummary = (t: Template) =>
  t.definition.steps
    .filter((s) => s.type === 'action')
    .map((s) => describeStep(s))
    .join(' · ');

export const actionCount = (t: Template) =>
  t.definition.steps.filter((s) => s.type === 'action').length;

export const matchesTemplate = (t: Template, q: string) =>
  `${t.name} ${t.description} ${categoryOf(t).label} ${triggerLabel(t)}`
    .toLowerCase()
    .includes(q.trim().toLowerCase());
