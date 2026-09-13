"""Async TCP server: accepts Minecraft clients and spawns sessions."""
import asyncio
import socket
from .session import Session


def enable_low_latency(writer):
    """TCP_NODELAY + keepalive — reduces per-packet latency (lower ping feel)."""
    try:
        sock = writer.get_extra_info("socket")
        if sock is not None:
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    except Exception:
        pass


class MinecraftServer:
    def __init__(self, game, host="0.0.0.0", port=25565):
        self.game = game
        self.host = host
        self.port = port
        self.server = None

    async def start(self):
        self.server = await asyncio.start_server(self._on_conn, self.host, self.port)
        self.game.log(f"Java server listening on {self.host}:{self.port}")

    async def _on_conn(self, reader, writer):
        enable_low_latency(writer)
        peername = writer.get_extra_info("peername")
        self.game.log(f"connection from {peername}")
        session = Session(self.game, reader, writer)
        await session.run()
