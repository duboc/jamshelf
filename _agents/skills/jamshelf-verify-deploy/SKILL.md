---
name: jamshelf-verify-deploy
description: >-
  Use when verifying UI changes, running multi-device Playwright hillclimbs,
  running Impeccable audits, deploying Jamshelf to Cloud Run via GitHub Actions,
  or running read-only post-deploy production checks.
---

# Jamshelf Verification and Cloud Run Deploy Workflow

Use this workflow before pushing UI changes to `main` and after deploying to production.

## 1. Typecheck, Production Build, and Impeccable Audit

Run TypeScript check, Next.js build, and Impeccable (pass one directory per invocation):

```bash
npx tsc --noEmit && npm run build
IMPECCABLE=/usr/local/google/home/duboc/.gemini/config/plugins/impeccable/bin/impeccable
"$IMPECCABLE" detect components/ && "$IMPECCABLE" detect app/
"$IMPECCABLE" audit components/ && "$IMPECCABLE" audit app/
```

Target: exit 0 on build, `0` violations across 62 rules, and `20.0 / 20` on both `components/` and `app/`.

## 2. Local Multi-Device Playwright Verification

1. Start the built app locally on a dedicated port (never point `GOOGLE_CLOUD_PROJECT` at `riojucu` for automated tests):
   ```bash
   PORT=3212 npx next start -p 3212 -H 127.0.0.1
   ```
2. In Playwright scripts, intercept `**/api/**` with an in-memory snapshot (never hitting real Firestore/GCS) and verify across `390x844` (iPhone), `768x1024` (iPad portrait), `1024x768` (iPad landscape), and `1280x860` (Desktop):
   - Constant `56px` `SongHeader` height and exact 1:1 scroll-back (`0px` shift on `mainTop`, `secBackDelta` matches upward scroll).
   - Zero horizontal overflow (`scrollWidth === clientWidth`) and zero viewport clipping on `Ajustes` / `Mais` popovers.
   - Unified `Tela limpa` dock (`Cifra | Letra | Acordes`, direct Tonalidade + Fonte on `md+`, `Ajustes`) and direct transition to `Slides`.
   - `Slides` direct Tonalidade + Fonte on `lg+`, Auto-Fit zero clipping, live transpose via bar or `Ajustes`, and zero `Ouvir guia do tom` button in any view.
   - Visually inspect captured screenshots before approving the round.
3. Stop the local server once verification completes.

## 3. Commit, Push, and Watch GitHub Actions Deploy

1. Inspect `git status -s` to ensure only intended files are staged.
2. Commit and push to `main` (`.github/workflows/deploy.yml` builds and deploys automatically).
3. Watch the exact workflow run using the full 40-char commit SHA:
   ```bash
   SHA=$(git rev-parse HEAD)
   RUN_ID=$(gh run list --branch main --limit 5 --json databaseId,headSha \
     --jq ".[] | select(.headSha == \"$SHA\") | .databaseId" | head -n 1)
   gh run watch "$RUN_ID" --exit-status
   /usr/local/google/home/duboc/google-cloud-sdk/bin/gcloud run services describe jamshelf \
     --region us-central1 --project riojucu \
     --format='value(status.latestReadyRevisionName,status.url)'
   ```

## 4. Strict Read-Only Live Production Verification

Run Playwright against `https://jamshelf-a4er43fhfq-uc.a.run.app` **only** with a network-level write guard installed before navigating:

```javascript
await context.route('**/api/**', async (route) => {
  const m = route.request().method();
  if (m !== 'GET' && m !== 'HEAD') {
    return route.abort('blockedbyclient');
  }
  return route.continue();
});
```

Verify across mobile, iPad, and desktop:
- Home, Setlists, and HCT theme persistence (`localStorage` only).
- Song page: `56px` fixed top bar, `0px` scroll-back jump, `1` focal badge, PT-BR section labels, and `Mais -> Editar letra e acordes` -> `Cancelar` (0 writes).
- `Tela limpa` -> `Slides` transition, Bluetooth navigation (`PageDown` / `Shift+Space`), and `Ajustes` live transpose.
- Zero blocked write attempts, console errors, or page errors.
