#!/bin/bash
# SECRETARY — Local Bridge for Mac Mini (Ventura / OCLP)
# Run once: chmod +x start-mac.sh
# Then: ./start-mac.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=7474

echo "╔══════════════════════════════════════════╗"
echo "║   SECRETARY — Mac Mini Bridge            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check Node is installed
if ! command -v node &> /dev/null; then
  echo "Node.js not found. Install via: brew install node"
  exit 1
fi

# Start bridge in background
node "$SCRIPT_DIR/server.js" &
BRIDGE_PID=$!
echo "Bridge started on :$PORT (PID $BRIDGE_PID)"
echo ""

# Try Tailscale Funnel (preferred — stable HTTPS URL)
if command -v tailscale &> /dev/null; then
  echo "Tailscale detected. Starting funnel on port $PORT..."
  echo "Run this in a separate terminal to get your public URL:"
  echo ""
  echo "  tailscale funnel $PORT"
  echo ""
  echo "Then add the URL to Vercel:"
  echo "  vercel env add BRIDGE_MACMINI"
  echo ""
fi

# Wait for bridge process
echo "Bridge running. Press Ctrl+C to stop."
wait $BRIDGE_PID
