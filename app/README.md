# VoxBridge — Web App (v5)

## What it is
A premium, minimal web platform for **real-time voice interpreting**:
- **Live Interpreter (push-to-talk)** (STT → Translation → TTS)
- **Online Call (2 participants)** with **WebRTC video** + **live translated captions** (push-to-talk; captions-only translation inside the call)
- **Audio file translation** → MP3
- **History** with saved MP3 (/media)

## Run (Γρήγορα)
1) Copy `.env.example` → `.env` and set:
   - `OPENAI_API_KEY=...`
2) Start:
   - Windows: double-click `START_PLATFORM.bat` (recommended)
   - Or: `uvicorn api.server:app --host 0.0.0.0 --port 8000`
3) Open on the same PC:
   - http://127.0.0.1:8000/app

### Online Call — remote join (simple)
The **other person must be able to open your server URL**.

Best options:
1) **Same Wi‑Fi/LAN**: start the server on `0.0.0.0` and share the **LAN invite link** (the app shows it in **Invite link / code** and the **Copy** button copies it).
2) **Different networks / another country**: you need a **public HTTPS URL**.
   - easiest: run a tunnel (ngrok / Cloudflare Tunnel) and set `PUBLIC_BASE_URL=https://...` in `.env`.

> Note: browsers usually require **HTTPS** for mic/camera on another device. Localhost (`127.0.0.1`) works only on the same computer.

### Online Call — Πώς μπαίνει ο άλλος (πολύ απλά)
Για να συνδεθεί **άλλος χρήστης από άλλη συσκευή**, πρέπει να μπορεί να ανοίξει τη διεύθυνση του server.

**1) Ίδιο Wi‑Fi (LAN):**
- Τρέξε τον server (με `START_PLATFORM.bat` ή `--host 0.0.0.0`).
- Πήγαινε **Online Call** → πάτα **New room** → πάτα **Copy**.
- Στείλε στον άλλον το **Invite link**.

**2) Άλλο δίκτυο / άλλη χώρα:**
- Χρειάζεσαι **δημόσιο HTTPS URL** (domain ή tunnel).
- Βάλε `PUBLIC_BASE_URL=https://...` στο `.env` ώστε τα invite links να είναι σωστά.

Σημείωση: Σε άλλη συσκευή, το μικρόφωνο/κάμερα συνήθως θέλει **HTTPS**.

## Login (Email + Google)
- The app requires login.
- Use the `/login` page to:
  - sign in with **email + password**, or
  - (optional) **Google OAuth**.

### Optional env vars (recommended)
- `SESSION_SECRET` (strong random string) — secures the httpOnly session cookie.

### Google OAuth setup (optional)
Set:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- (optional) `GOOGLE_REDIRECT_URI` (default: `http://127.0.0.1:8000/auth/google/callback`)

In Google Cloud Console → OAuth consent + credentials:
- add an Authorized redirect URI matching the callback above.

## Online Call v2 (rooms)
- Create a **Room**, copy the **link**, send to the other person.
- **Two video panels** (self + remote), camera ON/OFF.
- **Live translated captions overlay** (Captions toggle).
- The call stays connected until you press **End call / Κλείσιμο κλήσης**.

> For usage outside LAN you need port-forward or a tunnel (e.g., ngrok / Cloudflare Tunnel).

## Troubleshooting (STT / Mic)
- If the VU meter moves but **"You said" stays empty**, enable **"Save last recording (debug)"** in Settings.
  Then open:
  - `/media/last_recording.wav` (normalized)
  - and/or `/media/last_recording.webm` / `/media/last_recording.ogg` (raw)

The backend performs best-effort conversion to **mono WAV** (via ffmpeg or the packaged `imageio-ffmpeg` binary) to improve reliability across devices/browsers.

### Firefox note
Chrome/Edge are recommended for best microphone codec compatibility. Firefox is supported via MediaRecorder MIME fallbacks, but some devices/codecs may still be less reliable.

### UI language
The **UI language** (Ελληνικά/English) is separate from the **speech/translation languages**.

### Languages
The system is **not limited** to a short list.
- Choose from the dropdowns, or
- pick **Other…** and type any language name/code (e.g., `es`, `ja`, `Chinese`, `zh-Hans`, `zh-Hant`).
