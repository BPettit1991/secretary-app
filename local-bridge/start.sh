#!/bin/bash
# SECRETARY — Local Bridge
# Mac Mini (Ventura via OCLP)
# Run: chmod +x start.sh && ./start.sh

echo "Starting SECRETARY local bridge..."
node "$(dirname "$0")/server.js"
