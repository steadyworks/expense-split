#!/bin/bash
set -e

python3 /app/backend/main.py &
node /app/frontend/server.js &
