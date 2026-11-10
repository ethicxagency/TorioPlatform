'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { Button } from '@/components/ui/button';
import { downloadMyData } from '../queries';
import { Notice, PageHeader, Section } from './bits';

export function PrivacyPage() {
  const { toast } = useShell();
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <PageHeader
        title="Data & privacy"
        description="What Torio holds about you, and how to get a copy."
      />
      <Section
        title="Download my data"
        description="A JSON file with your profile, the workspaces you belong to and your signed-in devices."
      >
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await downloadMyData();
              toast('Your data was downloaded');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Could not export your data');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={14} />
          {busy ? 'Preparing…' : 'Download my data'}
        </Button>
        <p className="mb-0 mt-3 text-xs text-faint">
          The file contains only your own account. It excludes password data, sign-in tokens, and
          other people&apos;s conversations or customers.
        </p>
      </Section>
      <Section title="Not available yet">
        <Notice>
          Account deletion, data-retention controls and consent preferences aren&apos;t built, so
          there are no buttons for them. Torio makes no compliance claims on this page.
        </Notice>
      </Section>
    </div>
  );
}
