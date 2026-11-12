/**
 * The single source of truth for the Torio Brain version. Everything that shows or reports the Brain version (the header badge,
 * the About page, and later the API and logs) reads it from here. Never type the version number anywhere else.
 *
 * Semantic versioning, for the Brain's algorithms and capabilities, not for the app:
 *  - major: a significant change to the Brain's architecture or compatibility;
 *  - minor: a new Brain capability or feature;
 *  - patch: an improvement, fix or optimisation.
 * It is bumped by hand, on purpose, when a Brain release is made. A deployment never changes it.
 */
export const BRAIN_VERSION = { major: 1, minor: 0, patch: 0 } as const;

export const brainVersionString = (
  v: { major: number; minor: number; patch: number } = BRAIN_VERSION,
) => `${v.major}.${v.minor}.${v.patch}`;

export type BrainReleaseStatus = 'current' | 'preview' | 'deprecated';

export interface BrainRelease {
  version: string;
  status: BrainReleaseStatus;
  /** ISO date of the release. Null until a date is configured: none is ever invented. */
  releasedAt: string | null;
  /** What this version is, in one or two sentences. */
  description: string;
  /** Release notes for the version. Empty until real notes are written. */
  notes: string[];
}

/** The release information of the version in use. */
export const BRAIN_RELEASE: BrainRelease = {
  version: brainVersionString(),
  status: 'current',
  releasedAt: null,
  description:
    'Business profile, products, policies, brand voice, instructions and rules working together to ground every AI reply.',
  notes: [],
};

/**
 * Earlier releases, newest first. Empty on purpose: history is added here when it exists, and the About page shows the section
 * only then. No placeholder entries.
 */
export const BRAIN_RELEASE_HISTORY: BrainRelease[] = [];

export const BRAIN_STATUS_LABEL: Record<BrainReleaseStatus, string> = {
  current: 'Current version',
  preview: 'Preview',
  deprecated: 'Superseded',
};
