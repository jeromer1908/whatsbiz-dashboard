import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, CheckCircle2, ClipboardList, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchNotifications, logSupabaseError, markAllRead, markNotificationRead } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { AppNotification, Username } from '@/types';

const POLL_MS = 30_000;

interface NotificationBellProps {
  /** Username of the signed-in account. */
  recipient: Username;
  /** Called after a notification is clicked (and marked read). */
  onSelect?: (notification: AppNotification) => void;
  /** Called when a notification arrives that wasn't in the list before (realtime or poll). */
  onNew?: (notification: AppNotification) => void;
}

export function NotificationBell({ recipient, onSelect, onNew }: NotificationBellProps) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string> | null>(null);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications(recipient);
      if (seenIds.current) {
        const fresh = data.filter((n) => !seenIds.current!.has(n.id));
        fresh.forEach((n) => onNewRef.current?.(n));
      }
      seenIds.current = new Set(data.map((n) => n.id));
      setItems(data);
    } catch (err) {
      logSupabaseError('Failed to load notifications', err);
    } finally {
      setLoading(false);
    }
  }, [recipient]);

  // Initial load + realtime + 30s polling fallback
  useEffect(() => {
    seenIds.current = null;
    load();

    const channel = supabase
      .channel(`notifications-${recipient}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient=eq.${recipient}` },
        () => load()
      )
      .subscribe();

    const interval = window.setInterval(load, POLL_MS);
    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [recipient, load]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.is_read).length;

  const handleClick = async (n: AppNotification) => {
    setOpen(false);
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      try {
        await markNotificationRead(n.id);
      } catch (err) {
        logSupabaseError('Failed to mark notification read', err);
      }
    }
    onSelect?.(n);
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    try {
      await markAllRead(recipient);
    } catch (err) {
      logSupabaseError('Failed to mark all read', err);
      load();
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-black transition-all"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#25D366] text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-4 right-4 top-16 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem] bg-white rounded-xl shadow-2xl border border-[#E5E7EB] z-40 animate-modal-in overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E7EB]">
            <p className="text-sm font-bold text-black">Notifications</p>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unread === 0 || markingAll}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#25D366] hover:text-[#1EBE5A] disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              <CheckCheck size={14} />
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin text-[#25D366]" size={20} />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-6">
                <div className="w-12 h-12 rounded-full bg-[#E8FAEF] flex items-center justify-center mb-3 text-[#25D366]">
                  <Bell size={20} />
                </div>
                <p className="text-sm font-bold text-black">You're all caught up</p>
                <p className="text-xs text-gray-500 mt-0.5">New notifications will show up here.</p>
              </div>
            ) : (
              items.map((n) => {
                const Icon = n.type === 'task_completed' ? CheckCircle2 : ClipboardList;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-[#E5E7EB] last:border-0 hover:bg-gray-50 transition-colors ${
                      n.is_read ? '' : 'bg-[#E8FAEF]/50'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        n.is_read ? 'bg-gray-100 text-gray-400' : 'bg-[#E8FAEF] text-[#25D366]'
                      }`}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${n.is_read ? 'font-medium text-gray-600' : 'font-bold text-black'}`}>
                        {n.title}
                      </p>
                      {n.message && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>}
                      <p className="text-[11px] text-gray-400 font-medium mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-[#25D366] mt-1.5 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
