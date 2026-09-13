"""Workers AI client — chat + image, with graceful multi-transport fallback.

The game server tries, in order, the first transport that is configured:

  1.  AI Gateway (``CF_AI_GATEWAY_URL``) — "Workers AI" reachable from inside a
      Cloudflare Container without a long-lived token (optional
      ``CF_AI_GATEWAY_TOKEN`` = ``cf-aig-authorization`` header).
  2.  Workers AI REST API with an account token
      (``CLOUDFLARE_API_TOKEN`` + ``CLOUDFLARE_ACCOUNT_ID``).
  3.  Companion Worker endpoint (``AI_FALLBACK_URL``) — the deployed Worker's
      ``/ai/chat`` and ``/ai/image`` routes, which call ``env.AI.run(...)`` with
      the Workers AI binding. **No token required.**

If a token is present but the call fails, we automatically keep falling through
to Workers AI (via the companion Worker / AI Gateway) — exactly the behaviour
"if the token doesn't work, use Workers AI".

All network I/O is synchronous here; callers are expected to run it inside
``asyncio.to_thread(...)`` so the 20-tick game loop never blocks.
"""
import base64
import json
import os
import urllib.request
import urllib.error

# ── defaults ────────────────────────────────────────────────────────────────
CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct"
IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell"
API_BASE = "https://api.cloudflare.com/client/v4/accounts"


def _post(url, headers, body, timeout):
    data = body if isinstance(body, (bytes, bytearray)) else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    for k, v in headers.items():
        req.add_header(k, v)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
    return raw


# ── transport 1: AI Gateway (Workers AI without a token) ───────────────────
def _gateway_chat(base, token, messages, model, max_tokens, timeout):
    if not base:
        return None
    url = base.rstrip("/")
    headers = {}
    if token:
        headers["cf-aig-authorization"] = f"Bearer {token}"
    body = {"model": model, "messages": messages, "max_tokens": max_tokens}
    raw = _post(f"{url}/{model}", headers, body, timeout)
    out = json.loads(raw.decode("utf-8"))
    res = out.get("result") or out
    return (res.get("response") or "").strip() or None


def _gateway_image(base, token, prompt, model, timeout):
    if not base:
        return None
    url = base.rstrip("/")
    headers = {}
    if token:
        headers["cf-aig-authorization"] = f"Bearer {token}"
    raw = _post(f"{url}/{model}", headers, {"prompt": prompt}, timeout)
    out = json.loads(raw.decode("utf-8"))
    res = out.get("result") or out
    img = res.get("image")
    return base64.b64decode(img) if img else None


# ── transport 2: Workers AI REST with a token ───────────────────────────────
def _rest_chat(account_id, token, messages, model, max_tokens, timeout):
    if not (account_id and token):
        return None
    url = f"{API_BASE}/{account_id}/ai/run/{model}"
    raw = _post(url, {"Authorization": f"Bearer {token}"},
                {"messages": messages, "max_tokens": max_tokens}, timeout)
    out = json.loads(raw.decode("utf-8"))
    res = out.get("result", {})
    return (res.get("response") or "").strip() or None


def _rest_image(account_id, token, prompt, model, timeout):
    if not (account_id and token):
        return None
    url = f"{API_BASE}/{account_id}/ai/run/{model}"
    raw = _post(url, {"Authorization": f"Bearer {token}"},
                {"prompt": prompt}, timeout)
    out = json.loads(raw.decode("utf-8"))
    img = out.get("result", {}).get("image")
    return base64.b64decode(img) if img else None


# ── transport 3: companion Worker (Workers AI binding, no token) ────────────
def _worker_chat(fallback_url, messages, model, max_tokens, timeout):
    if not fallback_url:
        return None
    url = fallback_url.rstrip("/") + "/ai/chat"
    raw = _post(url, {}, {"messages": messages, "model": model,
                          "max_tokens": max_tokens}, timeout)
    out = json.loads(raw.decode("utf-8"))
    return (out.get("response") or "").strip() or None


def _worker_image(fallback_url, prompt, model, timeout):
    if not fallback_url:
        return None
    url = fallback_url.rstrip("/") + "/ai/image"
    raw = _post(url, {}, {"prompt": prompt, "model": model}, timeout)
    out = json.loads(raw.decode("utf-8"))
    img = out.get("image")
    return base64.b64decode(img) if img else None


# ── public API (keep the historical signatures working) ─────────────────────
def ai_chat(account_id, token, messages, model=CHAT_MODEL, max_tokens=160,
            fallback_url=None, gateway_url=None, gateway_token=None, timeout=30):
    """Return assistant text, or None if every transport failed/unconfigured."""
    if isinstance(messages, str):          # accept a bare string too
        messages = [{"role": "user", "content": messages}]
    for attempt in (
        lambda: _gateway_chat(gateway_url, gateway_token, messages, model, max_tokens, timeout),
        lambda: _rest_chat(account_id, token, messages, model, max_tokens, timeout),
        lambda: _worker_chat(fallback_url, messages, model, max_tokens, timeout),
    ):
        try:
            out = attempt()
            if out:
                return out
        except Exception:
            continue
    return None


def ai_image(account_id, token, prompt, model=IMAGE_MODEL,
             fallback_url=None, gateway_url=None, gateway_token=None, timeout=120):
    """Return PNG bytes, or None if every transport failed/unconfigured."""
    for attempt in (
        lambda: _gateway_image(gateway_url, gateway_token, prompt, model, timeout),
        lambda: _rest_image(account_id, token, prompt, model, timeout),
        lambda: _worker_image(fallback_url, prompt, model, timeout),
    ):
        try:
            out = attempt()
            if out:
                return out
        except Exception:
            continue
    return None


def ai_available(account_id, token, fallback_url=None, gateway_url=None,
                 gateway_token=None):
    """Quick probe: can we reach any configured AI transport?"""
    return ai_chat(account_id, token,
                   [{"role": "user", "content": "ping"}],
                   max_tokens=4, fallback_url=fallback_url,
                   gateway_url=gateway_url, gateway_token=gateway_token,
                   timeout=8) is not None


def configured(account_id="", token="", fallback_url=None, gateway_url=None):
    """Whether *any* AI transport is configured (used for the status panel)."""
    return bool(gateway_url or (account_id and token) or fallback_url)


def from_env():
    """Build a transport dict straight from the process environment."""
    return {
        "account_id": os.environ.get("CLOUDFLARE_ACCOUNT_ID", ""),
        "token": os.environ.get("CLOUDFLARE_API_TOKEN", ""),
        "fallback_url": os.environ.get("AI_FALLBACK_URL", ""),
        "gateway_url": os.environ.get("CF_AI_GATEWAY_URL", ""),
        "gateway_token": os.environ.get("CF_AI_GATEWAY_TOKEN", ""),
    }
