import os
import uuid
import tempfile
import json
import shutil
import re
import mimetypes
import subprocess
import traceback
import sqlite3
import secrets
import base64
import hashlib
import hmac
from datetime import datetime, timezone
from typing import Optional
import socket

from dotenv import load_dotenv

# IMPORTANT:
# Load .env *before* importing modules that may read environment variables.
load_dotenv()

import requests
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, Form, Request
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from openai import OpenAI

from audio.speech_to_text import speech_to_text
from audio.text_to_speech import text_to_speech_mp3

# -------------------------
# Branding
# -------------------------
BRAND_NAME = "VoxBridge"

# Optional: if set, Online Call invite links will use this public URL instead of 127.0.0.1
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").strip()

# -------------------------
# App init
# -------------------------
app = FastAPI()

# Signed cookie session (httpOnly)
SESSION_SECRET = (os.getenv("SESSION_SECRET") or "dev-secret-change-me").strip()
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="vb_session",
    max_age=60 * 60 * 24 * 14,  # 14 days
    same_site="lax",
    https_only=False,  # local dev
)

# ---------- UX constants ----------
FRIENDLY_AUDIO_ERROR = "Δεν άκουσα καθαρά — ξαναμίλησε."
AUTH_REQUIRED_CODE = "AUTH_REQUIRED"

# Default target when user doesn't choose one (can be overridden via env)
DEFAULT_TARGET_LANG = (os.getenv("DEFAULT_TARGET_LANG", "en") or "en").strip()

# -------------------------
# Usage credits (cost protection)
# 1 credit = 1 translation. New users get FREE_TRIAL_CREDITS free, then must buy a
# package (Stripe) to top up. This caps the app owner's OpenAI bill.
# -------------------------
FREE_TRIAL_CREDITS = int((os.getenv("FREE_TRIAL_CREDITS", "15") or "15").strip() or "15")

# ---------- Paths ----------
APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MEDIA_DIR = os.path.join(APP_DIR, "web_media")
HISTORY_PATH = os.path.join(MEDIA_DIR, "history.json")
DB_PATH = os.path.join(MEDIA_DIR, "users.sqlite3")
os.makedirs(MEDIA_DIR, exist_ok=True)

STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "static"))

# Ensure modern MIME types for JS/CSS (fixes Chrome DevTools warning on some setups)
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/media", StaticFiles(directory=MEDIA_DIR), name="media")


# -------------------------
# Helpers
# -------------------------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log_exc(where: str) -> None:
    """Log exceptions to server console for debugging while keeping the UI friendly."""
    try:
        print(f"[{BRAND_NAME}] Exception in {where}:\n{traceback.format_exc()}")
    except Exception:
        pass


def _ui_error(message: str = FRIENDLY_AUDIO_ERROR, status_code: int = 500) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": message})


def _lan_ip_best_effort() -> str:
    """Return a best-effort LAN IPv4 address for convenience links.

    This is used only to help generate a shareable link when the server runs on
    localhost and `PUBLIC_BASE_URL` is not configured.
    """
    # Try the common UDP trick (no traffic is actually sent).
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass

    # Fallback: hostname resolution
    try:
        ip = socket.gethostbyname(socket.gethostname())
        if ip and not ip.startswith("127."):
            return ip
    except Exception:
        pass

    return ""


def _auth_required() -> JSONResponse:
    return JSONResponse(status_code=401, content={"error": AUTH_REQUIRED_CODE})


def _clean_lang(val: Optional[str]) -> str:
    return (val or "").strip()


def _is_truthy(val: Optional[str]) -> bool:
    v = (val or "").strip().lower()
    return v in {"1", "true", "yes", "y", "on"}


def _openai_client() -> OpenAI:
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def _ffmpeg_exe() -> Optional[str]:
    """Return an ffmpeg executable path if available.

    Priority:
    1) System ffmpeg in PATH
    2) imageio-ffmpeg packaged binary (cross-platform)
    """
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _normalize_audio_to_wav(in_path: str, *, out_sr: int = 16000) -> str:
    """Best-effort normalize any input audio into mono 16-bit WAV."""
    out_path = os.path.join(tempfile.gettempdir(), f"vb_norm_{uuid.uuid4().hex}.wav")

    ffmpeg = _ffmpeg_exe()
    if ffmpeg:
        cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            in_path,
            "-ac",
            "1",
            "-ar",
            str(int(out_sr)),
            "-c:a",
            "pcm_s16le",
            out_path,
        ]
        try:
            subprocess.run(cmd, check=True)
            return out_path
        except Exception:
            try:
                os.remove(out_path)
            except Exception:
                pass
            return in_path

    # No ffmpeg: if it's already a wav, try to downmix/resample with soundfile.
    ext = os.path.splitext(in_path)[1].lower()
    if ext == ".wav":
        try:
            import soundfile as sf
            import numpy as np

            audio, sr = sf.read(in_path, always_2d=True)
            mono = np.mean(audio, axis=1)
            if sr != out_sr:
                x_old = np.linspace(0, 1, num=len(mono), endpoint=False)
                new_len = int(round(len(mono) * (out_sr / float(sr))))
                x_new = np.linspace(0, 1, num=max(new_len, 1), endpoint=False)
                mono = np.interp(x_new, x_old, mono).astype("float32")

            sf.write(out_path, mono, out_sr, subtype="PCM_16")
            return out_path
        except Exception:
            try:
                os.remove(out_path)
            except Exception:
                pass
            return in_path

    return in_path


def _detect_lang_very_basic(text: str) -> str:
    """Lightweight script-based detector, used only for metadata."""
    t = text or ""
    if re.search(r"[Α-Ωα-ω]", t):
        return "el"
    if re.search(r"[\u0600-\u06FF]", t):
        return "ar"
    if re.search(r"[\u4E00-\u9FFF]", t):
        return "zh"
    if re.search(r"[а-яА-ЯЁё]", t):
        return "ru"
    return "en"


def _pick_default_target(src_hint: str, transcript: str) -> str:
    src = src_hint or _detect_lang_very_basic(transcript)
    if src == "el":
        return "en"
    if src == "en":
        return "el"
    return DEFAULT_TARGET_LANG


def _load_history() -> list[dict]:
    try:
        if os.path.exists(HISTORY_PATH):
            with open(HISTORY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, list) else []
    except Exception:
        pass
    return []


def _save_history(items: list[dict]) -> None:
    tmp = HISTORY_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    shutil.move(tmp, HISTORY_PATH)


def _append_history(item: dict) -> None:
    items = _load_history()
    items.append(item)
    items = items[-500:]
    _save_history(items)


def _translate_text(transcript: str, target_lang: str, speak_lang: str = "") -> str:
    translate_model = os.getenv("OPENAI_TRANSLATE_MODEL", "gpt-5-mini")
    prompt = (
        "You are a professional interpreter.\n"
        "Translate faithfully into the target language.\n"
        "Return ONLY the translation.\n\n"
        f"Target language: {target_lang}\n"
    )
    if speak_lang:
        prompt += f"Source language hint: {speak_lang}\n"
    prompt += f"\nText:\n{transcript}"

    client = _openai_client()
    translated = ""
    try:
        resp = client.responses.create(model=translate_model, input=prompt)
        translated = (getattr(resp, "output_text", "") or "").strip()
    except Exception:
        try:
            cresp = client.chat.completions.create(
                model=translate_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
            )
            translated = (cresp.choices[0].message.content or "").strip()
        except Exception:
            translated = ""
    return translated or transcript


def _stt_translate(
    tmp_in: str,
    target_lang: Optional[str],
    speak_lang: Optional[str] = None,
    *,
    debug_save: bool = False,
    debug_suffix: Optional[str] = None,
) -> dict:
    """STT -> translate (no TTS)."""
    speak_hint = _clean_lang(speak_lang)

    if debug_save:
        try:
            ext = (debug_suffix or os.path.splitext(tmp_in)[1] or ".bin").strip() or ".bin"
            if not ext.startswith("."):
                ext = "." + ext
            raw_out = os.path.join(MEDIA_DIR, f"last_recording{ext}")
            shutil.copyfile(tmp_in, raw_out)
        except Exception:
            pass

    norm_path = _normalize_audio_to_wav(tmp_in)
    if debug_save:
        try:
            if os.path.exists(norm_path) and norm_path.lower().endswith(".wav"):
                wav_out = os.path.join(MEDIA_DIR, "last_recording.wav")
                shutil.copyfile(norm_path, wav_out)
        except Exception:
            pass

    try:
        transcript = speech_to_text(norm_path, language=speak_hint or None)
    finally:
        if norm_path != tmp_in:
            try:
                os.remove(norm_path)
            except Exception:
                pass

    if not transcript:
        raise ValueError("empty transcript")

    tgt = _clean_lang(target_lang)
    if not tgt:
        tgt = _pick_default_target(speak_hint, transcript)

    translated = _translate_text(transcript, tgt, speak_lang=speak_hint)
    src_lang_meta = speak_hint or _detect_lang_very_basic(transcript)

    return {
        "created_at": _now_iso(),
        "src_lang": src_lang_meta,
        "target_lang": tgt,
        "transcript": transcript,
        "translated_text": translated,
    }


def _translate_to_mp3(
    tmp_in: str,
    target_lang: Optional[str],
    speak_lang: Optional[str] = None,
    *,
    debug_save: bool = False,
    debug_suffix: Optional[str] = None,
) -> dict:
    """Core pipeline: STT -> translate -> TTS mp3 (used for Live + Files)."""
    meta = _stt_translate(
        tmp_in,
        target_lang,
        speak_lang=speak_lang,
        debug_save=debug_save,
        debug_suffix=debug_suffix,
    )
    item_id = uuid.uuid4().hex
    mp3_name = f"{item_id}.mp3"
    mp3_path = os.path.join(MEDIA_DIR, mp3_name)

    text_to_speech_mp3(meta["translated_text"], mp3_path)

    meta.update({"id": item_id, "mp3_url": f"/media/{mp3_name}"})
    return meta


# -------------------------
# DB (SQLite)
# -------------------------
def _db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _init_db() -> None:
    con = _db()
    try:
        con.execute(
            f"""
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT,
              google_sub TEXT UNIQUE,
              created_at TEXT NOT NULL,
              credits INTEGER NOT NULL DEFAULT {FREE_TRIAL_CREDITS}
            )
            """
        )
        # Migration: add 'credits' to pre-existing databases that predate this column.
        _cols = [r[1] for r in con.execute("PRAGMA table_info(users)").fetchall()]
        if "credits" not in _cols:
            con.execute(
                f"ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT {FREE_TRIAL_CREDITS}"
            )
        con.commit()
    finally:
        con.close()


@app.on_event("startup")
def _on_startup():
    _init_db()


def _user_by_id(user_id: int) -> Optional[sqlite3.Row]:
    con = _db()
    try:
        cur = con.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        return cur.fetchone()
    finally:
        con.close()


def _user_by_email(email: str) -> Optional[sqlite3.Row]:
    con = _db()
    try:
        cur = con.execute("SELECT * FROM users WHERE lower(email) = lower(?)", (email.strip(),))
        return cur.fetchone()
    finally:
        con.close()


def _user_by_google_sub(sub: str) -> Optional[sqlite3.Row]:
    con = _db()
    try:
        cur = con.execute("SELECT * FROM users WHERE google_sub = ?", (sub.strip(),))
        return cur.fetchone()
    finally:
        con.close()


# -------------------------
# Password hashing (stdlib PBKDF2)
# -------------------------
def _hash_password(pw: str) -> str:
    pw = (pw or "").encode("utf-8")
    salt = secrets.token_bytes(16)
    iters = 120_000
    dk = hashlib.pbkdf2_hmac("sha256", pw, salt, iters, dklen=32)
    return "pbkdf2_sha256$%d$%s$%s" % (
        iters,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(dk).decode("ascii"),
    )


def _verify_password(pw: str, stored: str) -> bool:
    try:
        algo, iters_s, salt_b64, dk_b64 = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        iters = int(iters_s)
        salt = base64.b64decode(salt_b64.encode("ascii"))
        dk_stored = base64.b64decode(dk_b64.encode("ascii"))
        dk = hashlib.pbkdf2_hmac("sha256", (pw or "").encode("utf-8"), salt, iters, dklen=len(dk_stored))
        return hmac.compare_digest(dk, dk_stored)
    except Exception:
        return False


def _create_user_password(email: str, password: str) -> sqlite3.Row:
    con = _db()
    try:
        created = _now_iso()
        pw_hash = _hash_password(password)
        con.execute(
            "INSERT INTO users (email, password_hash, created_at, credits) VALUES (?,?,?,?)",
            (email.strip(), pw_hash, created, FREE_TRIAL_CREDITS),
        )
        con.commit()
        cur = con.execute("SELECT * FROM users WHERE lower(email)=lower(?)", (email.strip(),))
        row = cur.fetchone()
        assert row is not None
        return row
    finally:
        con.close()


def _upsert_user_google(email: str, sub: str) -> sqlite3.Row:
    email = email.strip()
    sub = sub.strip()
    con = _db()
    try:
        cur = con.execute("SELECT * FROM users WHERE google_sub = ?", (sub,))
        row = cur.fetchone()
        if row:
            return row

        cur = con.execute("SELECT * FROM users WHERE lower(email)=lower(?)", (email,))
        row = cur.fetchone()
        if row:
            con.execute("UPDATE users SET google_sub=? WHERE id=?", (sub, row["id"]))
            con.commit()
            cur = con.execute("SELECT * FROM users WHERE id=?", (row["id"],))
            row2 = cur.fetchone()
            assert row2 is not None
            return row2

        created = _now_iso()
        con.execute(
            "INSERT INTO users (email, google_sub, created_at, credits) VALUES (?,?,?,?)",
            (email, sub, created, FREE_TRIAL_CREDITS),
        )
        con.commit()
        cur = con.execute("SELECT * FROM users WHERE google_sub=?", (sub,))
        row = cur.fetchone()
        assert row is not None
        return row
    finally:
        con.close()


# -------------------------
# Usage credits helpers
# -------------------------
def _get_credits(user_id: int) -> int:
    con = _db()
    try:
        cur = con.execute("SELECT credits FROM users WHERE id=?", (int(user_id),))
        row = cur.fetchone()
        return int(row["credits"]) if row and row["credits"] is not None else 0
    finally:
        con.close()


def _spend_credit(user_id: int, n: int = 1) -> int:
    """Decrement credits (never below 0). Returns the new balance."""
    con = _db()
    try:
        con.execute(
            "UPDATE users SET credits = MAX(credits - ?, 0) WHERE id=?",
            (int(n), int(user_id)),
        )
        con.commit()
        cur = con.execute("SELECT credits FROM users WHERE id=?", (int(user_id),))
        row = cur.fetchone()
        return int(row["credits"]) if row and row["credits"] is not None else 0
    finally:
        con.close()


def _add_credits(user_id: int, n: int) -> int:
    """Add credits (used by Stripe top-ups). Returns the new balance."""
    con = _db()
    try:
        con.execute(
            "UPDATE users SET credits = credits + ? WHERE id=?",
            (int(n), int(user_id)),
        )
        con.commit()
        cur = con.execute("SELECT credits FROM users WHERE id=?", (int(user_id),))
        row = cur.fetchone()
        return int(row["credits"]) if row and row["credits"] is not None else 0
    finally:
        con.close()


def _no_credits() -> JSONResponse:
    return JSONResponse(
        status_code=402,
        content={
            "error": "Τελείωσαν τα credits σου. Αγόρασε πακέτο για να συνεχίσεις.",
            "code": "NO_CREDITS",
            "credits": 0,
        },
    )


# -------------------------
# Session / auth helpers
# -------------------------
def _current_user(request: Request) -> Optional[sqlite3.Row]:
    try:
        uid = request.session.get("uid")
    except Exception:
        uid = None
    if not uid:
        return None
    try:
        return _user_by_id(int(uid))
    except Exception:
        return None


# -------------------------
# Auth endpoints
# -------------------------
@app.get("/login")
def login_page():
    path = os.path.join(STATIC_DIR, "app", "login.html")
    if not os.path.exists(path):
        return HTMLResponse("<h1>Login page missing</h1>", status_code=500)
    with open(path, "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.get("/api/me")
def api_me(request: Request):
    u = _current_user(request)
    if not u:
        return _auth_required()
    return {"email": u["email"], "created_at": u["created_at"], "credits": int(u["credits"] or 0)}


@app.get("/api/config")
def api_config(request: Request):
    """Lightweight client config (non-sensitive)."""
    if not _current_user(request):
        return _auth_required()
    # Best-effort LAN base URL (helps when running locally and user wants another device on the
    # same Wi‑Fi/LAN to join the room). This is OPTIONAL...
    try:
        scheme = request.url.scheme or "http"
        port = request.url.port
        if port is None:
            port = 443 if scheme == "https" else 80
        lan_ip = _lan_ip_best_effort()
        lan_base = f"{scheme}://{lan_ip}:{int(port)}" if lan_ip else ""
    except Exception:
        lan_base = ""

    return {
        "public_base_url": PUBLIC_BASE_URL,
        "lan_base_url": lan_base,
        "brand": BRAND_NAME,
    }


@app.post("/api/auth/logout")
def api_logout(request: Request):
    try:
        request.session.clear()
    except Exception:
        pass
    return {"ok": True}


@app.post("/api/auth/register")
def api_register(request: Request, email: str = Form(...), password: str = Form(...)):
    email = (email or "").strip()
    password = (password or "").strip()

    if len(password) < 6:
        return JSONResponse(status_code=400, content={"error": "weak_password"})

    try:
        if _user_by_email(email):
            return JSONResponse(status_code=400, content={"error": "exists"})
        u = _create_user_password(email, password)
        request.session["uid"] = int(u["id"])
        return {"ok": True, "email": u["email"]}
    except Exception:
        _log_exc("/api/auth/register")
        return JSONResponse(status_code=400, content={"error": "generic"})


@app.post("/api/auth/login")
def api_login(request: Request, email: str = Form(...), password: str = Form(...)):
    email = (email or "").strip()
    password = (password or "").strip()

    try:
        u = _user_by_email(email)
        if not u or not u["password_hash"] or not _verify_password(password, u["password_hash"]):
            return JSONResponse(status_code=400, content={"error": "invalid"})
        request.session["uid"] = int(u["id"])
        return {"ok": True, "email": u["email"]}
    except Exception:
        _log_exc("/api/auth/login")
        return JSONResponse(status_code=400, content={"error": "generic"})


# Google OAuth (optional, manual flow)
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


@app.get("/auth/google/login")
def google_login(request: Request, next: str = "/app"):
    client_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    client_secret = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip()
    if not client_id or not client_secret:
        return RedirectResponse(url="/login")

    # keep next same-origin
    if next.startswith("http://") or next.startswith("https://"):
        next = "/app"

    state = secrets.token_urlsafe(24)
    request.session["google_oauth_state"] = state
    request.session["oauth_next"] = next

    redirect_uri = (os.getenv("GOOGLE_REDIRECT_URI") or "").strip()
    if not redirect_uri:
        # Default local callback
        redirect_uri = str(request.url_for("google_callback"))

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
        "access_type": "online",
        "include_granted_scopes": "true",
    }
    from urllib.parse import urlencode

    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{urlencode(params)}")


@app.get("/auth/google/callback")
def google_callback(request: Request, code: str = "", state: str = ""):
    client_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    client_secret = (os.getenv("GOOGLE_CLIENT_SECRET") or "").strip()
    if not client_id or not client_secret:
        return RedirectResponse(url="/login")

    expected_state = request.session.get("google_oauth_state") or ""
    if not state or not expected_state or state != expected_state:
        return RedirectResponse(url="/login")

    redirect_uri = (os.getenv("GOOGLE_REDIRECT_URI") or "").strip()
    if not redirect_uri:
        redirect_uri = str(request.url_for("google_callback"))

    try:
        token_resp = requests.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=15,
        )
        token_resp.raise_for_status()
        token = token_resp.json()
        access_token = (token.get("access_token") or "").strip()
        if not access_token:
            raise ValueError("missing access_token")

        ui_resp = requests.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        ui_resp.raise_for_status()
        info = ui_resp.json() or {}
        email = (info.get("email") or "").strip()
        sub = (info.get("sub") or "").strip()
        if not email or not sub:
            raise ValueError("missing email/sub")

        u = _upsert_user_google(email, sub)
        request.session["uid"] = int(u["id"])
    except Exception:
        _log_exc("/auth/google/callback")
        return RedirectResponse(url="/login")

    nxt = request.session.pop("oauth_next", "/app") or "/app"
    if nxt.startswith("http://") or nxt.startswith("https://"):
        nxt = "/app"
    return RedirectResponse(url=nxt)


# -------------------------
# Main UI routes
# -------------------------
@app.get("/")
def root():
    return {"status": f"{BRAND_NAME} OK", "ui": "/app"}


@app.get("/health")
def health():
    return {
        "server": "on",
        "has_key": bool(os.getenv("OPENAI_API_KEY")),
        "tts_voice": os.getenv("OPENAI_TTS_VOICE", ""),
    }


@app.get("/app")
def app_ui(request: Request):
    if not _current_user(request):
        # Preserve query params so room links still work after login
        nxt = request.url.path
        if request.url.query:
            nxt += "?" + request.url.query
        if request.url.fragment:
            nxt += "#" + request.url.fragment
        return RedirectResponse(url=f"/login?next={nxt}")

    index_path = os.path.join(STATIC_DIR, "app", "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.get("/online")
def online(request: Request):
    # Legacy call page; still require login for consistency.
    if not _current_user(request):
        return RedirectResponse(url="/login?next=/online")
    with open(os.path.join(STATIC_DIR, "online.html"), "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


# -------------------------
# Translation APIs (require login)
# -------------------------
@app.post("/api/ptt")
async def api_ptt_translate(
    request: Request,
    file: UploadFile = File(...),
    target_lang: Optional[str] = Form(None),
    speak_lang: Optional[str] = Form(None),
    debug_save: Optional[str] = Form(None),
):
    u = _current_user(request)
    if not u:
        return _auth_required()
    if not os.getenv("OPENAI_API_KEY"):
        return _ui_error(status_code=400)
    if int(u["credits"] or 0) <= 0:
        return _no_credits()

    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    tmp_in = os.path.join(tempfile.gettempdir(), f"vb_in_{uuid.uuid4().hex}{suffix}")
    with open(tmp_in, "wb") as f:
        f.write(await file.read())

    try:
        meta = _translate_to_mp3(
            tmp_in,
            target_lang,
            speak_lang=speak_lang,
            debug_save=_is_truthy(debug_save),
            debug_suffix=suffix,
        )
        meta["mode"] = "ptt"
        _append_history(meta)
        meta["credits"] = _spend_credit(u["id"], 1)
        return JSONResponse(meta)
    except Exception:
        _log_exc("/api/ptt")
        return _ui_error()
    finally:
        try:
            os.remove(tmp_in)
        except Exception:
            pass


@app.post("/api/call/captions")
async def api_call_captions(
    request: Request,
    file: UploadFile = File(...),
    target_lang: Optional[str] = Form(None),
    speak_lang: Optional[str] = Form(None),
    room: Optional[str] = Form(None),
    debug_save: Optional[str] = Form(None),
):
    """Online Call v2: captions only (no TTS)."""
    u = _current_user(request)
    if not u:
        return _auth_required()
    if not os.getenv("OPENAI_API_KEY"):
        return _ui_error(status_code=400)
    if int(u["credits"] or 0) <= 0:
        return _no_credits()

    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    tmp_in = os.path.join(tempfile.gettempdir(), f"vb_call_{uuid.uuid4().hex}{suffix}")
    with open(tmp_in, "wb") as f:
        f.write(await file.read())

    try:
        meta = _stt_translate(
            tmp_in,
            target_lang,
            speak_lang=speak_lang,
            debug_save=_is_truthy(debug_save),
            debug_suffix=suffix,
        )
        meta["mode"] = "call_captions"
        if room:
            meta["room"] = room
        meta["credits"] = _spend_credit(u["id"], 1)
        return JSONResponse(meta)
    except Exception:
        _log_exc("/api/call/captions")
        return _ui_error()
    finally:
        try:
            os.remove(tmp_in)
        except Exception:
            pass


@app.post("/api/file")
async def api_file_translate(
    request: Request,
    file: UploadFile = File(...),
    target_lang: Optional[str] = Form(None),
    speak_lang: Optional[str] = Form(None),
):
    u = _current_user(request)
    if not u:
        return _auth_required()
    if not os.getenv("OPENAI_API_KEY"):
        return _ui_error(status_code=400)
    if int(u["credits"] or 0) <= 0:
        return _no_credits()

    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    tmp_in = os.path.join(tempfile.gettempdir(), f"vb_file_{uuid.uuid4().hex}{suffix}")
    with open(tmp_in, "wb") as f:
        f.write(await file.read())

    try:
        meta = _translate_to_mp3(tmp_in, target_lang, speak_lang=speak_lang)
        meta["mode"] = "file"
        meta["original_name"] = file.filename or "audio"
        _append_history(meta)
        meta["credits"] = _spend_credit(u["id"], 1)
        return JSONResponse(meta)
    except Exception:
        _log_exc("/api/file")
        return _ui_error()
    finally:
        try:
            os.remove(tmp_in)
        except Exception:
            pass


@app.get("/api/history")
def api_history(request: Request):
    if not _current_user(request):
        return _auth_required()
    items = list(reversed(_load_history()))
    return {"items": items}


@app.delete("/api/history/{item_id}")
def api_delete_history(request: Request, item_id: str):
    if not _current_user(request):
        return _auth_required()
    items = _load_history()
    kept = [x for x in items if x.get("id") != item_id]
    if len(kept) == len(items):
        return JSONResponse(status_code=404, content={"error": "Δεν βρέθηκε."})

    _save_history(kept)

    mp3_path = os.path.join(MEDIA_DIR, f"{item_id}.mp3")
    try:
        if os.path.exists(mp3_path):
            os.remove(mp3_path)
    except Exception:
        pass

    return {"ok": True}


# -------------------------
# WebSocket rooms (signaling relay)
# -------------------------
rooms: dict[str, set[WebSocket]] = {}


@app.websocket("/ws/{room}")
async def ws_room(websocket: WebSocket, room: str):
    # We accept and relay messages (used for: prefs, captions, WebRTC signaling).
    await websocket.accept()
    rooms.setdefault(room, set()).add(websocket)
    try:
        await websocket.send_json({"type": "info", "message": "connected"})
        while True:
            data = await websocket.receive_text()
            peers = list(rooms.get(room, set()))
            for ws in peers:
                if ws is websocket:
                    continue
                try:
                    await ws.send_text(data)
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        if room in rooms and websocket in rooms[room]:
            rooms[room].remove(websocket)
        if room in rooms and not rooms[room]:
            rooms.pop(room, None)
