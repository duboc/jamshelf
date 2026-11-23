# Spotify Web Playback SDK Setup

This guide explains how to create and configure a **Spotify Client ID** and **Client Secret** so Jamshelf can stream full tracks directly in the browser via the **Spotify Web Playback SDK** (with seek, `-10s` / `+10s` jumps, A-B loop rehearsal, and volume controls).

> **Note:** Track matching (`/api/spotify/search`) uses Spotify's Client Credentials flow and works with any Spotify Developer app. Full-track playback via the Web Playback SDK uses OAuth 2.0 Authorization Code flow on top of those same credentials and requires a **Spotify Premium** account. Logged-out or non-Premium users can always switch to the **simple Spotify Embed** fallback in 1 click.

---

## Prerequisites

- A **Spotify Premium** account (Spotify also requires the owner of any app in Development Mode to hold an active Premium subscription).
- Access to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).

---

## Step 1 — Create an App in the Spotify Developer Dashboard

1. Sign in to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Click **Create app**.
3. Fill in the basic details:
   - **App name**: e.g. `Jamshelf`
   - **App description**: e.g. `Chord sheet rehearsal player for Jamshelf`
   - **Website**: optional (can be left blank or set to your app URL)
4. Under **Which API/SDKs are you planning to use?**, check:
   - **Web API**
   - **Web Playback SDK**
5. Accept the Spotify Developer Terms of Service and click **Save**.

---

## Step 2 — Configure Redirect URIs

Spotify enforces strict validation on OAuth Redirect URIs — **literal `localhost` is rejected**. For local development, you must use an explicit IPv4 loopback address (`127.0.0.1`).

In your app's **Settings** → **Redirect URIs**, add the callback URI(s) you will use:

- **Local development** (replace `<PORT>` with `3000` by default, or whatever `-p` port you run Next.js on, e.g. `8085`):
  ```text
  http://127.0.0.1:3000/api/spotify/callback
  ```
  *(Example if running on port `8085`: `http://127.0.0.1:8085/api/spotify/callback`)*
- **Production (Cloud Run / custom domain)**:
  ```text
  https://<your-domain>/api/spotify/callback
  ```

Click **Add** and then **Save** at the bottom of the Settings page.

> **Important:** The Redirect URI in the Dashboard must match the URL Jamshelf sends to Spotify **character-for-character** (scheme, host `127.0.0.1`, port, and `/api/spotify/callback` path). If you visit the local app at `http://localhost:<PORT>`, `/api/spotify/auth` automatically bounces your request to `http://127.0.0.1:<PORT>` before setting the OAuth cookie so cookies and callback stay on the same host.

---

## Step 3 — Copy Your Client ID and Client Secret

1. Open your app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Go to **Settings** → **Basic Information**.
3. Copy your **Client ID**.
4. Click **View client secret** and copy your **Client Secret**.

> **Security warning:** Never commit `.env` or expose `SPOTIFY_CLIENT_SECRET` in client-side code or public docs. Only the Next.js server routes read `SPOTIFY_CLIENT_SECRET`.

---

## Step 4 — Development Mode User Allowlist

While your app is in Spotify's **Development Mode** (the default for personal/band apps):

1. Go to **Settings** → **User Management** in the Spotify Developer Dashboard.
2. Add the **Full Name** and **Email address** of each Spotify account allowed to authenticate (up to **5 authorized users** in Development Mode).
3. Only accounts listed in **User Management** (plus the app owner) can sign in via **Conectar Spotify**.

---

## Step 5 — Configure Environment Variables

### Local Development (`.env`)

Copy `.env.example` to `.env` if you haven't already, and set:

```dotenv
SPOTIFY_CLIENT_ID=<your-client-id>
SPOTIFY_CLIENT_SECRET=<your-client-secret>

# Optional: force an explicit callback URL instead of deriving it from the request host.
# Remember to use 127.0.0.1 (never localhost) for local dev.
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/spotify/callback
```

If you omit `SPOTIFY_REDIRECT_URI`, Jamshelf automatically derives `${protocol}//${host}/api/spotify/callback` from the incoming request (rewriting `localhost` to `127.0.0.1`).

### Production (Cloud Run)

Set the variables on your Cloud Run service (never bake them into git):

```bash
gcloud run services update jamshelf \
  --region us-central1 \
  --update-env-vars "SPOTIFY_CLIENT_ID=<your-client-id>,SPOTIFY_CLIENT_SECRET=<your-client-secret>,SPOTIFY_REDIRECT_URI=https://<your-cloud-run-url>/api/spotify/callback"
```

---

## Step 6 — Run & Verify Locally

1. Start the dev server (for example on port `3000` or `8085`):
   ```bash
   npm run dev -- -p 3000
   ```
2. Open **`http://127.0.0.1:3000`** in your browser.
3. Open any song, link a Spotify track (via the suggestion banner or `Mais` → **Buscar faixa no Spotify**), and open the player (`Ajustes` → **Ouvir Spotify**).
4. Click **Conectar Spotify**, grant permissions, and you will return directly to the song with the custom Web Playback SDK player open:
   - **Play / Pause** full track
   - **Seek bar** and **`-10s` / `+10s`** jump buttons
   - **Loop A-B** rehearsal markers (`A` → `B` → clear)
   - **Volume / Mute**
   - **Embed** button for 1-click fallback to the standard Spotify iframe

---

## OAuth Scopes & Security Model

Jamshelf implements the **OAuth 2.0 Authorization Code** flow entirely on the server:

- **Requested scopes**:
  - `streaming` — initialize the Web Playback SDK audio device in the browser
  - `user-read-email` & `user-read-private` — required by the Web Playback SDK and profile checks
  - `user-modify-playback-state` & `user-read-playback-state` — start playback on the browser device (`PUT /v1/me/player/play?device_id=...`)
- **Routes**:
  - `GET /api/spotify/auth` — aligns `localhost` → `127.0.0.1`, generates a random CSRF `state` stored in an `HttpOnly; SameSite=Lax` cookie, and redirects to `https://accounts.spotify.com/authorize`.
  - `GET /api/spotify/callback` — validates `state`, exchanges the authorization `code` server-side using `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`, and stores tokens in `HttpOnly; SameSite=Lax` cookies (`jamshelf_sp_at`, `jamshelf_sp_rt`, `jamshelf_sp_exp`, `jamshelf_sp_user`).
  - `GET /api/spotify/token` — returns the active access token to the SDK (`Cache-Control: no-store`) and transparently refreshes it with `refresh_token` when less than 60 seconds remain.
  - `POST /api/spotify/logout` — clears all Spotify session cookies.

---

## Troubleshooting

- **`INVALID_CLIENT: Invalid redirect URI` on Spotify's authorize page**
  - The URI sent in `redirect_uri` is not registered verbatim in the Spotify Developer Dashboard. Verify port (`3000` vs `8085`), `127.0.0.1` (not `localhost`), and exact `/api/spotify/callback` path, then click **Save** in the Dashboard.
- **`403 Forbidden` or `account_error` when pressing Play**
  - Web Playback SDK requires an active **Spotify Premium** subscription on both the logged-in listener account and (for Development Mode apps) the Dashboard app owner. Use the **Abrir embed simples** button for free accounts.
- **User sees an access error when signing in (`Development Mode`)**
  - Add that user's Spotify email in **Dashboard → Settings → User Management**.
- **OAuth fails with `invalid_state` after returning from Spotify**
  - Ensure your browser starts on `http://127.0.0.1:<PORT>` (not `localhost`, or let `/api/spotify/auth` bounce you before login) so cookies set on `127.0.0.1` are present on callback, and verify `SPOTIFY_REDIRECT_URI` matches the host you are accessing.
