'use client';

import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/leads/components/modal';
import { parseCsv } from '@/features/leads/csv';

interface Result {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
}
interface Props {
  /** "leads" / "customers": used in titles and copy. */
  entity: string;
  /** Importable fields, their labels, and the field that must be mapped (usually "name"). */
  fields: readonly string[];
  labels: Record<string, string>;
  requiredField: string;
  guess: (headers: string[]) => Record<string, number>;
  apply: (rows: string[][], mapping: Record<string, number>) => Record<string, string>[];
  onClose: () => void;
  onImport: (rows: Record<string, string>[]) => Promise<Result>;
}

const MAX_ROWS = 1000;

/** CSV import: parsed in the browser, column mapping and preview, then validated and de-duplicated by the server. Duplicates are skipped, never merged. */
export function CsvImportDialog({
  entity,
  fields,
  labels,
  requiredField,
  guess,
  apply,
  onClose,
  onImport,
}: Props) {
  const [table, setTable] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  const headers = table?.[0] ?? [];
  const data = table && mapping ? apply(table.slice(1), mapping) : [];
  const missingName = data.filter((r) => !r[requiredField]).length;
  const tooMany = data.length > MAX_ROWS;

  const pick = async (file: File | undefined) => {
    setError('');
    if (!file) return;
    if (file.size > 2_000_000) return setError('File is too large (max 2 MB).');
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2)
      return setError('The file needs a header row and at least one data row.');
    setFileName(file.name);
    setTable(parsed);
    setMapping(guess(parsed[0]!));
  };

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await onImport(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Import ${entity}`}
      description="Upload a CSV, check the column mapping, then import."
      onClose={onClose}
      className="sm:max-w-[680px]"
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={
                !table ||
                busy ||
                tooMany ||
                data.length === 0 ||
                !mapping ||
                mapping[requiredField]! < 0
              }
              onClick={run}
            >
              {busy ? 'Importing…' : `Import ${data.length || ''} ${entity}`}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-3 text-[13px]" role="status">
          <p className="m-0 text-[14px] font-semibold">
            {result.created} created · {result.skipped} skipped ·{' '}
            {result.errors.length - result.skipped} with errors
          </p>
          {result.errors.length > 0 && (
            <ul className="m-0 max-h-56 list-none overflow-y-auto rounded-lg border border-line p-0">
              {result.errors.map((e) => (
                <li key={e.row} className="border-b border-line-subtle px-3 py-1.5 last:border-0">
                  <b>Row {e.row}:</b> {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#C9CBD3] bg-[#FBFBFC] px-4 py-6 text-center text-[13px] hover:bg-wash">
            <FileUp size={20} className="text-primary" aria-hidden />
            <span className="font-medium">{fileName || 'Choose a CSV file'}</span>
            <span className="text-xs text-muted">
              UTF-8, with a header row · up to {MAX_ROWS} rows · 2 MB
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
          {error && (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {error}
            </p>
          )}
          {table && mapping && (
            <>
              <fieldset className="m-0 grid grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-2">
                <legend className="mb-1.5 text-[12.5px] font-semibold">Column mapping</legend>
                {fields.map((f) => (
                  <label key={f} className="flex items-center justify-between gap-2 text-[13px]">
                    {labels[f]}
                    <select
                      value={mapping[f]}
                      onChange={(e) => setMapping({ ...mapping, [f]: Number(e.target.value) })}
                      className="h-8 w-[170px] rounded-lg border border-line bg-white px-2 text-[13px]"
                    >
                      <option value={-1}>— skip —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>
              <div>
                <div className="mb-1.5 text-[12.5px] font-semibold">
                  Preview ({data.length} rows)
                </div>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-xs">
                    <thead className="bg-[#FBFBFC] text-faint">
                      <tr>
                        {fields
                          .filter((f) => mapping[f]! >= 0)
                          .map((f) => (
                            <th key={f} className="px-2 py-1.5 text-left font-medium">
                              {f}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.slice(0, 5).map((r, i) => (
                        <tr key={i} className="border-t border-line-subtle">
                          {fields
                            .filter((f) => mapping[f]! >= 0)
                            .map((f) => (
                              <td key={f} className="max-w-[140px] truncate px-2 py-1.5">
                                {r[f]}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {mapping[requiredField]! < 0 && (
                  <p role="alert" className="m-0 mt-2 text-xs text-danger">
                    Map a column to the required field to continue.
                  </p>
                )}
                {missingName > 0 && mapping[requiredField]! >= 0 && (
                  <p className="m-0 mt-2 text-xs text-warning">
                    {missingName} row(s) are missing the required field and will be reported as
                    errors.
                  </p>
                )}
                {tooMany && (
                  <p role="alert" className="m-0 mt-2 text-xs text-danger">
                    Too many rows: {data.length}. Split the file into batches of {MAX_ROWS}.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
