"""Bedrock Edition (MCPE) RakNet unconnected-ping responder.

This makes the server visible in the Bedrock "Friends/Add Server" list with the
correct MOTD. Full Bedrock world join is experimental in this build.
"""
import asyncio, struct

MAGIC = bytes.fromhex("00ffff00fefefefefdfdfdfd12345678")

BEDROCK_PROTOCOL = 2169
BEDROCK_VERSION = "1.26.45"


class BedrockPingServer:
    def __init__(self, game, host="0.0.0.0", port=19132):
        self.game = game
        self.host = host
        self.port = port
        self.transport = None

    async def start(self):
        loop = asyncio.get_running_loop()
        self.transport, _ = await loop.create_datagram_endpoint(
            lambda: _RakHandler(self), local_addr=(self.host, self.port))
        self.game.log(f"Bedrock ping listening on {self.host}:{self.port} (UDP)")

    def stop(self):
        if self.transport:
            self.transport.close()

    def motd_line(self):
        g = self.game
        online = sum(1 for p in g.players.values() if p.connected)
        # MCPE;motd;protocol;version;online;max;guid;submotd;gamemode;mode_id;port4;port6;
        return (
            f"MCPE;{g.name};{BEDROCK_PROTOCOL};{BEDROCK_VERSION};{online};100;"
            f"1234567890123456;{g.motd};1;1;{self.port};{self.port};"
        )


class _RakHandler(asyncio.DatagramProtocol):
    def __init__(self, server):
        self.server = server

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        if len(data) < 1 or data[0] != 0x01:  # unconnected ping
            return
        try:
            ping_time = struct.unpack(">q", data[1:9])[0]
        except Exception:
            return
        server_guid = 1234567890123456
        body = struct.pack(">q", ping_time) + struct.pack(">q", server_guid) + MAGIC
        body += struct.pack(">H", len(self.server.motd_line()))
        body += self.server.motd_line().encode("utf-8")
        resp = b"\x1c" + body
        self.transport.sendto(resp, addr)
