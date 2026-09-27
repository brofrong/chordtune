'use client';

import { Check, CircleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'error';
type Toast = { id: number; text: string; tone: Tone };

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

/** `toast('Сохранено')` from anywhere; it slides in at the top and leaves by itself. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((text: string, tone: Tone = 'success') => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 1800);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={spring.pop}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-sm shadow-lg',
                toast.tone === 'success'
                  ? 'bg-primary text-primary-foreground shadow-glow'
                  : 'bg-destructive text-white',
              )}
            >
              {toast.tone === 'success' ? (
                <Check className="size-4" />
              ) : (
                <CircleAlert className="size-4" />
              )}
              {toast.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
