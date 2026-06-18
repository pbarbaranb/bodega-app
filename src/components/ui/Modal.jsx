import { useEffect } from 'react';

export function BottomSheet({ open, onClose, title, subtitle, children }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative z-10 max-h-[92vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-cream p-5 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="mb-1 text-xl font-extrabold text-ink">{title}</h2>}
        {subtitle && <p className="mb-4 text-sm font-semibold text-muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function CenterModal({ open, onClose, title, children }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative z-10 max-h-[90vh] w-full max-w-[480px] overflow-y-auto rounded-2xl bg-cream p-5 shadow-xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="mb-4 text-xl font-extrabold text-ink">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function StepIndicator({ step }) {
  const steps = [1, 2, 3];
  return (
    <div className="mb-5 flex items-center justify-center gap-0">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${
              s < step
                ? 'bg-bodega text-white'
                : s === step
                  ? 'bg-bodega text-white ring-4 ring-bodega/20'
                  : 'bg-white text-muted'
            }`}
          >
            {s < step ? '✓' : s}
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-10 ${s < step ? 'bg-bodega' : 'bg-white'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export function Btn({ children, variant = 'green', className = '', disabled, ...props }) {
  const variants = {
    green: 'bg-bodega text-white hover:bg-bodega-dark disabled:opacity-50',
    ghost: 'bg-transparent text-muted border-2 border-transparent hover:border-bodega/20',
    red: 'bg-red text-white',
  };
  return (
    <button
      className={`mt-3 flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-extrabold transition active:scale-[0.98] ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, badge, className = '', ...props }) {
  return (
    <div className="mb-3">
      {label && (
        <label className="mb-1 flex items-center gap-2 text-xs font-bold text-muted">
          {label}
          {badge}
        </label>
      )}
      <input
        className={`w-full rounded-xl border-2 border-transparent bg-white px-3 py-3 text-sm font-bold text-ink outline-none focus:border-bodega ${className}`}
        {...props}
      />
    </div>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <div className="mb-3">
      {label && <label className="mb-1 block text-xs font-bold text-muted">{label}</label>}
      <select
        className="w-full rounded-xl border-2 border-transparent bg-white px-3 py-3 text-sm font-bold text-ink outline-none focus:border-bodega"
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function AiBadge({ level }) {
  const map = {
    alta: { text: '✓ IA', cls: 'bg-bodega/15 text-bodega' },
    media: { text: '⚠️ IA', cls: 'bg-yellow/20 text-yellow' },
    baja: { text: '? IA', cls: 'bg-red/15 text-red' },
  };
  const b = map[level] || { text: '? Manual', cls: 'bg-yellow/20 text-yellow' };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${b.cls}`}>{b.text}</span>
  );
}

export function Card({ title, children, className = '' }) {
  return (
    <div className={`mb-3 rounded-2xl bg-white p-4 shadow-sm ${className}`}>
      {title && <div className="mb-3 text-xs font-extrabold uppercase tracking-wide text-muted">{title}</div>}
      {children}
    </div>
  );
}
