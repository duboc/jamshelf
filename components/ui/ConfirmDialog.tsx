'use client';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4"
        style={{ boxShadow: 'var(--shadow-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <h3 className="font-display text-xl text-[var(--ink)]">{title}</h3>
          <div className="text-sm text-[var(--muted)] leading-relaxed">{description}</div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="pill-btn px-3.5 py-1.5 text-xs">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`pill-btn px-4 py-1.5 text-xs ${danger ? 'pill-btn-rec' : 'pill-btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
