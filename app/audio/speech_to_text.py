import os
from openai import OpenAI

# NOTE:
# This module may be imported before `load_dotenv()` runs in the main server.
# Therefore we create the OpenAI client lazily, so it always sees the latest
# OPENAI_API_KEY value loaded from .env / environment.
_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client

def speech_to_text(file_path: str, language: str | None = None) -> str:
    """Transcribe audio to text.

    `language` is an optional hint (e.g., 'el', 'en', 'zh', 'ar', 'fr', ...).
    We keep this permissive on purpose: it helps accuracy but should never block users.
    """
    client = _get_client()

    primary = (os.getenv("OPENAI_STT_MODEL", "gpt-4o-mini-transcribe") or "").strip()
    fallback = (os.getenv("OPENAI_STT_FALLBACK_MODEL", "whisper-1") or "").strip()
    models = []
    for m in (primary, fallback):
        if m and m not in models:
            models.append(m)

    for model in models:
        try:
            with open(file_path, "rb") as f:
                kwargs = {"model": model, "file": f, "response_format": "json"}
                if language:
                    kwargs["language"] = language

                try:
                    res = client.audio.transcriptions.create(**kwargs)
                except TypeError:
                    # Some SDK/model combinations may not accept `language`
                    kwargs.pop("language", None)
                    res = client.audio.transcriptions.create(**kwargs)

            text = (getattr(res, "text", "") or "").strip()
            if text:
                return text
        except Exception:
            # Try next model
            continue

    return ""
