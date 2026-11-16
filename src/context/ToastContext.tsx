import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  show: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => remove(id), 4000);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 max-w-sm">
        {toasts.map((t) => {
          const Icon = t.type === 'success' ? CheckCircle : t.type === 'error' ? XCircle : AlertCircle;
          const colors =
            t.type === 'success'
              ? 'bg-white border-l-4 border-l-[#25D366] text-black'
              : t.type === 'error'
              ? 'bg-white border-l-4 border-l-red-500 text-black'
              : 'bg-white border-l-4 border-l-amber-500 text-black';
          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 rounded-xl shadow-lg border border-[#E5E7EB] px-4 py-3 animate-slide-in ${colors}`}
            >
              <Icon
                size={20}
                className={
                  t.type === 'success' ? 'text-[#25D366] shrink-0' : t.type === 'error' ? 'text-red-500 shrink-0' : 'text-amber-500 shrink-0'
                }
              />
              <p className="text-sm font-medium flex-1 leading-snug">{t.message}</p>
              <button onClick={() => remove(t.id)} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
