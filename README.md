# Video Wizard

A local-first browser app for turning selected photos and optional music into an MP4 slideshow, plus captioning videos with in-browser transcription and export tools. Motion frames are rendered client-side with Canvas, then encoded locally with `ffmpeg.wasm`; selected media is not uploaded to a server.

## Run

```bash
python3 server.py
```

Open [http://127.0.0.1:8765](http://127.0.0.1:8765).

If port `8765` is busy, the server prints the next available local URL.

The app uses the browser File System Access API for direct output saving when available. In browsers without that API, it falls back to a standard browser download.

## Static Netlify launch

This repo can now be deployed as a static site to Netlify for a stable public launch.

- `netlify.toml` includes an SPA rewrite so routes like `/settings` resolve to `index.html`
- If `/api/app-config` is unavailable, the frontend automatically falls back to a static-launch mode
- In static-launch mode:
  - local presets and local exports still work
  - Supabase auth buttons are disabled
  - Paddle checkout is disabled
  - premium enforcement is temporarily open until the hosted account system is connected

## Local-first accounts and billing

The Settings page now includes:

- Supabase auth hooks for sign-in and account creation
- Paddle checkout hooks for premium billing and tax handling
- Browser-local storage for profile defaults, workspace defaults, and saved caption presets
- Automatic premium gating for 1080p slideshow export, burned-in caption video export, and EDL + PNG export

This project intentionally keeps as much state local as possible:

- Auth sessions are handled by Supabase in the browser
- Workspace defaults and saved presets live in `localStorage`
- The Python server only keeps lightweight billing entitlements for webhook-driven access control in `data/account_store.json`

## Environment variables

Set these before starting `server.py` when you want auth and billing turned on:

```bash
export SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export SUPABASE_ANON_KEY="YOUR_PUBLIC_ANON_KEY"
export PADDLE_CLIENT_TOKEN="test_..."
export PADDLE_ENV="sandbox"
export PADDLE_PRICE_ID="pri_..."
export PADDLE_WEBHOOK_SECRET="pdl_ntfset_..."
```

Optional:

```bash
export PADDLE_SUCCESS_URL="http://127.0.0.1:8765/settings"
export PADDLE_CANCEL_URL="http://127.0.0.1:8765/settings"
export PADDLE_BILLING_PORTAL_URL="https://..."
export VIDEO_WIZARD_PREMIUM_PLAN_NAME="Video Wizard Pro"
```

### Paddle webhook custom data

When opening Paddle checkout, the frontend sends:

- `supabase_user_id`
- `supabase_email`

The webhook uses `custom_data.supabase_user_id` to map subscriptions back to the correct user record.

## Billing endpoints

- `GET /api/app-config`: exposes safe public client config to the browser
- `POST /api/account/status`: returns the current entitlement record for a user
- `POST /api/billing/webhook`: stores Paddle subscription events locally

Note: the current account status endpoint is intentionally lightweight and same-origin. Before a hardened production launch, add server-side verification of the Supabase user token instead of trusting the client-provided user id alone.

## Captions

The Captions tool keeps transcription local to the browser. It downloads and caches ONNX Whisper timestamped models through Transformers.js, defaulting to `onnx-community/whisper-base.en_timestamped` for better dialogue capture, then uses WebGPU when available with a WASM fallback. Video export still uses the local Python server and system `ffmpeg` to render burned-in captions onto the uploaded video.
