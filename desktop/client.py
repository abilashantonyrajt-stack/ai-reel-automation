from __future__ import annotations

import json
import os

import httpx
from openai import OpenAI

OMNIBASE = os.environ.get("OPENAI_BASE_URL", "http://localhost:20128/v1")
OMNIMODEL = os.environ.get("OPENAI_MODEL", "oc/big-pickle")
OMNIKEY = os.environ.get("OPENAI_API_KEY", "sk_omniroute")


class OmniRouteClient:
    def __init__(self) -> None:
        self._base = OMNIBASE
        self._model = OMNIMODEL
        self._client = OpenAI(base_url=self._base, api_key=OMNIKEY)

    def chat(
        self,
        messages: list[dict],
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> str:
        resp = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        return (resp.choices[0].message.content or "").strip()

    def chat_json(
        self,
        messages: list[dict],
        max_tokens: int = 2048,
    ) -> dict:
        text = self.chat(messages, max_tokens=max_tokens, temperature=0.2)
        clean = text.strip()
        if clean.startswith("```"):
            parts = clean.split("```")
            clean = parts[1] if len(parts) > 1 else clean
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip().rstrip("`").strip()
        return json.loads(clean) if clean else {}

    def check_connection(self) -> bool:
        try:
            self._client.models.list()
            return True
        except Exception:
            try:
                resp = httpx.get(self._base.replace("/v1", ""), timeout=5)
                return resp.status_code < 500
            except Exception:
                return False
