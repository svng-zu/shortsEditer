# llm/gemini_client.py

import os
from google import genai
from google.genai import types

# local/llm/ → local/
LOCAL_DIR = os.path.dirname(os.path.dirname(__file__))
_KEY_FILE = os.path.join(LOCAL_DIR, "gemini_api_key")

def _load_key():
    if os.path.exists(_KEY_FILE):
        return open(_KEY_FILE).read().strip()
    return os.environ.get("GEMINI_API_KEY", "")

MODEL = "gemini-2.5-flash"

_client = None

def get_client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=_load_key())
    return _client


def call_gemini(prompt: str, max_tokens: int = 2048) -> str:
    client = get_client()
    response = client.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=0.3,
        ),
    )
    return response.text
