'use client';

import { useId, useRef } from 'react';
import { useDialogA11y } from '@/lib/hooks/use-dialog-a11y';
import { CloseIcon } from '@/components/ui/Icons';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const GROUPS = [
  {
    title: 'Navegação',
    items: [
      { keys: '/ ou Ctrl+K', desc: 'Abrir busca rápida de músicas e setlists' },
      { keys: '?', desc: 'Abrir este guia de atalhos' },
      { keys: 'Esc', desc: 'Fechar janelas, sair da Tela limpa ou do Modo Show' },
    ],
  },
  {
    title: 'Palco e Leitura (Música e Modo Show)',
    items: [
      { keys: 'Espaço', desc: 'Iniciar ou pausar o auto-scroll' },
      { keys: 'C', desc: 'Disparar contagem visual 1·2·3·4' },
      { keys: 'L', desc: 'Alternar Só letra / Com acordes' },
      { keys: 'S', desc: 'Abrir ou fechar a lista do setlist' },
      { keys: '← / →', desc: 'Ir para música anterior ou próxima do setlist' },
      { keys: 'Deslizar ← / →', desc: 'Trocar de música no Modo Show (touch)' },
    ],
  },
  {
    title: 'Modo Edição',
    items: [
      { keys: 'Ctrl+Z / Ctrl+Y', desc: 'Desfazer ou refazer alterações' },
      { keys: '← / → (acorde)', desc: 'Mover acorde selecionado na letra' },
      { keys: 'Delete', desc: 'Remover acorde selecionado' },
    ],
  },
];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, onClose, dialogRef);

  if (!open) return null;

  return (
    <div
      className="gm3-backdrop-enter fixed inset-0 z-[75] bg-black/45 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="gm3-card gm3-dialog-enter w-full max-w-lg max-h-[85vh] rounded-[28px] bg-[var(--surface)] flex flex-col overflow-hidden"
        style={{ boxShadow: 'var(--shadow-md)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 bg-[var(--surface-high)]">
          <h2 id={titleId} className="font-display text-lg font-bold text-[var(--ink)]">
            Atalhos e gestos de palco
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar guia de atalhos"
            className="gm3-icon-btn w-9 h-9 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface2)] cursor-pointer"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {GROUPS.map((group) => (
            <section key={group.title} className="space-y-2">
              <h3 className="field-label">{group.title}</h3>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <div
                    key={item.keys}
                    className="flex items-center justify-between gap-3 py-1.5 text-sm"
                  >
                    <span className="text-[var(--ink)]">{item.desc}</span>
                    <kbd className="font-mono text-xs px-2.5 py-1 rounded-full bg-[var(--bg)] text-[var(--ink)] flex-shrink-0">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
