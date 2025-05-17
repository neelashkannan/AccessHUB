#!/bin/bash

# Default path if none is provided
DEFAULT_PATH="$HOME/remote-storage"

# Get the external path from argument or use default
EXTERNAL_PATH=${1:-$DEFAULT_PATH}

# Ensure external path exists
mkdir -p "$EXTERNAL_PATH"

# Start the server with the external path
echo "Starting NAS Storage Server with remote path: $EXTERNAL_PATH"
STORAGE_PATH="$EXTERNAL_PATH" node index.js 