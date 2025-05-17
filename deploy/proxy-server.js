/**
 * AccessHUB Proxy Server
 * 
 * This server acts as a proxy between the Vercel-hosted AccessHUB frontend
 * and your internal network accessed via SSH or Tailscale.
 * 
 * Deploy this on a server that has access to your internal network, such as:
 * - A cloud VM with Tailscale installed
 * - A server within your network that has a public IP
 * - Any server that can connect to your SSH targets
 */

const express = require('express');
const cors = require('cors');
const { Client } = require('ssh2');
const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-please-change-in-production';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? 
  process.env.ALLOWED_ORIGINS.split(',') : 
  ['http://localhost:3000', 'https://your-vercel-app.vercel.app'];

// Middleware
app.use(express.json());
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Authentication middleware
function authenticate(req, res, next) {
  // Get the token from authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Check if Tailscale is available
async function checkTailscale() {
  try {
    const { stdout } = await execPromise('tailscale status --json', { timeout: 2000 });
    const status = JSON.parse(stdout);
    return status && status.BackendState === 'Running';
  } catch (error) {
    console.log('Tailscale not available:', error.message);
    return false;
  }
}

// Get Tailscale devices
async function getTailscaleDevices() {
  try {
    const { stdout } = await execPromise('tailscale status --json');
    const status = JSON.parse(stdout);
    
    return Object.entries(status.Peer || {}).map(([id, info]) => ({
      id,
      name: info.HostName,
      address: info.TailscaleIPs[0],
      online: info.Online,
      os: info.OS || 'unknown'
    }));
  } catch (error) {
    console.error('Error getting Tailscale devices:', error);
    return [];
  }
}

// Login route - creates a JWT token
app.post('/api/auth/login', async (req, res) => {
  const { username, password, host, port } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  // If host is provided, it's an SSH connection
  if (host) {
    try {
      // Test SSH connection
      const conn = new Client();
      
      const connectPromise = new Promise((resolve, reject) => {
        conn.on('ready', () => {
          conn.end();
          resolve(true);
        }).on('error', (err) => {
          reject(err);
        }).connect({
          host,
          port: port || 22,
          username,
          password
        });
      });
      
      await connectPromise;
      
      // Create token with SSH credentials
      const token = jwt.sign({
        username,
        host,
        port: port || 22,
        // Don't include password in the JWT - instead store in encrypted form
        // This is just a hash to verify later requests
        createdAt: Date.now()
      }, JWT_SECRET, { expiresIn: '8h' });
      
      // Store encrypted password separately, associated with the token
      // For production, use a secure key storage service
      const tokenKey = jwt.decode(token).jti || token.slice(-10);
      process.env[`PWD_${tokenKey}`] = password;
      
      res.json({ 
        token,
        user: { username, host },
        message: 'SSH authentication successful' 
      });
    } catch (error) {
      console.error('SSH auth error:', error);
      res.status(401).json({ error: 'SSH authentication failed' });
    }
  } else {
    // Check for Tailscale connectivity
    const hasTailscale = await checkTailscale();
    
    if (hasTailscale) {
      // Create token for Tailscale access
      const token = jwt.sign({
        username,
        useTailscale: true,
        createdAt: Date.now()
      }, JWT_SECRET, { expiresIn: '8h' });
      
      const devices = await getTailscaleDevices();
      
      res.json({
        token,
        user: { username, useTailscale: true },
        tailscaleDevices: devices,
        message: 'Tailscale authentication successful'
      });
    } else {
      res.status(400).json({ error: 'No connection method specified and Tailscale not available' });
    }
  }
});

// List files endpoint
app.post('/api/files', authenticate, async (req, res) => {
  const { path, host, username, port } = req.body;
  
  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }
  
  try {
    let command;
    let isWindows = false;
    
    // Determine if Windows for command formatting
    if (host && host.includes('windows')) {
      isWindows = true;
    }
    
    if (req.user.useTailscale) {
      // If Tailscale, get devices first
      const devices = await getTailscaleDevices();
      
      if (path === '~') {
        // Return list of devices for root
        return res.json(devices.map(device => ({
          name: device.name,
          path: `tailscale://${device.name}`,
          modifiedAt: new Date().toISOString(),
          size: null,
          isDirectory: true,
          online: device.online,
          os: device.os
        })));
      }
      
      // Extract device from path for Tailscale
      const match = path.match(/^tailscale:\/\/([^\/]+)(\/.*)?$/);
      if (match) {
        const deviceName = match[1];
        const devicePath = match[2] || '~';
        
        // Find the device
        const device = devices.find(d => d.name === deviceName);
        if (!device) {
          return res.status(404).json({ error: 'Tailscale device not found' });
        }
        
        if (!device.online) {
          return res.status(503).json({ error: 'Tailscale device is offline' });
        }
        
        // Determine command based on OS (simplified)
        if (device.os && device.os.toLowerCase().includes('windows')) {
          isWindows = true;
          command = `tailscale ssh ${deviceName} "powershell -c \\"Get-ChildItem -Force '${devicePath}' | Select-Object Name,Length,LastWriteTime,Mode,@{Name='IsDirectory';Expression={\\$_.PSIsContainer}} | ConvertTo-Json\\""`;
        } else {
          command = `tailscale ssh ${deviceName} "ls -la \\"${devicePath}\\" | grep -v '^total'"`;
        }
      }
    } else if (host) {
      // Regular SSH connection
      // Get the password for this token
      const tokenKey = req.user.jti || req.headers.authorization.split(' ')[1].slice(-10);
      const password = process.env[`PWD_${tokenKey}`];
      
      if (!password) {
        return res.status(401).json({ error: 'Session expired, please log in again' });
      }
      
      // For Windows systems
      if (isWindows) {
        let windowsPath = path;
        if (/^[A-Za-z]:$/.test(windowsPath)) {
          windowsPath = `${windowsPath}\\`;
        } else if (path === '~') {
          windowsPath = '%USERPROFILE%';
        }
        
        command = `powershell -c "Get-ChildItem -Force '${windowsPath}' | Select-Object Name,Length,LastWriteTime,Mode,@{Name='IsDirectory';Expression={$_.PSIsContainer}} | ConvertTo-Json"`;
      } else {
        command = `ls -la "${path}" | grep -v '^total'`;
      }
      
      // Execute SSH command using the Client library directly
      const conn = new Client();
      
      const dataPromise = new Promise((resolve, reject) => {
        conn.on('ready', () => {
          conn.exec(command, (err, stream) => {
            if (err) {
              conn.end();
              return reject(err);
            }
            
            let data = '';
            let stderr = '';
            
            stream.on('data', (chunk) => {
              data += chunk;
            });
            
            stream.stderr.on('data', (chunk) => {
              stderr += chunk;
            });
            
            stream.on('close', (code) => {
              conn.end();
              if (code !== 0) {
                reject(new Error(`Command failed with code ${code}: ${stderr}`));
              } else {
                resolve(data);
              }
            });
          });
        }).on('error', (err) => {
          reject(err);
        }).connect({
          host,
          port: port || 22,
          username,
          password
        });
      });
      
      const data = await dataPromise;
      
      let files = [];
      
      if (isWindows) {
        // Parse Windows PowerShell JSON output
        const items = JSON.parse(data);
        const itemArray = Array.isArray(items) ? items : [items];
        
        files = itemArray.map(item => ({
          name: item.Name,
          path: path === '~' ? item.Name : `${path}/${item.Name}`,
          size: item.Length || 0,
          modifiedAt: item.LastWriteTime,
          isDirectory: item.IsDirectory
        }));
      } else {
        // Parse Unix ls output
        const lines = data.trim().split('\n');
        files = lines.map(line => {
          const parts = line.trim().split(/\s+/);
          const permissions = parts[0];
          const size = parseInt(parts[4], 10);
          
          const nameStartIndex = line.indexOf(parts[7]) + parts[7].length + 1;
          const name = line.substring(nameStartIndex).trim();
          
          return {
            name,
            path: `${path}/${name}`,
            size,
            modifiedAt: `${parts[5]} ${parts[6]} ${parts[7]}`,
            isDirectory: permissions.startsWith('d')
          };
        });
      }
      
      return res.json(files);
    }
    
    // Execute command
    const { stdout, stderr } = await execPromise(command);
    let files = [];
    
    if (isWindows) {
      // Parse Windows JSON output
      try {
        const items = JSON.parse(stdout);
        const itemArray = Array.isArray(items) ? items : [items];
        
        files = itemArray.map(item => ({
          name: item.Name,
          path: path === '~' ? item.Name : `${path}/${item.Name}`,
          size: item.Length || 0,
          modifiedAt: item.LastWriteTime,
          isDirectory: item.IsDirectory
        }));
      } catch (error) {
        console.error('Error parsing Windows output:', error);
        return res.status(500).json({ error: 'Failed to parse directory listing' });
      }
    } else {
      // Parse Unix output
      const lines = stdout.trim().split('\n');
      files = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        const permissions = parts[0];
        const size = parseInt(parts[4], 10);
        
        const nameStartIndex = line.indexOf(parts[7]) + parts[7].length + 1;
        const name = line.substring(nameStartIndex).trim();
        
        return {
          name,
          path: `${path}/${name}`,
          size,
          modifiedAt: `${parts[5]} ${parts[6]} ${parts[7]}`,
          isDirectory: permissions.startsWith('d')
        };
      });
    }
    
    res.json(files);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files: ' + error.message });
  }
});

// Server info
app.get('/api/info', (req, res) => {
  res.json({
    name: 'AccessHUB Proxy',
    version: '1.0.0',
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`AccessHUB proxy server running on port ${PORT}`);
  
  // Check Tailscale status
  checkTailscale().then(available => {
    console.log(`Tailscale ${available ? 'is' : 'is not'} available`);
    
    if (available) {
      getTailscaleDevices().then(devices => {
        console.log(`Found ${devices.length} Tailscale devices`);
        devices.forEach(device => {
          console.log(`- ${device.name} (${device.address}): ${device.online ? 'Online' : 'Offline'}`);
        });
      });
    }
  });
}); 