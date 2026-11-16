import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { completeTask, logSupabaseError } from '@/lib/api';
import type { Task } from '@/types';

const MAX_BYTES = 5 * 1024 * 1024;

interface CompleteTaskModalProps {
  task: Task | null;
  onClose: () => void;
  onCompleted: (task: Task) => void;
}

export function CompleteTaskModal({ task, onClose, onCompleted }: CompleteTaskModalProps) {
  const { show } = useToast();
  const { username } = useAuth();
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when a different task opens
  useEffect(() => {
    setMessage('');
    setFile(null);
    setError(null);
  }, [task?.id]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Only image files can be attached.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('Image must be 5 MB or smaller.');
      return;
    }
    setError(null);
    // Pasted images arrive as "image.png" — give them a unique name
    const named = f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}.${f.type.split('/')[1] || 'png'}`, { type: f.type });
    setFile(named);
  };

  // Paste anywhere while the modal is open
  useEffect(() => {
    if (!task) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          e.preventDefault();
          acceptFile(item.getAsFile());
          return;
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [task]);

  const handleSave = async () => {
    if (!task || !username) return;
    if (!message.trim() && !file) {
      setError('Add a message or a screenshot (at least one is required).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await completeTask(task.id, message, file, username);
      show('success', 'Task marked as completed');
      onCompleted(updated);
    } catch (err) {
      logSupabaseError('Failed to complete task', err);
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!task} onClose={saving ? () => {} : onClose} title="Complete task">
      {task && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 border border-[#E5E7EB] px-4 py-3">
            <p className="text-sm font-bold text-black">{task.title}</p>
            {task.description && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{task.description}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-black mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-black min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent"
              placeholder="What did you do? Any notes for the admin…"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-black mb-1.5">Screenshot</label>
            {preview ? (
              <div className="relative rounded-lg border border-[#E5E7EB] bg-gray-50 overflow-hidden">
                <img src={preview} alt="Screenshot preview" className="w-full max-h-64 object-contain" />
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="absolute top-2 right-2 inline-flex items-center gap-1 bg-white text-red-500 text-xs font-bold px-2.5 py-1.5 rounded-lg shadow border border-[#E5E7EB] hover:bg-red-50"
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  acceptFile(e.dataTransfer.files?.[0]);
                }}
                className={`w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition-all ${
                  dragging ? 'border-[#25D366] bg-[#E8FAEF]' : 'border-[#E5E7EB] hover:border-[#25D366] hover:bg-gray-50'
                }`}
              >
                <ImagePlus size={24} className="text-[#25D366]" />
                <span className="text-sm font-semibold text-black">Click to upload or drag an image here</span>
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 font-medium">
                  <ClipboardPaste size={13} /> or press Ctrl+V to paste a screenshot · max 5 MB
                </span>
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          {error && <p className="text-sm font-medium text-red-500 bg-red-50 rounded-lg px-3 py-2.5">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || (!message.trim() && !file)}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? 'Saving…' : 'Mark completed'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
