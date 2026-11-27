# Jamshelf Design System (`DESIGN.md`)

Direção visual do Jamshelf baseada em **Google Material 3 (GM3)** com elementos de **GM3 Expressive** (tema Google Blue baseline). Substitui a linguagem anterior estilo Google Cloud Console (bordas `1px`, cantos de `4px`, top bar fixa e tabelas densas) por superfícies tonais sem sombras, formas arredondadas generosas, Navigation Rail e tipografia expressiva com `Google Sans Flex`.

## 1. Princípios

1. **Hierarquia por tom de superfície, não por bordas ou sombras**: separar canvas, cards e áreas secundárias usando a escada tonal GM3 (`#F0F4F9` -> `#FFFFFF` -> `#DDE3EA` no modo claro; `#131314` -> `#1E1F20` -> `#282A2C` -> `#333537` no escuro). Sombras ficam restritas a elementos flutuantes (menus, modais e drawers sobrepostos).
2. **Legibilidade de estante e palco**: o Jamshelf é usado em tablets no pedestal e celulares em ensaio ou show. Controles principais têm altura mínima de `40px` (`44px` nos Slides), contraste >= 4.5:1 e tipografia sem serifa limpa.
3. **Semântica musical fixa**: cores de destaque carregam significado consistente em toda a aplicação (azul para acordes e ação principal, verde para ritmo/sincronização, âmbar para notas de palco e anotações, vermelho para Ao Vivo e ações destrutivas).
4. **Um único ponto focal por tela**: no máximo um FAB e um botão preenchido (`primary`) visíveis por contexto. Ações secundárias usam botões tonais (`secondary-container`), outline ou texto.
5. **Sentence case sempre**: proibir `ALL CAPS` em rótulos, cabeçalhos de seção e badges (remove a classe `.eyebrow` em caixa alta). Exceção: siglas musicais (`BPM`, `C7M`, `Am`).

## 2. Cores e Tokens (Light e Dark)

Paleta derivada no espaço HCT a partir do azul GM3 `#0B57D0` (padrão). Preferências do aparelho oferecem 3 temas HCT opcionais (`Studio Violet`, `Stage Emerald` e `Warm Terracotta`) que deslocam `primary`, `secondary`, `minor-container` e o fundo suave juntos em uma única cor ativa, preservando as cores musicais fixas (`--tune`, `--warn`, `--rec`) e diferença tonal >= 50.

### Tokens de sistema

| Papel GM3 (`--gm3-sys-color-*`) | Token legado (`globals.css`) | Light | Dark | Uso no Jamshelf |
|---|---|---|---|---|
| `primary` | `--accent` / `--accent-ink` | `#0B57D0` | `#A8C7FA` | Acordes na cifra, CTA principal, números hero (`BPM`, contagem `1`), ícone ativo |
| `on-primary` | `--on-accent` | `#FFFFFF` | `#062E6F` | Texto e ícone sobre `primary` |
| `primary-container` | `--nav-active-bg` | `#D3E3FD` | `#0842A0` | FAB `+ Nova música`, chip de tom (`Tom G`), destaque de acorde grande |
| `on-primary-container` | `--accent-ink` | `#0842A0` | `#D3E3FD` | Texto e ícone sobre `primary-container` |
| `secondary` | `--secondary` (novo) | `#00639B` | `#7FCFFF` | Ícone/texto ativo no Navigation Rail, anel de foco (`:focus-visible`) |
| `secondary-container` | `--secondary-container` (novo) | `#C2E7FF` | `#004A77` | Pílula ativa no Rail/Bottom Bar, botão tonal, segmento selecionado (`Cifra`) |
| `on-secondary-container` | `--on-secondary-container` (novo) | `#004A77` | `#C2E7FF` | Texto e ícone sobre `secondary-container` |
| Tom menor (calm slate) | `--minor-container` / `--on-minor-container` | `#E4EAF2` / `#344054` | `#2C313A` / `#C9D5E8` | Chips de tons menores (`Am`, `Cm`, `F#m`) sem adicionar arco-íris |
| `surface-container` | `--bg` | `#F0F4F9` | `#131314` | Canvas principal da aplicação e fundo do Navigation Rail (com wash ambiental suave no topo fora dos modos de palco) |
| `surface-container-lowest` | `--surface` | `#FFFFFF` | `#1E1F20` | Cards principais (músicas, setlists, folha da cifra), barra de busca |
| `surface-container-high` | `--surface-high` (novo) | `#E9EEF6` | `#282A2C` | Dialogs, popovers, barras de ferramentas agrupadas |
| `surface-container-highest` | `--surface2` | `#DDE3EA` | `#333537` | Cards secundários/inativos, chips neutros, trilha de switch desligado |
| `on-surface` | `--ink` | `#1F1F1F` | `#E3E3E3` | Títulos, letra da música, horários e textos principais |
| `on-surface-variant` | `--muted` | `#444746` | `#C4C7C5` | Artista, rótulos do Rail inativos, metadados (`BPM`, compasso, duração) |
| `outline` | `--line` | `#747775` | `#8E918F` | Bordas de campos de texto (`outlined`) e botões outlined |
| `outline-variant` | `--line-subtle` | `#C4C7C5` | `#444746` | Divisores sutis, pontos inativos de metrônomo/contagem |

### Tokens musicais e semânticos

| Papel | Token (`globals.css`) | Light (fill / texto) | Dark (fill / texto) | Uso no Jamshelf |
|---|---|---|---|---|
| Ritmo e positivo (Tertiary) | `--tune` / `--tune-dim` | `#146C2E` / `#C4EED0` (dot `#6DD58C`) | `#6DD58C` / `#0F5223` | Auto-scroll ativo, capo, música calibrada, `Seguindo líder`, pulso passado |
| Alerta e destaque musical | `--warn` / `--warn-dim` | `#FFB124` (ícone) / `#FEF0C7` (fundo) / `#7A4F01` (texto) | `#FDD663` / `#3D2E05` | Notas/deixas de palco (`StageNotesBar`), modo `Anotar` nos Slides |
| Ao Vivo e erro (Error) | `--rec` / `--rec-dim` | `#B3261E` / `#F9DEDC` (`on`: `#8C1D18`) | `#F2B8B5` / `#601410` | Status `Liderando` (Ao Vivo), confirmação de descarte e exclusão |
| Teclas de piano | `--key-white` / `--key-black` | `#FFFFFF` / `#1F1F1F` | `#E3E3E3` / `#131314` | `PianoChordDiagram` |

> Nota de contraste: `#FFB124` e `#6DD58C` funcionam bem em ícones, pontos e marcadores gráficos. Para texto sobre fundo claro, usar `#7A4F01` (âmbar) e `#146C2E` (verde) para garantir WCAG AA (>= 4.5:1).

## 3. Tipografia

Carregar três famílias via Google Fonts em `app/layout.tsx`:

```html
https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght,ROND@6..144,400..700,0..100&family=Google+Sans+Text:wght@400;500;700&family=Google+Sans+Mono:wght@400;500;600;700&display=swap
```

| Papel | Família e eixos | Tamanho / altura | Uso |
|---|---|---|---|
| Expressive Hero | `Google Sans Flex` (`wght 500`, `ROND 100`) | `56px–96px / 1.0` | Contagem `1·2·3·4` (`CountInOverlay`), números em destaque |
| Display / Page Title | `Google Sans Flex` (`wght 500`, `ROND 60`) | `28px–32px / 1.2` | Título da página (`Repertório`, `Setlists`), nome da música no header |
| Card Metric | `Google Sans Flex` (`wght 500`, `ROND 100`, `tabular-nums`) | `22px–26px / 1.15` | Tom (`G`, `Am`) e BPM em destaque nos cards de música |
| Title (Card / Lista de músicas) | `Google Sans Flex` (`wght 700`, `ROND 0`) | `20px / 1.3` | Título da música nos cards, modo lista e faixas do setlist (foco em leitura rápida no palco/ensaio) |
| Subtitle / Seção | `Google Sans Flex` (`wght 500`, `ROND 0`) | `16px–18px / 1.35` | Título de modal, rótulo de seção (`[Refrão]`) |
| Body / Letra | `Google Sans Text` (`wght 400`) | `14px–16px / 1.5` (letra escalável por `fontSize`) | Texto geral de interface e letras na folha de cifra |
| Label / Botão / Nav | `Google Sans Text` (`wght 500`) | `12px–14px / 1.3` | Itens do Navigation Rail, botões, chips, tabs |
| Cifra e código | `Google Sans Mono` (`wght 600` acordes, `400` editor) | `0.9em` relativo à letra / `12px–13px` editor | `ChordBadge`, alinhamento de acordes sobre a letra, `ChordProEditor` |

Regras tipográficas:
- Aplicar `font-variant-numeric: tabular-nums` em BPM, compasso, duração, posição no setlist (`3/12`) e tamanho de fonte (`110%`).
- Nunca usar `font-size` abaixo de `12px` em texto legível (piso de `12px` em chips, metadados e labels).
- Manter títulos e botões em sentence case (`Nova música`, `Tela limpa`, `Notas de palco`).

## 4. Formas, Cantos e Espaçamento

Substituir todos os cantos de `4px` pela escala de arredondamento GM3:

| Elemento | Raio (`border-radius`) | Observação |
|---|---|---|
| Botões (Filled, Tonal, Outlined, Text) | `22px` (pílula) -> `10px` (press) / `12px` (selecionado) | Raio numérico permite morph fluido; altura `40px` padrão (`36px` compacto, `44px` nos Slides) |
| Indicador ativo do Navigation Rail / Bar | `16px` (compacto) / `22px` (expandido) -> `10px–12px` (press) | Expande do centro via `scaleX` sem distorcer ícone ou texto |
| Controles conectados (`Cifra / Só letra / Acordes`, `Cards / Lista`) | Cantos externos `20px`, junções internas `6px`, selecionado `20px` (pílula) | Padrão M3 Expressive Connected Button Group (`gap: 2px`, hover interno `10px`, press `8px`) |
| Grupos de botões padrão (`Tom - / 0 / +`, `A- / A+`, `‹ 7/12 ›`) | Pílulas `22px` acopladas com `gap: 4px` | Ao pressionar um botão, o ativo comprime/expande levemente e os vizinhos recuam `2px` via GPU |
| Chips e filtros | `8px` ou `22px` | `8px` para Filter Chips; `22px` para status badges (`Tom G`, `Capo 2`) |
| FAB / Extended FAB (`+ Nova música`) | `16px` (repouso) -> `20px` (hover) -> `28px` (press / ativo) | Altura `56px`, fundo `#D3E3FD`, conteúdo `#0B57D0`, morph para pílula completa ao clicar |
| Cards de música e setlist | `20px` -> `22px` (hover) -> `26px` (press) | Sem borda `1px` em repouso; contraste dado pelo fundo `#FFFFFF` sobre `#F0F4F9` |
| Folha da cifra / painéis internos | `24px` | Concentricidade: elementos internos respeitam `R_interno = max(8px, R_externo - padding)` |
| Dialogs, Bottom Sheets e Drawers | `28px` | `28px` em todos os cantos (dialogs) ou nos cantos superiores/laterais (sheets) |
| Campos de entrada (`studio-input`) | `12px` (form) / `9999px` (busca) | Sem borda na barra de busca (`#FFFFFF` sobre `#F0F4F9`); `1px` `--outline` em formulários |

Grid e respiro:
- Base de espaçamento múltipla de `4px` (`8px`, `12px`, `16px`, `20px`, `24px`).
- Padding interno de cards: `16px` a `20px`. Gap entre cards no grid: `12px` a `16px`.
- Sem linhas divisórias entre cards; usar espaço do canvas `#F0F4F9`.

## 5. Arquitetura de Navegação (`AppShell`)

A top bar fixa estilo Cloud Console sai de cena. O shell se adapta em dois breakpoints:

### Desktop e Tablet (`>= 768px`): Navigation Rail
- Coluna esquerda fixa sobre `#F0F4F9` (sem borda divisória rígida; se necessário, apenas respiro de `16px`), largura `88px` (colapsado, igual à referência) ou `220px` (expandido ao clicar no botão de menu).
- Topo do Rail:
  1. Botão de menu (`☰`) `40px × 40px` circular.
  2. FAB `+ Nova música` (`#D3E3FD` / `#0B57D0`, raio `16px`, altura `56px`).
- Meio do Rail (alinhamento vertical central ou superior com folga):
  - `Repertório` (`/`)
  - `Setlists` (`/?tab=setlists`)
  - Estado ativo: pílula `#C2E7FF` com ícone preenchido e texto `#00639B`.
  - Estado inativo: ícone contornado e texto `#444746`.
- Rodapé do Rail:
  - Botão de preferências do aparelho (tema Claro/Escuro/Auto, tamanho de letra, modo de leitura e nome no Ao Vivo).

### Mobile (`< 768px`): Navigation Bar + FAB flutuante
- Barra inferior fixa sobre `#F0F4F9` (altura `64px` + `env(safe-area-inset-bottom)`), com os 2 destinos principais (`Repertório`, `Setlists`) usando a mesma pílula ativa `#C2E7FF` / `#00639B`.
- FAB `+ Nova música` posicionado no canto inferior direito acima da barra (`bottom: 80px`, `right: 16px`).

### Modos imersivos (ocultam Rail e Navigation Bar)
- **Tela limpa (`CleanStageView`, via `focusMode` ou `/song/[id]?show=1`)** e **Slides (`/slides`)**: ocultam completamente o Rail/Bottom Bar para maximizar a folha de cifra, mantendo apenas controles essenciais de palco.

## 6. Padrões por Tela

### Home: Repertório (`app/page.tsx`, `SongCard.tsx`)
- **Topo do conteúdo** (sobre `#F0F4F9`, sem faixa branca presa ao topo):
  - Título da seção em `Google Sans Flex` (`Repertório`) + contador sutil (`24 músicas`).
  - Barra de busca em pílula (`#FFFFFF`, altura `48px`, atalho `/` ou `Ctrl+K`) + controles de filtro (Tom, Ordenação) e toggle `Cards | Lista`.
  - Ações secundárias (`Importar .cho`, `Exportar tudo`) em botão tonal ou menu overflow, sem competir com o FAB.
- **Modo Cards (padrão)**:
  - Grid responsivo em tela cheia (sem teto estreito de `max-w-*`): `1` coluna no mobile, `2` colunas no tablet/desktop médio, `3` colunas em telas largas (`>= 1280px`) e `4` colunas em monitores amplos (`>= 1536px`).
  - Cada card (`#FFFFFF`, raio `20px`, padding `18px 20px`) segue a leitura rápida dos cards de cidades da referência:
    - Esquerda: título da música (`20px` Bold `700` `#1F1F1F`) e artista (`13px` `#444746`).
    - Direita: **Tom** em destaque com `Google Sans Flex` (`ROND 100`, `primary-container` para tons maiores e `--minor-container` ardósia calmo para tons menores; no máximo 1 card em destaque por tela usa a forma geométrica GM3 Cookie de 8 pontas em `Gm3FocalBadge`) e chip sutil de `BPM` / `Capo`.
    - Estado hover: transição suave para `#E9EEF6` (`surface-container-high`), sem lift exagerado nem sombra pesada.
- **Modo Lista (toggle para repertórios grandes)**:
  - Lista segmentada GM3 Expressive em largura total: itens `#FFFFFF` empilhados com `gap: 2px`; título da música em `20px` Bold `700`; primeiro item com raio `20px 20px 6px 6px`, itens do meio `6px`, último `6px 6px 20px 20px`.

### Setlists (`app/page.tsx?tab=setlists`, `app/setlists/[id]`)
- Cards em `#FFFFFF` (setlists ativos/próximos) ou `#DDE3EA` (arquivados/rascunhos) com nome, contagem de músicas, duração estimada em `Google Sans Flex` (`ROND 100`, `tabular-nums`) e atalhos diretos para `Slides` e `Tela limpa`. Apenas o primeiro setlist ativo recebe ponto `--accent` e contador focal em `Gm3FocalBadge`; os demais mantêm pílulas neutras (`--surface-high`) para evitar excesso de cores.
- Na tela interna do setlist, a ordem das músicas usa a lista segmentada GM3 Expressive com número da faixa em `Google Sans Flex` arredondado (`01`, `02`, `03`).

### Página da Música (`app/song/[id]`)
- **Barra superior fixa (`SongHeader`, `56px` constantes)**: integrada ao canvas `#F0F4F9` (ganha fundo `--surface/95` e borda sutil ao rolar, sem jamais alterar altura nem encolher o título), com `Voltar`, contador/stepper de setlist (`md+`), título legível, chip de tom discreto ao rolar e no máximo 4 a 5 controles à direita (`Rolar`, `Tela limpa` em `lg+`, `Slides`, `Ajustes` e `Mais`).
- **Faixa rolável de contexto (`SongHeroStrip`, dentro do `ChordSheet`)**: artista, gatilho de metadados (`Capo`, `BPM · Compasso · Duração`), controles diretos em 1 toque de **Tonalidade** (`-` + único `Gm3FocalBadge` + `+` + `Salvar tom` ao transpor) e **Fonte** (`A- 100% A+`), e `SectionNav` com rótulos padronizados em PT-BR (`Verso`, `Refrão`, `Pré-refrão`, `Ponte`, `Intro`, `Solo`, `Outro`, `Instrumental`). Rola 1:1 com a letra sem saltos no scroll-back.
- **Popover unificado `Ajustes` (`SongAdjustmentsPopover`)**: traz **Tonalidade e fonte** sempre no topo (inclusive no modo `Só letra`, sem botão de guia de áudio) seguidos por `Cifra | Só letra | Acordes`, tema, `Capo`, metrônomo headless (`useMetronomeEngine` + `Tap` + `Pulso`), `1·2·3·4`, `Diagramas`, `Calibrar`, `2 colunas`, Spotify e `Ao vivo`. Quando auto-scroll está ativo, uma pílula flutuante no rodapé controla velocidade sem alterar o cabeçalho.
- **Modo Edição (`SongToolbar` dedicado)**: acionado em `Mais -> Editar letra e acordes` (ou no rodapé de `Ajustes`), exibe barra fixa com `Texto | Acordes`, `Desfazer`, `Refazer`, `Cancelar` e `Salvar e sair`, mantendo `SectionNav` ativo para saltos rápidos.
- **Folha da cifra (`ChordSheet`)**: card amplo em `#FFFFFF` (no escuro `#1E1F20`), raio `24px`, margens confortáveis (`24px–32px`), acordes (`ChordBadge`) em `Google Sans Mono` Bold `#0B57D0` (no escuro `#A8C7FA`) com fundo `#D3E3FD` suave ao toque/hover. Apenas blocos de **Refrão (`chorus`)** recebem elevação tonal suave (`--chorus-tint` + pílula `primary-container`); as demais seções permanecem em `--surface` neutro com pílula `--surface-high` e ponto semântico discreto.

### Tela Limpa, Slides e Contagem (`CleanStageView`, `SlideshowView`, `CountInOverlay`, `Metronome`)
- **Tela limpa (`CleanStageView`, unificando o antigo Modo Show)**: funciona para música avulsa e setlist completo (com deslize horizontal entre músicas, drawer de setlist e `Ao vivo`). Mantém barra superior fixa de `56px` (setlist, título, chip de tom clicável, troca em 1 toque para `Slides` e `Sair`) e dock flutuante inferior com `< >`, `Rolar`, `Cifra | Letra | Acordes`, controles diretos de tonalidade (`- Tom +`) e fonte (`A- A+`) em `md+`, e `Ajustes` abrindo para cima com tonalidade e fonte sempre no topo, metrônomo, `1·2·3·4`, tema e `Editar`.
- **Modo Slides (`/slides`, iPad e pedal Bluetooth)**: ocupa toda a área útil da tela em largura e altura (`100dvh`), pagina automaticamente a música (ou o setlist inteiro de ponta a ponta) sem rolagem vertical, equilibra a última página de 2 colunas e aplica ajuste automático de tipografia (`Auto` com opção manual `A- / A+`) adaptando-se entre 1 coluna no vertical e 2 colunas no horizontal (`>= 900px`). A barra superior expõe tonalidade (`- Tom +`) e fonte (`Auto` + `A- / A+`) diretamente em `lg+` (com chip de tom clicável em telas menores) junto de `Cifra | Letra | Acordes`, `Anotar` e `Ajustes` (contendo fonte/Auto, tonalidade/Capo em qualquer modo, 2 colunas, tema e troca para `Tela limpa`). Inclui **anotações de slide GM3** (caneta à mão livre com curva suave, marcador translúcido atrás do texto, notas de texto tonais com formas geométricas independentes de cor e borracha com desfazer/refazer) ancoradas às linhas/seções (sobrevivendo a rotação, zoom e recarregamento via armazenamento local + Firestore) e suporte instantâneo a Apple Pencil. Mantém alvos mínimos de `44px`, barra flutuante sem reflow ao anotar, `blurOnPointer` para pedais Bluetooth (`PageDown`/`PageUp`, setas, `Espaço`/`Shift+Espaço`), aviso discreto ao cruzar de música e `useWakeLock` ativo.
- Barra superior e rodapé de navegação (`‹ Anterior` / `Próxima ›`) em `#F0F4F9` (escuro `#131314`) com botões em pílula de alvo mínimo `44px`.
- **`CountInOverlay`**: modal central raio `28px` em `#FFFFFF` (escuro `#1E1F20`) com o número da batida em `Google Sans Flex` `96px` (`ROND 100`) na cor `#0B57D0` no tempo 1, acompanhado pela sequência de pontos circulares (`#0B57D0` atual, `#6DD58C` passados, `#C4C7C5` restantes).

## 7. Estados, Movimento e Acessibilidade

- **State layers GM3**: hover `8%`, focus `10%` + anel `2px solid` `--secondary` (`#00639B` / `#7FCFFF`) com `outline-offset: 2px`, pressed `10%`, disabled `38%` de opacidade no conteúdo.
- **Tokens de movimento GM3 Expressive (Spatial vs. Effects via CSS `linear()` com fallback `cubic-bezier` em `@supports`)**:
  - **Spatial Springs** (posição, escala, rotação e `border-radius`): `expressive-fast` (`damping=0.6`, `stiffness=800`, `350ms` para FAB, switches, botões, Connected Button Groups e chevrons), `expressive-default` (`damping=0.8`, `stiffness=380`, `480ms` para popovers ancorados, cards, indicador do rail e troca `Cards/Lista`), `standard-fast` (`damping=0.9`, `stiffness=1400`, `200ms`) e `standard-default` (`damping=0.9`, `stiffness=700`, `300ms` para drawers, dialogs, sheets, largura do rail e controles críticos de palco).
  - **Effects** (`damping=1.0`, zero overshoot, exclusivos para cor, opacidade, borda e sombra): `fast` (`150ms cubic-bezier(0.31, 0.94, 0.34, 1)`), `default` (`200ms cubic-bezier(0.34, 0.80, 0.34, 1)`), `slow` (`300ms cubic-bezier(0.34, 0.88, 0.34, 1)`).
  - **Escopo de palco (`data-motion-scheme="standard"`)**: `CleanStageView`, `SlideshowView`, `Metronome` e `CountInOverlay` usam automaticamente o esquema Standard (zero oscilação) para toques rápidos durante o ensaio/show.
- **Shape Morphing GM3 Expressive**:
  - FAB `+ Nova música` (`.gm3-fab`): `16px` repouso -> `20px` hover (+ rotação `90deg` no `+`) -> `28px` pílula completa ao clicar ou na rota `/add-song`.
  - Botões pílula (`.pill-btn`) e ícones (`.gm3-icon-btn`): `22px` -> `10px–12px` squircle ao clicar, selecionar ou abrir popover (`aria-expanded="true"` ganha tint tonal).
  - Connected Button Groups (`.gm3-connected-group` + `ConnectedGroup`): `gap: 2px`, extremos `20px`, cantos internos `6px`, indicador deslizante GPU via `clip-path: inset(... round 20px)` correndo acima dos fundos dos segmentos e abaixo dos rótulos no spring `expressive-fast`.
  - Cards (`.gm3-card-interactive`) e listas segmentadas (`.gm3-list-row`): arredondamento responsivo ao toque sem esmagar o card ao clicar nos botões ou links internos, entrada em cascata limitada aos 8 primeiros itens (`.gm3-stagger-item`, `fill-mode: backwards` para preservar o `:active` e `position: fixed`).
  - **Transições de rota e Container Transform (`document.startViewTransition`)**: ao selecionar uma música na Lista, nos Cards ou no Setlist (área inteira clicável com arredondamento suave no hover e toque), o próprio fundo do card/linha (`song-surface-hero`) expande continuamente em Container Transform GM3 (`420ms` entrada / `380ms` volta, `cubic-bezier(0.2, 0, 0, 1)`) até a folha da música sem distorcer texto nem destacar título/tom isolados, enquanto a lista recua suavemente atrás e o rail lateral (`app-chrome-rail`) colapsa/expande com corte limpo (`overflow: clip`); troca entre músicas do setlist mantém Shared-Axis horizontal (`next` / `prev`).
  - **Cabeçalho fixo sem saltos e motor 60fps (`SongHeader` + `SongHeroStrip` + `ChordSheet`)**: a barra superior permanece com altura constante de `56px` (transicionando apenas elevação e borda ao rolar) enquanto metadados e `SectionNav` (`rail.scrollTo({ left })` somente horizontal) rolam 1:1 com a cifra; auto-scroll usa progresso GPU `scaleX` sem re-renders por frame, painéis de `Diagramas` recolhem bidirecionalmente e o `ChordPanel` troca acordes in-place sem refazer a abertura da gaveta.
  - Respeitar `@media (prefers-reduced-motion: reduce)` zerando todas as durações espaciais para `0ms`, desativando animações de `::view-transition-*`, convertendo entradas em fade puro de `120ms` e mantendo posições funcionais (switch e chevrons abertos) intactas.
- **Alvos de toque**: mínimo `40px × 40px` em telas normais e `44px × 44px` nos Slides (para uso rápido com instrumento na mão).

## 8. O que não fazer

- Não usar cantos retos (`4px`) em botões, cards ou menus.
- Não empilhar bordas `1px` cinzas + `box-shadow` em cards que já se destacam por cor de superfície (`#FFFFFF` sobre `#F0F4F9`).
- Não usar `border-left: 4px solid` como faixa lateral de alerta ou status (substituir por container tonal completo ou badge pílula).
- Não usar `text-transform: uppercase` com `letter-spacing` largo (`.eyebrow`) em títulos de seção ou labels.
- Não colocar mais de um botão `#0B57D0` preenchido competindo na mesma barra ou card.
- Não perder o contraste do Modo Escuro usando cores fixas de Light Mode (`#0B57D0` puro sobre `#1E1F20` falha em contraste; sempre usar o par via variável CSS).

## 9. Plano sugerido de migração no código

1. **Fundação (`app/layout.tsx`, `app/globals.css`)**: adicionar `Google Sans Flex`, migrar variáveis `:root` e `[data-theme="dark"]` para a escada tonal GM3, atualizar `.pill-btn`, `.studio-chip` e `.studio-input` para pílulas/cantos GM3 e remover `.eyebrow` uppercase.
2. **Shell (`components/layout/AppShell.tsx`)**: trocar a top bar estilo Console pelo Navigation Rail (`>= 768px`) com FAB `+ Nova música` e Navigation Bar inferior (`< 768px`).
3. **Home e Setlists (`app/page.tsx`, `components/song-list/SongCard.tsx`, `app/setlists/[id]`)**: implementar o grid de cards tonais (`20px`) com toggle para lista segmentada GM3 e busca em pílula.
4. **Música e Palco (`SongHeader`, `SongHeroStrip`, `SongAdjustmentsPopover`, `SongToolbar`, `ChordSheet`, `CleanStageView`, `SlideshowView`, `CountInOverlay`, `Metronome`)**: aplicar folha `#FFFFFF` (`24px`), barra fixa `56px`, popover unificado de ajustes, controles segmentados em pílula e números `Google Sans Flex` (`ROND 100`).
