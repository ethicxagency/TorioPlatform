import type { Metadata } from 'next';
import { Onboarding } from '@/features/onboarding/onboarding';

export const metadata: Metadata = {
  title: 'Set up your store',
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return <Onboarding />;
}
