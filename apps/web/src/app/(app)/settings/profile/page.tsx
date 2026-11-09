import { redirect } from 'next/navigation';

/** The page moved into General; keep old bookmarks and links working. */
export default function Page() {
  redirect('/settings/general#personal');
}
