"""AMINCK Nova — Minecraft server entrypoint."""
import asyncio, argparse, sys
from .config import load
from .game import GameServer
from .server import MinecraftServer
from .bedrock import BedrockPingServer
from .http_server import HttpPanel
from . import image_gen


def parse_args():
    ap = argparse.ArgumentParser(description="AMINCK Nova Minecraft server")
    ap.add_argument("--host", default=None)
    ap.add_argument("--port", type=int, default=None)
    ap.add_argument("--bedrock-port", type=int, default=None)
    ap.add_argument("--http-port", type=int, default=None)
    ap.add_argument("--name", default=None)
    ap.add_argument("--motd", default=None)
    ap.add_argument("--view-distance", type=int, default=None)
    ap.add_argument("--account-id", default=None)
    ap.add_argument("--ai-token", default=None)
    ap.add_argument("--ai-fallback-url", default=None)
    ap.add_argument("--ai-gateway-url", default=None)
    ap.add_argument("--ai-gateway-token", default=None)
    ap.add_argument("--no-http", action="store_true")
    ap.add_argument("--no-bedrock", action="store_true")
    ap.add_argument("--no-image", action="store_true")
    return ap.parse_args()


async def main():
    args = parse_args()
    cfg = load(vars(args))
    game = GameServer(cfg)

    banner = f"""
  █████╗ ███╗   ███╗██╗███╗   ██╗ ██████╗██╗  ██╗   ███╗   ██╗ ██████╗ ██╗   ██╗ █████╗
 ██╔══██╗████╗ ████║██║████╗  ██║██╔════╝██║ ██╔╝   ████╗  ██║██╔═══██╗██║   ██║██╔══██╗
 ███████║██╔████╔██║██║██╔██╗ ██║██║     █████╔╝    ██╔██╗ ██║██║   ██║██║   ██║███████║
 ██╔══██║██║╚██╔╝██║██║██║╚██╗██║██║     ██╔═██╗    ██║╚██╗██║██║   ██║╚██╗ ██╔╝██╔══██║
 ██║  ██║██║ ╚═╝ ██║██║██║ ╚████║╚██████╗██║  ██╗   ██║ ╚████║╚██████╔╝ ╚████╔╝ ██║  ██║
 ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝   ╚═╝  ╚═══╝ ╚═════╝   ╚═══╝  ╚═╝  ╚═╝
    """
    print(banner)
    game.log(f"Server name: {game.name}")
    game.log(f"Java port {cfg['port']} | Bedrock ping {cfg['bedrock_port']} | Panel {cfg['http_port']}")
    game.log(f"Supported Java versions: 1.8 → 26.x ({len(game.profile_for(763).data['s2c']['play'])} play packets/763)")
    if game.ai_enabled:
        game.log("Workers AI enabled (chat + auto icon) — token/gateway/companion fallback chain")
    else:
        game.log("Workers AI not configured — set CLOUDFLARE_API_TOKEN, "
                 "AI_FALLBACK_URL or CF_AI_GATEWAY_URL")

    # generate icon (best-effort, non-blocking) — always yields a valid 64x64 PNG
    if not args.no_image:
        def _icon():
            try:
                uri = image_gen.make_icon(
                    game.account_id, game.ai_token, game.name,
                    cfg["favicon_path"], game.image_model,
                    fallback_url=game.ai_fallback_url,
                    gateway_url=game.ai_gateway_url,
                    gateway_token=game.ai_gateway_token)
                if uri:
                    game.favicon_data_uri = uri
                    game.log("Server icon ready ✓")
                else:
                    game.log("Icon generation failed")
            except Exception as e:
                game.log(f"icon error: {e!r}")
        await asyncio.to_thread(_icon)

    java = MinecraftServer(game, cfg["host"], cfg["port"])
    await java.start()

    bedrock = None
    if not args.no_bedrock:
        bedrock = BedrockPingServer(game, cfg["host"], cfg["bedrock_port"])
        await bedrock.start()

    panel = None
    if not args.no_http:
        panel = HttpPanel(game, cfg["host"], cfg["http_port"])
        await panel.start()

    await game.tick_loop()


def run():
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nbye")
        sys.exit(0)


if __name__ == "__main__":
    run()
