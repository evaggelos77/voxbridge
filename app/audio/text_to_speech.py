
import os
from openai import OpenAI

# NOTE:
# This module may be imported before `load_dotenv()` runs in the main server.
# Create the OpenAI client lazily so it can pick up OPENAI_API_KEY from .env.
_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client

def text_to_speech_mp3(text: str, out_path: str) -> str:
    client = _get_client()
    tts_model = os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
    voice = os.getenv("OPENAI_TTS_VOICE", "cedar")
    with client.audio.speech.with_streaming_response.create(model=tts_model, voice=voice, input=text) as response:
        response.stream_to_file(out_path)
    return out_path
