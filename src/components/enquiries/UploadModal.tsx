import { useState, useRef, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { parseFile, buildUploadPreview, fetchAllMobiles, insertCustomersBatch, deleteCustomersByBatch } from '@/lib/api';
import { toCSV, downloadCSV } from '@/lib/format';
import type { UploadPreview } from '@/types';
import { UploadCloud, FileSpreadsheet, Download, Check, X, Loader2, Undo2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  lastBatchId: string | null;
  onUndo: (batchId: string) => void;
}

type Stage = 'select' | 'mapping' | 'preview' | 'saving' | 'done';

export function UploadModal({ open, onClose, onUploaded, lastBatchId, onUndo }: UploadModalProps) {
  const { show } = useToast();
  const [stage, setStage] = useState<Stage>('select');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mobileColumn, setMobileColumn] = useState<string>('');
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [progress, setProgress] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [undoBusy, setUndoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const reset = useCallback(() => {
    setStage('select');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMobileColumn('');
    setPreview(null);
    setProgress(0);
    setSavedCount(0);
    setError(null);
  }, []);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const { headers: hdrs, rows: rawRows } = await parseFile(file);
      if (rawRows.length === 0) {
        setError('The file appears to be empty');
        return;
      }
      setFileName(file.name);
      setHeaders(hdrs);
      setRows(rawRows);

      // Auto-detect mobile column
      const lower = hdrs.map((h) => h.toLowerCase().trim());
      const mobileIdx = lower.findIndex((h) =>
        ['mobile', 'phone', 'whatsapp', 'number', 'contact'].some((c) => h.includes(c))
      );
      if (mobileIdx >= 0) {
        setMobileColumn(hdrs[mobileIdx]);
        await generatePreview(hdrs, rawRows, hdrs[mobileIdx]);
      } else {
        setMobileColumn('');
        setStage('mapping');
      }
    } catch {
      setError('Could not read the file. Please use a valid .xlsx, .xls, or .csv file.');
    }
  };

  const generatePreview = async (
    hdrs: string[],
    rawRows: Record<string, unknown>[],
    mobileCol: string
  ) => {
    try {
      const existingMobiles = await fetchAllMobiles();
      const p = buildUploadPreview(hdrs, rawRows, mobileCol, existingMobiles);
      setPreview(p);
      setStage('preview');
    } catch {
      setError('Failed to build preview');
    }
  };

  const handleSave = async () => {
    if (!preview || preview.newRows.length === 0) return;
    setStage('saving');
    setProgress(0);
    try {
      const total = preview.newRows.length;
      const batchSize = 500;
      for (let i = 0; i < total; i += batchSize) {
        await insertCustomersBatch(preview.newRows.slice(i, i + batchSize));
        setProgress(Math.min(100, Math.round(((i + batchSize) / total) * 100)));
      }
      setSavedCount(total);
      setStage('done');
      onUploaded();
      show('success', `${total} enquiries saved successfully`);
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'Failed to save enquiries');
      setStage('preview');
    }
  };

  const handleUndo = async () => {
    if (!lastBatchId) return;
    setUndoBusy(true);
    try {
      const count = await deleteCustomersByBatch(lastBatchId);
      show('success', `Undid last upload — ${count} enquiries removed`);
      onUndo(lastBatchId);
      onUploaded();
    } catch (err) {
      show('error', err instanceof Error ? err.message : 'Failed to undo upload');
    } finally {
      setUndoBusy(false);
    }
  };

  const downloadSample = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Mobile', 'Email', 'Location', 'Business', 'Notes'],
      ['Rajesh Kumar', '9876543210', 'rajesh@example.com', 'Mumbai, Maharashtra', 'Retail', 'Interested in bulk plan'],
      ['Priya Sharma', '9812345678', 'priya@example.com', 'Delhi', 'Consulting', 'Follow up next week'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sample');
    XLSX.writeFile(wb, 'sample_enquiries.csv', { bookType: 'csv' });
  };

  const downloadRejected = () => {
    if (!preview || preview.rejectedRows.length === 0) return;
    downloadCSV('rejected_rows.csv', toCSV(preview.rejectedRows));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Upload Enquiries"
      size="lg"
    >
      {/* Undo last upload */}
      {lastBatchId && stage === 'select' && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <Undo2 size={16} className="text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">Last upload can be undone</span>
          </div>
          <Button variant="secondary" onClick={handleUndo} disabled={undoBusy} className="text-sm py-2">
            {undoBusy ? <Loader2 size={14} className="animate-spin" /> : null}
            Undo Last Upload
          </Button>
        </div>
      )}

      {/* Stage: Select file */}
      {stage === 'select' && (
        <div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
              dragging ? 'border-[#25D366] bg-[#E8FAEF]' : 'border-gray-300 hover:border-[#25D366] hover:bg-gray-50'
            }`}
          >
            <UploadCloud size={40} className="mx-auto text-gray-400 mb-3" />
            <p className="text-sm font-semibold text-black mb-1">Drag and drop your file here</p>
            <p className="text-xs text-gray-500">Supports .xlsx, .xls, and .csv files</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 font-medium mt-3 text-center">{error}</p>
          )}

          <div className="mt-4 flex items-center justify-center">
            <button
              onClick={downloadSample}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#25D366] hover:text-[#1EBE5A]"
            >
              <Download size={16} />
              Download sample file
            </button>
          </div>
        </div>
      )}

      {/* Stage: Column mapping */}
      {stage === 'mapping' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg px-4 py-3">
            <FileSpreadsheet size={18} />
            <span className="text-sm font-semibold">
              Could not auto-detect the mobile column in "{fileName}". Please select it.
            </span>
          </div>
          <div>
            <label className="block text-sm font-semibold text-black mb-1.5">Mobile column</label>
            <select
              value={mobileColumn}
              onChange={(e) => setMobileColumn(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-black focus:outline-none focus:ring-2 focus:ring-[#25D366]"
            >
              <option value="">Select a column…</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={reset}>
              Back
            </Button>
            <Button
              disabled={!mobileColumn}
              onClick={() => generatePreview(headers, rows, mobileColumn)}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Stage: Preview */}
      {stage === 'preview' && preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="New" value={preview.newRows.length} color="green" icon={<Check size={16} />} />
            <StatCard label="Already Saved" value={preview.existingCount} color="gray" icon={<Check size={16} />} />
            <StatCard label="Invalid" value={preview.invalidCount} color="red" icon={<X size={16} />} />
            <StatCard label="Duplicates" value={preview.duplicateCount} color="amber" icon={<X size={16} />} />
          </div>

          {/* Preview table */}
          {preview.newRows.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-black mb-2">Preview (first 10 rows)</h4>
              <div className="overflow-x-auto border border-[#E5E7EB] rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-gray-600">Name</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">Mobile</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">Email</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">Location</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">Business</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.newRows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t border-[#E5E7EB]">
                        <td className="px-3 py-2 text-black">{r.name}</td>
                        <td className="px-3 py-2 text-black font-medium">{r.mobile}</td>
                        <td className="px-3 py-2 text-gray-500">{r.email || '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{r.location || '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{r.business || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {preview.rejectedRows.length > 0 && (
            <button
              onClick={downloadRejected}
              className="inline-flex items-center gap-2 text-sm font-semibold text-red-500 hover:text-red-600"
            >
              <Download size={16} />
              Download rejected rows ({preview.rejectedRows.length})
            </button>
          )}

          <div className="flex justify-between items-center pt-2">
            <Button variant="secondary" onClick={reset}>
              Choose another file
            </Button>
            <Button
              disabled={preview.newRows.length === 0}
              onClick={handleSave}
            >
              Save {preview.newRows.length} Enquiries
            </Button>
          </div>
        </div>
      )}

      {/* Stage: Saving */}
      {stage === 'saving' && (
        <div className="py-8 text-center space-y-4">
          <Loader2 size={32} className="animate-spin text-[#25D366] mx-auto" />
          <p className="text-sm font-semibold text-black">Saving enquiries…</p>
          <div className="max-w-xs mx-auto">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#25D366] rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 font-medium mt-2">{progress}%</p>
          </div>
        </div>
      )}

      {/* Stage: Done */}
      {stage === 'done' && (
        <div className="py-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[#E8FAEF] flex items-center justify-center mx-auto">
            <Check className="text-[#25D366]" size={32} />
          </div>
          <p className="text-lg font-bold text-black">{savedCount} enquiries saved!</p>
          <p className="text-sm text-gray-500">You can undo this upload from the upload dialog.</p>
          <div className="flex justify-center gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                reset();
              }}
            >
              Upload Another
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: 'green' | 'gray' | 'red' | 'amber';
  icon: React.ReactNode;
}) {
  const colors = {
    green: 'bg-[#E8FAEF] text-[#1EBE5A]',
    gray: 'bg-gray-100 text-gray-600',
    red: 'bg-red-50 text-red-500',
    amber: 'bg-amber-50 text-amber-600',
  };
  return (
    <div className={`rounded-lg px-3 py-2.5 ${colors[color]}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-semibold opacity-80">{label}</span>
      </div>
      <p className="text-2xl font-extrabold mt-0.5">{value}</p>
    </div>
  );
}
