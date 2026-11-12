import { AISparkle } from '@/components/ui/ai';
import {
  BookOpenText,
  Gauge,
  Info,
  LayoutDashboard,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';

export const TAB_IDS = ['summary', 'intelligence', 'knowledge', 'rules', 'about', 'test'] as const;
export type TabId = (typeof TAB_IDS)[number];
export const DEFAULT_TAB: TabId = 'summary';

export const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'summary', label: 'Summary', icon: LayoutDashboard },
  { id: 'intelligence', label: 'Intelligence', icon: Gauge },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpenText },
  { id: 'rules', label: 'Rules & Behavior', icon: SlidersHorizontal },
  { id: 'about', label: 'About', icon: Info },
  { id: 'test', label: 'Test AI', icon: AISparkle },
];

export const isTab = (v: string | null): v is TabId =>
  !!v && (TAB_IDS as readonly string[]).includes(v);

/** The section links inside the two editing tabs (the old single-page navigation, split by purpose). */
export const KNOWLEDGE_NAV = [
  { key: 'identity', label: 'Business Profile' },
  { key: 'products', label: 'Products & Catalog' },
  { key: 'policies', label: 'Customer Policies' },
  { key: 'fields', label: 'Custom Fields' },
  { key: 'kb', label: 'Knowledge Base' },
] as const;
export const RULES_NAV = [
  { key: 'voice', label: 'Brand Voice' },
  { key: 'instructions', label: 'Custom Instructions' },
  { key: 'guardrails', label: 'Guardrails' },
  { key: 'logic', label: 'Business Logic' },
] as const;

/** Which tab holds each section. `returns` is part of Customer Policies; everything else maps one to one. */
export const SECTION_TAB: Record<string, TabId> = {
  identity: 'knowledge',
  products: 'knowledge',
  policies: 'knowledge',
  returns: 'knowledge',
  fields: 'knowledge',
  kb: 'knowledge',
  voice: 'rules',
  instructions: 'rules',
  guardrails: 'rules',
  logic: 'rules',
};
export const SECTION_ANCHOR: Record<string, string> = { returns: 'returns' };
