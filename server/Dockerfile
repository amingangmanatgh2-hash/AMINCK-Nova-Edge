# AMINCK Nova — Minecraft God Server (pure Python, no runtime deps)
# Built + pushed automatically by `wrangler deploy` (Cloudflare Containers).
FROM python:3.11-slim

WORKDIR /app

# Copy the whole server package (protocol data included).
COPY . /app

ENV PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=25565 \
    BEDROCK_PORT=19132 \
    HTTP_PORT=8080 \
    VIEW_DISTANCE=4 \
    FAVICON_PATH=/app/favicon.png

# 8080 = HTTP panel (container defaultPort), 25565 = Java, 19132 = Bedrock ping
EXPOSE 8080 25565 19132

ENTRYPOINT ["/app/docker_entry.sh"]
