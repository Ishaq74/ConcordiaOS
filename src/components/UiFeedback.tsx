import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
}

interface UiFeedbackContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const UiFeedbackContext = createContext<UiFeedbackContextValue | null>(null);

export function useUiFeedback() {
  const ctx = useContext(UiFeedbackContext);
  if (!ctx) {
    throw new Error('useUiFeedback must be used within UiFeedbackProvider');
  }
  return ctx;
}

export function UiFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (val: boolean) => void;
  } | null>(null);
  const [promptState, setPromptState] = useState<{
    options: PromptOptions;
    value: string;
    resolve: (val: string | null) => void;
  } | null>(null);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptState({
        options,
        value: options.defaultValue || '',
        resolve,
      });
    });
  }, []);

  return (
    <UiFeedbackContext.Provider value={{ toast, confirm, prompt }}>
      {children}

      {/* Toast Stack */}
      <div
        className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
              t.type === 'success'
                ? 'bg-emerald-950 text-emerald-50 border-emerald-800'
                : t.type === 'error'
                ? 'bg-red-950 text-red-50 border-red-800'
                : 'bg-slate-900 text-slate-50 border-slate-700'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info size={18} className="text-indigo-400 shrink-0 mt-0.5" />}
            <span className="flex-1 break-words leading-snug">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-white/60 hover:text-white p-0.5 rounded"
              aria-label="Fermer"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmState && (
        <div className="fixed inset-0 z-[210] bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  confirmState.options.danger ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'
                }`}
              >
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900">{confirmState.options.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{confirmState.options.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {confirmState.options.cancelLabel || 'Cancel'}
              </button>
              <button
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                  confirmState.options.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {confirmState.options.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Modal */}
      {promptState && (
        <div className="fixed inset-0 z-[210] bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              promptState.resolve(promptState.value.trim() || null);
              setPromptState(null);
            }}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">{promptState.options.title}</h3>
              {promptState.options.message && (
                <p className="text-sm text-slate-600">{promptState.options.message}</p>
              )}
            </div>
            <input
              type="text"
              autoFocus
              value={promptState.value}
              onChange={(e) => setPromptState({ ...promptState, value: e.target.value })}
              placeholder={promptState.options.placeholder}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  promptState.resolve(null);
                  setPromptState(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                {promptState.options.confirmLabel || 'Add'}
              </button>
            </div>
          </form>
        </div>
      )}
    </UiFeedbackContext.Provider>
  );
}
