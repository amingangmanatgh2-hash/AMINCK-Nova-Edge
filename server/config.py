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
    }
    return cfg
