#!/bin/bash

# AccessHUB deployment script

echo "╔═══════════════════════════════════════╗"
echo "║       AccessHUB Deployment Tool       ║"
echo "╚═══════════════════════════════════════╝"

# Check if Node.js is installed
if ! command -v node > /dev/null; then
  echo "❌ Node.js is not installed. Please install Node.js first."
  echo "   Visit: https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js $NODE_VERSION detected"

# Check if npm is installed
if ! command -v npm > /dev/null; then
  echo "❌ npm is not installed. Please install npm first."
  exit 1
fi

echo "✅ npm $(npm -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
cd server || exit 1
npm install

# Check IP address for network access
IP_ADDRESS=$(hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || echo "127.0.0.1")
if [ -z "$IP_ADDRESS" ]; then
  IP_ADDRESS="localhost"
fi

# Start the server
echo "🚀 Starting AccessHUB server..."
echo "🌐 Server will be available at:"
echo "   - Local access:  http://localhost:4000"
echo "   - Network access: http://$IP_ADDRESS:4000"
echo ""
echo "📔 See README.md for SSH connection instructions"
echo ""
echo "Press Ctrl+C to stop the server"

# Run the server
npm start 