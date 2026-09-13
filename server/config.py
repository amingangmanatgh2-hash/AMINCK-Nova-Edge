"""Runtime configuration (env + CLI args)."""
import os


def load(args=None):
    args = args or {}
    cfg = {
        "server_name": os.environ.get("SERVER_NAME", args.get("name") or "AMINCK Nova"),
        "motd": os.environ.get("MOTD", args.get("motd") or "Minecraft God Server — all versions"),
        "host": os.environ.get("HOST", args.get("host") or "0.0.0.0"),
        "port": int(os.environ.get("PORT", args.get("port") or 25565)),
        "bedrock_port": int(os.environ.get("BEDROCK_PORT", args.get("bedrock_port") or 19132)),
        "http_port": int(os.environ.get("HTTP_PORT", args.get("http_port") or 8080)),
        "view_distance": int(os.environ.get("VIEW_DISTANCE", args.get("view_distance") or 4)),
        "account_id": os.environ.get("CLOUDFLARE_ACCOUNT_ID", args.get("account_id") or ""),
        "ai_token": os.environ.get("CLOUDFLARE_API_TOKEN", args.get("ai_token") or ""),
        # Workers AI without a token: AI Gateway / companion Worker fallback
        "ai_fallback_url": os.environ.get("AI_FALLBACK_URL", args.get("ai_fallback_url") or ""),
        "ai_gateway_url": os.environ.get("CF_AI_GATEWAY_URL", args.get("ai_gateway_url") or ""),
        "ai_gateway_token": os.environ.get("CF_AI_GATEWAY_TOKEN", args.get("ai_gateway_token") or ""),
        "ai_model": os.environ.get("AI_MODEL", "@cf/meta/llama-3.1-8b-instruct"),
        "image_model": os.environ.get("IMAGE_MODEL", "@cf/black-forest-labs/flux-1-schnell"),
        "favicon_path": os.environ.get("FAVICON_PATH", args.get("favicon_path") or "favicon.png"),
        "resource_pack_url": os.environ.get("RESOURCE_PACK_URL", ""),
        # admin + site + gameplay tuning
        "admin_password": os.environ.get("ADMIN_PASSWORD", args.get("admin_password") or ""),
        "admin_names": os.environ.get("ADMIN_NAMES", args.get("admin_names") or ""),
        "site_url": os.environ.get("SITE_URL", args.get("site_url") or ""),
        "difficulty": os.environ.get("BOT_DIFFICULTY", args.get("difficulty") or "normal"),
        "scoreboard": os.environ.get("SCOREBOARD", args.get("scoreboard") or "1") not in ("0", "false", "False"),
        "state_path": os.environ.get("STATE_PATH", args.get("state_path") or ""),
        # site shop / payment info (manual payment until a gateway is attached)
        "payment_card": os.environ.get("PAYMENT_CARD", args.get("payment_card") or ""),
        "payment_card_holder": os.environ.get("PAYMENT_CARD_HOLDER", args.get("payment_card_holder") or ""),
        "payment_note": os.environ.get("PAYMENT_NOTE", args.get("payment_note") or ""),
    }
    return cfg
