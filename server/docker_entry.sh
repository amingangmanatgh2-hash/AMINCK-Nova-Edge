#!/bin/sh
# AMINCK Nova container entrypoint.
# The Python server reads its config from environment variables (see config.py),
# so everything below is overridable from the Cloudflare Container class `envVars`.
set -e
cd /app

export SERVER_NAME="${SERVER_NAME:-AMINCK Nova}"
export MOTD="${MOTD:-Minecraft God Server — Java 1.8 → 26.x}"
export PORT="${PORT:-25565}"
export BEDROCK_PORT="${BEDROCK_PORT:-19132}"
export HTTP_PORT="${HTTP_PORT:-8080}"
export VIEW_DISTANCE="${VIEW_DISTANCE:-4}"

echo "[aminck-nova] starting: $SERVER_NAME"
echo "[aminck-nova] java=$PORT bedrock=$BEDROCK_PORT panel=$HTTP_PORT"
echo "[aminck-nova] AI transports -> gateway=${CF_AI_GATEWAY_URL:-none} token=${CLOUDFLARE_API_TOKEN:+yes} companion=${AI_FALLBACK_URL:-none}"

exec python3 -m server
