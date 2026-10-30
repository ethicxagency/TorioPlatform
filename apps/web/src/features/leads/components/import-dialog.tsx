'use client';

import { CsvImportDialog } from '@/components/shared/csv-import-dialog';
import { applyMapping, guessMapping, IMPORT_FIELDS } from '../csv';

const LABELS = {
  name: 'Full name *',
  email: 'Email',
  phone: 'Phone',
  company: 'Company',
  jobTitle: 'Job title',
  source: 'Source',
  stage: 'Status',
  tags: 'Tags (; separated)',
  dealValue: 'Deal value',
  notes: 'Notes',
};

interface Result {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export function ImportDialog({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (rows: Record<string, string>[]) => Promise<Result>;
}) {
  return (
    <CsvImportDialog
      entity="leads"
      fields={IMPORT_FIELDS}
      labels={LABELS}
      requiredField="name"
      guess={guessMapping}
      apply={(rows, m) => applyMapping(rows, m as Parameters<typeof applyMapping>[1])}
      onClose={onClose}
      onImport={onImport}
    />
  );
}
