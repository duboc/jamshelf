'use client';

import { useId, useRef } from 'react';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';

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
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, onCancel, dialogRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/45 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="gm3-card gm3-dialog-enter w-full max-w-sm rounded-[28px] bg-[var(--surface)] p-6 space-y-5"
        style={{ boxShadow: 'var(--shadow-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <h2 id={titleId} className="font-display text-xl font-bold text-[var(--ink)]">
            {title}
          </h2>
          <div className="text-sm text-[var(--muted)] leading-relaxed">{description}</div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="pill-btn bg-[var(--bg)] h-10 px-4 text-sm">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`pill-btn h-10 px-5 text-sm ${danger ? 'pill-btn-rec' : 'pill-btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
