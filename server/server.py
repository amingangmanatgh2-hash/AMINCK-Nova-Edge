"""Async TCP server: accepts Minecraft clients and spawns sessions."""
import asyncio
from .session import Session


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
        peername = writer.get_extra_info("peername")
        self.game.log(f"connection from {peername}")
        session = Session(self.game, reader, writer)
        await session.run()
