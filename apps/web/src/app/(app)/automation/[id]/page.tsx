import type { Metadata } from 'next';
import { EditorPage } from '@/features/automation/components/editor-page';

export const metadata: Metadata = { title: 'Automation editor' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorPage id={id} />;
}
