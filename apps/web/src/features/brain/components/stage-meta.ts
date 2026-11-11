import type { Stage } from '@torio/contracts';
import { Baby, Crown, Egg, GraduationCap, Lightbulb, Sprout, type LucideIcon } from 'lucide-react';

export interface StageMeta {
  label: string;
  icon: LucideIcon;
  /** The stage's palette: primary accent, soft background tint, and the icon container colour. */
  color: string;
  tint: string;
  iconBg: string;
  /** Which animation (globals.css `.stage-anim-*`) the stage icon plays while it is the current stage. */
  anim: 'born' | 'baby' | 'growing' | 'smart' | 'mature' | 'expert';
  /** What this stage means for the Brain (shown when it is the current stage). */
  now: string;
  /** Short line under the stage in the journey. */
  blurb: string;
}

/** One identity per stage, used identically by the header badge, the journey, the ring and the detail panel. */
export const STAGE_META: Record<Stage, StageMeta> = {
  BORN: {
    label: 'Born',
    icon: Egg,
    color: '#5B5CE2',
    tint: '#F0F0FF',
    iconBg: '#DCDDFE',
    anim: 'born',
    now: 'Your Brain has been created. It has very little business knowledge yet.',
    blurb: 'Created, with very little knowledge yet.',
  },
  BABY: {
    label: 'Baby',
    icon: Baby,
    color: '#D97706',
    tint: '#FFF5E8',
    iconBg: '#FFE3BE',
    anim: 'baby',
    now: 'Your Brain is learning the basics of your business.',
    blurb: 'Knows who your business is.',
  },
  GROWING: {
    label: 'Growing',
    icon: Sprout,
    color: '#059669',
    tint: '#ECFDF5',
    iconBg: '#C9F3DE',
    anim: 'growing',
    now: 'Your Brain knows what you offer and what customers ask.',
    blurb: 'Learning your products, FAQs and policies.',
  },
  SMART: {
    label: 'Smart',
    icon: Lightbulb,
    color: '#2563EB',
    tint: '#EFF6FF',
    iconBg: '#D6E8FF',
    anim: 'smart',
    now: 'Your Brain understands how you communicate and handle situations.',
    blurb: 'Brand voice, instructions and rules in place.',
  },
  MATURE: {
    label: 'Mature',
    icon: GraduationCap,
    color: '#7C3AED',
    tint: '#F5F0FF',
    iconBg: '#E4D7FF',
    anim: 'mature',
    now: 'Your Brain has strong, consistent business knowledge.',
    blurb: 'Broad, valid and consistent knowledge.',
  },
  EXPERT: {
    label: 'Expert',
    icon: Crown,
    color: '#B7791F',
    tint: '#FFFAE9',
    iconBg: '#FCE8A7',
    anim: 'expert',
    now: 'Your Brain is comprehensive, validated and ready for real customer conversations.',
    blurb: 'Comprehensive and ready for real conversations.',
  },
};

/** What each intelligence dimension measures, in one line. */
export const DIMENSION_INFO: Record<string, string> = {
  quality: 'How specific and useful your descriptions, answers and instructions are.',
  completeness: 'How much of what your kind of business needs is covered.',
  validity: 'How many entries are valid, unique and consistent.',
  operational: 'Active rules, instructions, escalation and boundaries.',
};
