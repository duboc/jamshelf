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
      className="fixed inset-0 z-[70] bg-black/45 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-[28px] bg-[var(--surface)] p-6 space-y-5"
        style={{ boxShadow: 'var(--shadow-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <h3 className="font-display text-xl text-[var(--ink)]">{title}</h3>
          <div className="text-sm text-[var(--muted)] leading-relaxed">{description}</div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="pill-btn bg-[var(--bg)] px-4 py-2 text-sm">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`pill-btn px-5 py-2 text-sm ${danger ? 'pill-btn-rec' : 'pill-btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
