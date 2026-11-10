import { redirect } from 'next/navigation';

/** Settings has one navigation (the section list beside every page), so the bare route opens General. */
export default function Page() {
  redirect('/settings/general');
}
