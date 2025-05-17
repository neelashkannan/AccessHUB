# NAS Storage App

A simple web-based application for using your other system's storage like a cloud or NAS. This app allows you to upload, download, and manage files using a web browser.

## Features

- Web-based file management with a clean interface
- Upload and download files
- Create directories
- Navigate through file system
- Delete files and directories
- Works with Tailscale for secure access

## Requirements

- Node.js (v12 or later)
- npm (included with Node.js)
- Tailscale (for secure remote access)

## Installation

1. Clone or download this repository to your storage server

2. Install server dependencies:
   ```
   cd NAS-app/server
   npm install
   ```

3. Start the server:
   ```
   npm start
   ```
   
   For development with auto-restart:
   ```
   npm run dev
   ```

4. The server will start on port 4000 by default. You can access the web interface at:
   ```
   http://localhost:4000
   ```

## Accessing External System Files

To access files on another system (like a NAS or mounted drive):

### Option 1: Using the start script

1. Use the provided shell script with the path to your external storage:
   ```
   ./start-remote.sh /path/to/external/storage
   ```

   For example:
   ```
   ./start-remote.sh /mnt/nas-drive
   ```

### Option 2: Set environment variable

1. Set the STORAGE_PATH environment variable before starting the server:
   ```
   STORAGE_PATH=/path/to/external/storage node index.js
   ```

### Option 3: For SSH access to remote systems

1. First, mount the remote system locally using sshfs:
   ```
   # Create a mount point
   mkdir -p ~/remote-mount
   
   # Mount the remote system
   sshfs user@remote-server:/path/on/remote ~/remote-mount
   ```

2. Then start the server with the mount point:
   ```
   STORAGE_PATH=~/remote-mount node index.js
   ```

3. To unmount when done:
   ```
   fusermount -u ~/remote-mount   # On Linux
   umount ~/remote-mount          # On macOS
   ```

## Using with Tailscale

To securely access your NAS storage from anywhere:

1. Install Tailscale on both your storage server and your client devices

2. Connect all devices to your Tailscale network

3. Access your NAS app using the Tailscale IP of your storage server:
   ```
   http://YOUR_TAILSCALE_IP:4000
   ```

## Configuration

You can configure the port and storage directory by modifying the `index.js` file:

- `PORT`: Change the port the server listens on (default: 4000)
- `STORAGE_BASE`: Change the directory where files are stored (defaults to the value of STORAGE_PATH environment variable or `/storage` in the server directory)

## Security Notes

- This app does not include user authentication by default. If exposed publicly, add authentication or use Tailscale for secure access
- For additional security, consider setting up HTTPS

## License

MIT 