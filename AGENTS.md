# Jamshelf Agent Rules

## 1. Arquitetura de menus e orçamento de controles (anti-"ciência de foguete")

- Manter exatamente 3 visões de leitura/palco: **Visão da música**, **Tela limpa** (unificada, nunca recriar um Modo Show separado) e **Slides**.
- Manter apenas 2 abas principais na navegação (`Repertório` e `Setlists`). Não reintroduzir UI de Favoritas (coração) ou Avaliação (estrelas); manter o parser ChordPro tolerante a diretivas antigas.
- Na Visão da música, manter o `SongHeader` fixo com altura constante de `56px` e no máximo 4 a 5 controles imediatos, e manter o `SongHeroStrip` enxuto (artista, metadados, controles diretos de tonalidade `- Tom +` e fonte `A- A+`, e seções, sem breadcrumb e sem lápis).
- Garantir que **Tonalidade** (`- Tom +`) e **Fonte** (`A- A+`) estejam sempre presentes nas 3 visões (inclusive no modo `Só letra` e no topo de `Ajustes`), sem reintroduzir o botão `Ouvir guia do tom`.
- Concentrar ferramentas secundárias de leitura e ensaio (`Cifra | Só letra | Acordes`, tema, Capo, metrônomo, `1·2·3·4`, calibração, diagramas, 2 colunas, Ao vivo) no popover unificado `Ajustes` (`SongAdjustmentsPopover`). Manter `Editar letra e acordes` no topo do menu `Mais`.
- Na barra superior dos Slides, manter controles diretos de tonalidade (`- Tom +`) e fonte (`A- A+`) em `lg+` (iPad horizontal/desktop) junto de `Cifra | Letra | Acordes`, `Anotar` e `Ajustes`, e no topo de `Ajustes` em telas menores.

## 2. Scroll seguro (zero salto no header e no scroll-back)

- Nunca animar colapso de altura (`grid-template-rows: 1fr <-> 0fr`) acima do container `flex-1` de scroll vertical do `ChordSheet`, e nunca aplicar `transform: scale(...)` em títulos flex (gera lacuna vazia antes do badge de tom). Usar barra fixa de altura constante e conteúdo rolável dentro de `ChordSheet` (`headerSlot`).
- Nunca chamar `Element.scrollIntoView()` em itens de barras horizontais (`SectionNav`) montadas dentro de um container de scroll vertical, pois o navegador rola também o ancestral vertical. Usar sempre `rail.scrollTo({ left })`.

## 3. Áudio, iPad, Bluetooth e GM3

- Manter schedulers Web Audio (`useMetronomeEngine`) montados no nível da página, nunca dentro de popovers condicionais, e chamar `ensureMetronomeAudioContext()` sincronamente no clique para liberar áudio no iOS/iPadOS Safari.
- Usar `font-size >= 16px` (`text-base lg:text-sm`) em inputs editáveis no touch para evitar zoom automático do Safari.
- Chamar `blurOnPointer` nos botões da barra e popovers dos Slides para evitar que pedais Bluetooth (`Space`/`Enter`) disparem controles focados.
- Padronizar interface e rótulos de seção em português (PT-BR: `Verso`, `Refrão`, `Pré-refrão`, `Ponte`, `Intro`, `Solo`, `Outro`, `Instrumental`) via `formatSectionLabel`.
- Preservar no máximo 1 badge focal (`[data-gm3-focal="true"]`) por tela e manter `20/20` no Impeccable audit com `0` violações.

## 4. Segurança de produção e deploy

- O deploy de produção roda automaticamente via GitHub Actions (`.github/workflows/deploy.yml`) a cada push em `main` (serviço Cloud Run `jamshelf`, projeto `riojucu`, região `us-central1`). Evitar `gcloud run deploy` manual paralelo após push.
- Nunca executar requisições mutantes (`POST`, `PUT`, `DELETE`, `PATCH`) contra a URL de produção (`https://jamshelf-a4er43fhfq-uc.a.run.app`). Em verificações Playwright em produção, anexar sempre um bloqueador de rota que aborte qualquer método diferente de `GET`/`HEAD` em `**/api/**`.
- Antes de commitar ou fazer deploy, checar `git status` para não misturar nem sobrescrever edições locais alheias no workspace.
