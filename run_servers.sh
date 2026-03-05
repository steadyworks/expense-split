#!/bin/bash
set -e

# Start backend
cd /app/backend
pip install -r requirements.txt
python main.py &

# Start frontend
cd /app/frontend
npm install
npm run dev &
