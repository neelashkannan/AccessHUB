# AccessHUB

AccessHUB is a modern file management application that allows you to access and manage files across your devices and networks. It supports both local file browsing and remote access via SSH and Tailscale.

## Features

- Clean, modern user interface with light/dark mode
- File previews for various file types (images, text, PDFs, audio, video)
- Grid and list view options
- File upload with drag-and-drop support
- Directory creation and management
- Breadcrumb navigation
- Supports SSH and Tailscale connectivity
- Responsive design for all device sizes

## Deployment Options

AccessHUB can be deployed in several ways:

### Option 1: Deploy to Vercel with a Separate Proxy Server (Recommended)

This setup provides the best performance and flexibility:

1. **Deploy the frontend to Vercel**

```bash
# Clone the repository
git clone https://github.com/yourusername/accesshub.git
cd accesshub

# Configure Vercel project
vercel
```

2. **Set up the proxy server** on a machine that has access to your private network:

```bash
# Copy proxy files
cp proxy-server.js proxy-package.json .env.example /path/to/your/server/
cd /path/to/your/server

# Rename and configure environment variables
mv proxy-package.json package.json
mv .env.example .env
nano .env  # Edit with your settings

# Install dependencies and start the server
npm install
npm start
```

3. **Update the Vercel project** with your proxy server URL:

```bash
vercel env add PROXY_API_URL
# Enter your proxy server URL (e.g., https://your-proxy-server.com)
vercel --prod
```

### Option 2: Local Development and Testing

```bash
# Start the server
cd server
npm install
npm start

# In a separate terminal, run the client (if using the React client)
cd client
npm install
npm start
```

## Working with Tailscale

AccessHUB can automatically detect and use Tailscale if it's installed on the system where the server is running:

1. Install Tailscale on your server: https://tailscale.com/download
2. Log in to your Tailscale account: `tailscale up`
3. Start AccessHUB server

When you connect, AccessHUB will automatically detect Tailscale and provide the option to browse Tailscale-connected machines.

## Environment Variables

### Server Environment Variables

- `PORT`: Port to run the server on (default: 4000)
- `SESSION_SECRET`: Secret key for session encryption
- `TAILSCALE_ENABLED`: Set to 'true' to force Tailscale detection (default: auto-detect)

### Proxy Server Environment Variables

- `PORT`: Port to run the proxy server on (default: 3001)
- `JWT_SECRET`: Secret key for JWT token generation
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS

## Configuration for Vercel Deployment

The `vercel.json` file configures how the application is deployed to Vercel:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server/index.js",
      "use": "@vercel/node"
    },
    {
      "src": "server/public/**",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "server/index.js"
    },
    {
      "src": "/(.*)",
      "dest": "server/public/$1"
    }
  ]
}
```

## Troubleshooting

### Connectivity Issues

If you're experiencing connection problems in a Vercel deployment:

1. Make sure your proxy server is accessible from the internet
2. Check the CORS settings in your proxy server
3. Verify your JWT_SECRET is correctly set
4. Check network logs in the browser console for specific errors

### SSH Connection Errors

If SSH connections are failing:

1. Ensure the target SSH server accepts password authentication
2. Verify network connectivity between your proxy server and SSH target
3. Check if port 22 (or your custom SSH port) is open on the target server

## License

MIT 

# AccessHUB Deployment Guide

This guide will help you deploy AccessHUB with SSH connectivity on any system.

## Quick Deploy Steps

1. **Install Node.js**
   - Download and install Node.js from [nodejs.org](https://nodejs.org/)
   - Recommended version: 16.x or later

2. **Install Dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Access the Application**
   - From the same machine: http://localhost:4000
   - From other machines on the network: http://[YOUR-SERVER-IP]:4000

## SSH Connection Setup

1. Open AccessHUB in your browser
2. On the login screen, select "SSH Connection"
3. Enter the following details:
   - Host: (IP address or hostname of the SSH server)
   - Port: (usually 22 for SSH)
   - Username: (your SSH username)
   - Password: (your SSH password)
4. Click "Connect" to browse files on the remote SSH server

## Configuration Options

- To change the port, set the PORT environment variable:
  ```bash
  PORT=8080 npm start
  ```

- To make the server accessible from other machines, ensure your firewall allows the port

## Troubleshooting SSH Connections

- Verify the SSH server accepts password authentication
- Check if the SSH server is running and accessible from your deployment machine
- Check your network/firewall settings to ensure the proper ports are open

## Security Considerations

- This application stores SSH credentials in session memory
- For production use, consider implementing more secure authentication
- Default session timeout is 1 hour 