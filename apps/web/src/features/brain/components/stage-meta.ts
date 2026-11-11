import type { Stage } from '@torio/contracts';
import { Baby, Crown, Egg, GraduationCap, Lightbulb, Sprout, type LucideIcon } from 'lucide-react';

export interface StageMeta {
  label: string;
  icon: LucideIcon;
  /** Solid accent, and a soft tint of it for backgrounds. */
  color: string;
  tint: string;
  /** What this stage means for the Brain (shown when it is the current stage). */
  now: string;
  /** Short line under the stage in the journey. */
  blurb: string;
}

export const STAGE_META: Record<Stage, StageMeta> = {
  BORN: {
    label: 'Born',
    icon: Egg,
    color: '#7C7FB8',
    tint: '#F1F1F8',
    now: 'Your Brain has been created. It has very little business knowledge yet.',
    blurb: 'Created, with very little knowledge yet.',
  },
  BABY: {
    label: 'Baby',
    icon: Baby,
    color: '#2B8FD9',
    tint: '#E8F3FC',
    now: 'Your Brain is learning the basics of your business.',
    blurb: 'Knows who your business is.',
  },
  GROWING: {
    label: 'Growing',
    icon: Sprout,
    color: '#0F9D8A',
    tint: '#E3F6F2',
    now: 'Your Brain knows what you offer and what customers ask.',
    blurb: 'Learning your products, FAQs and policies.',
  },
  SMART: {
    label: 'Smart',
    icon: Lightbulb,
    color: '#7C4DE8',
    tint: '#F0EBFD',
    now: 'Your Brain understands how you communicate and handle situations.',
    blurb: 'Brand voice, instructions and rules in place.',
  },
  MATURE: {
    label: 'Mature',
    icon: GraduationCap,
    color: '#5B5CE2',
    tint: '#F0F0FF',
    now: 'Your Brain has strong, consistent business knowledge.',
    blurb: 'Broad, valid and consistent knowledge.',
  },
  EXPERT: {
    label: 'Expert',
    icon: Crown,
    color: '#C48A0A',
    tint: '#FBF3DC',
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
