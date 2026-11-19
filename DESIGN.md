# Jamshelf Design System (`DESIGN.md`)

Direção visual do Jamshelf baseada em **Google Material 3 (GM3)** com elementos de **GM3 Expressive** (tema Google Blue baseline). Substitui a linguagem anterior estilo Google Cloud Console (bordas `1px`, cantos de `4px`, top bar fixa e tabelas densas) por superfícies tonais sem sombras, formas arredondadas generosas, Navigation Rail e tipografia expressiva com `Google Sans Flex`.

## 1. Princípios

1. **Hierarquia por tom de superfície, não por bordas ou sombras**: separar canvas, cards e áreas secundárias usando a escada tonal GM3 (`#F0F4F9` -> `#FFFFFF` -> `#DDE3EA` no modo claro; `#131314` -> `#1E1F20` -> `#282A2C` -> `#333537` no escuro). Sombras ficam restritas a elementos flutuantes (menus, modais e drawers sobrepostos).
2. **Legibilidade de estante e palco**: o Jamshelf é usado em tablets no pedestal e celulares em ensaio ou show. Controles principais têm altura mínima de `40px` (`44px` no Modo Show), contraste >= 4.5:1 e tipografia sem serifa limpa.
3. **Semântica musical fixa**: cores de destaque carregam significado consistente em toda a aplicação (azul para acordes e ação principal, verde para ritmo/sincronização, âmbar para notas de palco e estrelas, vermelho para Ao Vivo e ações destrutivas).
4. **Um único ponto focal por tela**: no máximo um FAB e um botão preenchido (`primary`) visíveis por contexto. Ações secundárias usam botões tonais (`secondary-container`), outline ou texto.
5. **Sentence case sempre**: proibir `ALL CAPS` em rótulos, cabeçalhos de seção e badges (remove a classe `.eyebrow` em caixa alta). Exceção: siglas musicais (`BPM`, `C7M`, `Am`).

## 2. Cores e Tokens (Light e Dark)

Paleta derivada no espaço HCT a partir do azul GM3 `#0B57D0`. Todo par `container` / `on-container` mantém diferença tonal >= 50.

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
| `surface-container` | `--bg` | `#F0F4F9` | `#131314` | Canvas principal da aplicação e fundo do Navigation Rail |
| `surface-container-lowest` | `--surface` | `#FFFFFF` | `#1E1F20` | Cards principais (músicas, setlists, folha da cifra), barra de busca |
| `surface-container-high` | `--surface-high` (novo) | `#E9EEF6` | `#282A2C` | Dialogs, popovers, barras de ferramentas agrupadas |
| `surface-container-highest` | `--surface2` | `#DDE3EA` | `#333537` | Cards secundários/inativos, chips neutros, trilha de switch desligado |
| `on-surface` | `--ink` | `#1F1F1F` | `#E3E3E3` | Títulos, letra da música, horários e textos principais |
| `on-surface-variant` | `--muted` | `#444746` | `#C4C7C5` | Artista, rótulos do Rail inativos, metadados (`BPM`, compasso, duração) |
| `outline` | `--line` | `#747775` | `#8E918F` | Bordas de campos de texto (`outlined`) e botões outlined |
| `outline-variant` | `--line-subtle` | `#C4C7C5` | `#444746` | Divisores sutis, pontos inativos de metrônomo/contagem, estrelas vazias |

### Tokens musicais e semânticos

| Papel | Token (`globals.css`) | Light (fill / texto) | Dark (fill / texto) | Uso no Jamshelf |
|---|---|---|---|---|
| Ritmo e positivo (Tertiary) | `--tune` / `--tune-dim` | `#146C2E` / `#C4EED0` (dot `#6DD58C`) | `#6DD58C` / `#0F5223` | Auto-scroll ativo, capo, música calibrada, `Seguindo líder`, pulso passado |
| Alerta e destaque musical | `--warn` / `--warn-dim` | `#FFB124` (ícone) / `#FEF0C7` (fundo) / `#7A4F01` (texto) | `#FDD663` / `#3D2E05` | Estrelas de avaliação, notas/deixas de palco (`StageNotesBar`) |
| Ao Vivo e erro (Error) | `--rec` / `--rec-dim` | `#B3261E` / `#F9DEDC` (`on`: `#8C1D18`) | `#F2B8B5` / `#601410` | Botão `Show`, status `Liderando` (Ao Vivo), coração favorita, exclusão |
| Teclas de piano | `--key-white` / `--key-black` | `#FFFFFF` / `#1F1F1F` | `#E3E3E3` / `#131314` | `PianoChordDiagram` |

> Nota de contraste: `#FFB124` e `#6DD58C` funcionam bem em ícones, pontos e marcadores gráficos. Para texto sobre fundo claro, usar `#7A4F01` (âmbar) e `#146C2E` (verde) para garantir WCAG AA (>= 4.5:1).

## 3. Tipografia

Carregar três famílias via Google Fonts em `app/layout.tsx`:

```html
https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght,ROND@6..144,400..700,0..100&family=Google+Sans+Text:wght@400;500;700&family=Google+Sans+Mono:wght@400;500;600;700&display=swap
```

| Papel | Família e eixos | Tamanho / altura | Uso |
|---|---|---|---|
| Expressive Hero | `Google Sans Flex` (`wght 500`, `ROND 100`) | `56px–96px / 1.0` | Contagem `1·2·3·4` (`CountInOverlay`), BPM ou tom em destaque no Modo Show |
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
- Manter títulos e botões em sentence case (`Nova música`, `Modo show`, `Notas de palco`).

## 4. Formas, Cantos e Espaçamento

Substituir todos os cantos de `4px` pela escala de arredondamento GM3:

| Elemento | Raio (`border-radius`) | Observação |
|---|---|---|
| Botões (Filled, Tonal, Outlined, Text) | `9999px` (pílula) | Altura `40px` padrão (`36px` compacto em toolbars densas) |
| Indicador ativo do Navigation Rail / Bar | `9999px` (pílula) | `56px × 32px` no Rail colapsado ou largura fluida no expandido |
| Chips e filtros | `8px` ou `9999px` | `8px` para Filter Chips; `9999px` para status badges (`Tom G`, `Capo 2`) |
| FAB / Extended FAB (`+ Nova música`) | `16px` | Altura `56px`, fundo `#D3E3FD`, conteúdo `#0B57D0` |
| Cards de música e setlist | `20px` | Sem borda `1px` em repouso; contraste dado pelo fundo `#FFFFFF` sobre `#F0F4F9` |
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
  - `Favoritas` (`/?tab=favorites`)
  - `Setlists` (`/?tab=setlists`)
  - Estado ativo: pílula `#C2E7FF` com ícone preenchido e texto `#00639B`.
  - Estado inativo: ícone contornado e texto `#444746`.
- Rodapé do Rail:
  - Botão de preferências do aparelho (tema Claro/Escuro/Auto, tamanho de letra, modo de leitura e nome no Ao Vivo).

### Mobile (`< 768px`): Navigation Bar + FAB flutuante
- Barra inferior fixa sobre `#F0F4F9` (altura `64px` + `env(safe-area-inset-bottom)`), com os 3 destinos principais (`Repertório`, `Favoritas`, `Setlists`) usando a mesma pílula ativa `#C2E7FF` / `#00639B`.
- FAB `+ Nova música` posicionado no canto inferior direito acima da barra (`bottom: 80px`, `right: 16px`).

### Modos imersivos (ocultam Rail e Navigation Bar)
- **Tela limpa (`focusMode`)** e **Modo Show (`/song/[id]?show=1`)**: ocultam completamente o Rail/Bottom Bar para maximizar a folha de cifra, mantendo apenas controles essenciais de palco.

## 6. Padrões por Tela

### Home: Repertório e Favoritas (`app/page.tsx`, `SongCard.tsx`)
- **Topo do conteúdo** (sobre `#F0F4F9`, sem faixa branca presa ao topo):
  - Título da seção em `Google Sans Flex` (`Repertório`) + contador sutil (`24 músicas`).
  - Barra de busca em pílula (`#FFFFFF`, altura `48px`, atalho `/` ou `Ctrl+K`) + controles de filtro (Tom, Ordenação) e toggle `Cards | Lista`.
  - Ações secundárias (`Importar .cho`, `Exportar tudo`) em botão tonal ou menu overflow, sem competir com o FAB.
- **Modo Cards (padrão)**:
  - Grid responsivo em tela cheia (sem teto estreito de `max-w-*`): `1` coluna no mobile, `2` colunas no tablet/desktop médio, `3` colunas em telas largas (`>= 1280px`) e `4` colunas em monitores amplos (`>= 1536px`).
  - Cada card (`#FFFFFF`, raio `20px`, padding `18px 20px`) segue a leitura rápida dos cards de cidades da referência:
    - Esquerda: título da música (`20px` Bold `700` `#1F1F1F`), artista (`13px` `#444746`) e avaliação por estrelas (`#FFB124`) + coração favorita.
    - Direita: **Tom** em destaque com `Google Sans Flex` (`ROND 100`, `24px`, `#0B57D0` ou `#1F1F1F`) e chip sutil de `BPM` / `Capo`.
    - Estado hover: transição suave para `#E9EEF6` (`surface-container-high`), sem lift exagerado nem sombra pesada.
- **Modo Lista (toggle para repertórios grandes)**:
  - Lista segmentada GM3 Expressive em largura total: itens `#FFFFFF` empilhados com `gap: 2px`; título da música em `20px` Bold `700`; primeiro item com raio `20px 20px 6px 6px`, itens do meio `6px`, último `6px 6px 20px 20px`.

### Setlists (`app/page.tsx?tab=setlists`, `app/setlists/[id]`)
- Cards em `#FFFFFF` (setlists ativos/próximos) ou `#DDE3EA` (arquivados/rascunhos) com nome, contagem de músicas, duração estimada em `Google Sans Flex` (`ROND 100`, `tabular-nums`) e botão direto `▶ Show` (pílula `#B3261E` / `#FFFFFF` ou `#F9DEDC` / `#8C1D18`).
- Na tela interna do setlist, a ordem das músicas usa a lista segmentada GM3 Expressive com número da faixa em `Google Sans Flex` arredondado (`01`, `02`, `03`).

### Página da Música (`app/song/[id]`)
- **Cabeçalho (`SongHeader`)**: integrado ao canvas `#F0F4F9` (sem borda dura), título editável grande em `Google Sans Flex`, chips tonais de `Tom`, `Capo` e `BPM · Compasso`, e controle segmentado em pílula conectado para `Cifra | Só letra | Acordes` (segmento ativo em `#C2E7FF` / `#004A77`).
- **Barra de controles (`SongToolbar`)**: agrupada em container tonal `#E9EEF6` (raio `16px`) com transposição (`- / 0 / +`, `♯/♭`), tamanho da letra (`A- / A+`), auto-scroll (fica verde `#C4EED0` / `#146C2E` quando ativo), metrônomo com bolinhas (`#0B57D0` / `#6DD58C` / `#C4C7C5`), botão `1·2·3·4` e `Diagramas`.
- **Folha da cifra (`ChordSheet`)**: card amplo em `#FFFFFF` (no escuro `#1E1F20`), raio `24px`, margens confortáveis (`24px–32px`), acordes (`ChordBadge`) em `Google Sans Mono` Bold `#0B57D0` (no escuro `#A8C7FA`) com fundo `#D3E3FD` suave ao toque/hover.

### Modo Show e Contagem (`ShowModeView`, `CountInOverlay`, `Metronome`)
- **Modo Show**: pode seguir o tema do aparelho ou oferecer atalho de 1 toque para modo escuro de palco (`#131314` canvas + `#1E1F20` folha).
- Barra superior e rodapé de navegação (`‹ Anterior` / `Próxima ›`) em `#F0F4F9` (escuro `#131314`) com botões em pílula de alvo mínimo `44px`.
- **`CountInOverlay`**: modal central raio `28px` em `#FFFFFF` (escuro `#1E1F20`) com o número da batida em `Google Sans Flex` `96px` (`ROND 100`) na cor `#0B57D0` no tempo 1, acompanhado pela sequência de pontos circulares (`#0B57D0` atual, `#6DD58C` passados, `#C4C7C5` restantes).

## 7. Estados, Movimento e Acessibilidade

- **State layers GM3**: hover `8%`, focus `10%` + anel `2px solid` `--secondary` (`#00639B` / `#7FCFFF`) com `outline-offset: 2px`, pressed `10%`, disabled `38%` de opacidade no conteúdo.
- **Transições**:
  - Cores e opacidade: `150ms cubic-bezier(0.2, 0, 0, 1)` (sem overshoot).
  - Movimento espacial (abertura de drawer, morph de pílula, expansão do Rail): `260ms cubic-bezier(0.2, 1.1, 0.3, 1)`.
  - Respeitar `@media (prefers-reduced-motion: reduce)`.
- **Alvos de toque**: mínimo `40px × 40px` em telas normais e `44px × 44px` no Modo Show (para uso rápido com instrumento na mão).

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
4. **Música e Palco (`SongHeader`, `SongToolbar`, `ChordSheet`, `ShowModeView`, `CountInOverlay`, `Metronome`)**: aplicar folha `#FFFFFF` (`24px`), toolbar tonal `#E9EEF6`, controles segmentados em pílula e números `Google Sans Flex` (`ROND 100`).
