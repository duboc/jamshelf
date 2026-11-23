import { AuroraDialog } from '../aurora/primitives';

const SHORTCUT_GROUPS = [
  {
    title: 'Navegação',
    items: [
      { keys: '/ ou Ctrl+K', desc: 'Abrir busca rápida de músicas e setlists' },
      { keys: '?', desc: 'Abrir este guia de atalhos' },
      { keys: 'Esc', desc: 'Fechar janelas, sair da Tela limpa ou sair dos Slides' },
    ],
  },
  {
    title: 'Visão da música e Tela limpa',
    items: [
      { keys: 'Espaço', desc: 'Iniciar ou pausar rolagem automática (ou marcar seção na calibração)' },
      { keys: '+ / -', desc: 'Acelerar ou reduzir a velocidade da rolagem automática' },
      { keys: 'M', desc: 'Ligar ou pausar o metrônomo audível' },
      { keys: 'C', desc: 'Disparar contagem visual 1·2·3·4' },
      { keys: 'L', desc: 'Alternar entre só letra e cifra completa' },
      { keys: 'F', desc: 'Entrar ou sair da Tela limpa' },
      { keys: 'S', desc: 'Abrir ou fechar a lista do setlist' },
      { keys: '← / →', desc: 'Ir para a música anterior ou próxima do setlist' },
    ],
  },
  {
    title: 'Slides (iPad, pedal Bluetooth e Apple Pencil)',
    items: [
      { keys: 'PageDown / → / ↓ / Espaço', desc: 'Avançar página (ou ir para a próxima música)' },
      { keys: 'PageUp / ← / ↑', desc: 'Voltar página (ou ir para a música anterior)' },
      { keys: 'Toque esq. / dir. ou deslize', desc: 'Virar páginas sem menus no toque' },
      { keys: 'Apple Pencil na folha', desc: 'Desenhar direto no slide sem abrir menus' },
      { keys: 'Ctrl+Z / Ctrl+Y', desc: 'Desfazer ou refazer traços e notas no modo Anotar' },
    ],
  },
  {
    title: 'Modo edição visual',
    items: [
      { keys: 'Ctrl+S', desc: 'Salvar alterações e sair do modo edição' },
      { keys: 'Ctrl+Z / Ctrl+Y', desc: 'Desfazer ou refazer alterações' },
      { keys: 'Shift+← / Shift+→', desc: 'Pular acorde selecionado palavra por palavra' },
      { keys: '← / → (acorde)', desc: 'Ajustar posição do acorde letra por letra' },
      { keys: '[ / ]', desc: 'Ir para o acorde anterior ou próximo no editor de acorde' },
      { keys: 'A a G / Delete', desc: 'Trocar fundamental rapidamente ou remover acorde selecionado' },
    ],
  },
];

export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AuroraDialog
      open={open}
      onClose={onClose}
      title="Atalhos e gestos de palco"
      subtitle="Controle o Jamshelf sem tirar as mãos do instrumento"
      maxWidth="max-w-xl"
    >
      <div className="space-y-3.5">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="space-y-1.5">
            <h3 className="typescale-label-lg text-primary m-0">{group.title}</h3>
            <div className="rounded-2xl bg-surface-container-low divide-y divide-outline-variant/60">
              {group.items.map((item) => (
                <div
                  key={item.keys}
                  className="px-4 py-2 flex items-center justify-between gap-3"
                >
                  <span className="typescale-body-md text-on-surface">{item.desc}</span>
                  <kbd className="font-mono typescale-label-sm px-2.5 py-1 rounded-full bg-surface text-on-surface border border-outline-variant flex-shrink-0">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AuroraDialog>
  );
}
