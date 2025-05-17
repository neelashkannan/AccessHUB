const { exec } = require('child_process');
const { Client } = require('ssh2');
const util = require('util');
const os = require('os');
const fs = require('fs');
const path = require('path');
const execPromise = util.promisify(exec);

class ConnectionManager {
  constructor() {
    this.isVercelEnvironment = process.env.VERCEL === '1';
    this.connectionMethod = null;
    this.proxyApiUrl = process.env.PROXY_API_URL || 'https://your-proxy-server.com';
  }

  /**
   * Initializes the connection manager by determining the best available 
   * connection method based on the current environment
   */
  async initialize() {
    console.log('Initializing connection manager...');
    
    // Check if running in Vercel environment
    if (this.isVercelEnvironment) {
      console.log('Running in Vercel environment, using proxy API');
      this.connectionMethod = 'proxy-api';
      return;
    }
    
    // Check for Tailscale
    if (await this.isTailscaleAvailable()) {
      console.log('Tailscale detected, using Tailscale for connectivity');
      this.connectionMethod = 'tailscale';
      return;
    }
    
    // Default to direct SSH
    console.log('Using direct SSH connection');
    this.connectionMethod = 'direct-ssh';
  }
  
  /**
   * Checks if Tailscale is available on the system
   */
  async isTailscaleAvailable() {
    try {
      // Different checks based on operating system
      const platform = os.platform();
      
      if (platform === 'darwin' || platform === 'linux') {
        // Check for tailscale binary
        const { stdout, stderr } = await execPromise('which tailscale || command -v tailscale');
        if (stdout && stdout.trim()) {
          // Verify tailscale is running
          const { stdout: statusOut } = await execPromise('tailscale status --json', { timeout: 2000 });
          const status = JSON.parse(statusOut);
          return status && status.BackendState === 'Running';
        }
      } else if (platform === 'win32') {
        // Check for Tailscale on Windows
        const tailscalePath = path.join(process.env['ProgramFiles'], 'Tailscale', 'tailscale.exe');
        if (fs.existsSync(tailscalePath)) {
          const { stdout: statusOut } = await execPromise('"' + tailscalePath + '" status --json', { timeout: 2000 });
          const status = JSON.parse(statusOut);
          return status && status.BackendState === 'Running';
        }
      }
      
      return false;
    } catch (error) {
      console.log('Error checking for Tailscale:', error.message);
      return false;
    }
  }
  
  /**
   * Get all tailscale devices
   */
  async getTailscaleDevices() {
    if (this.connectionMethod !== 'tailscale') {
      throw new Error('Tailscale is not available');
    }
    
    try {
      const { stdout } = await execPromise('tailscale status --json');
      const status = JSON.parse(stdout);
      
      // Format devices into a usable format
      return Object.entries(status.Peer || {}).map(([id, info]) => ({
        id,
        name: info.HostName,
        address: info.TailscaleIPs[0],
        online: info.Online,
        os: info.OS || 'unknown'
      }));
    } catch (error) {
      console.error('Error getting Tailscale devices:', error);
      throw error;
    }
  }
  
  /**
   * Execute a command via the appropriate connection method
   */
  async executeCommand(options) {
    const { host, port, username, password, command, path } = options;
    
    switch (this.connectionMethod) {
      case 'tailscale':
        return this.executeTailscaleCommand(options);
      
      case 'direct-ssh':
        return this.executeSSHCommand(options);
      
      case 'proxy-api':
        return this.executeViaProxyApi(options);
      
      default:
        throw new Error('No valid connection method available');
    }
  }
  
  /**
   * Execute a command via Tailscale SSH
   */
  async executeTailscaleCommand(options) {
    const { host, command } = options;
    
    try {
      // Use tailscale ssh to execute the command
      const { stdout, stderr } = await execPromise(`tailscale ssh ${host} "${command.replace(/"/g, '\\"')}"`);
      
      return {
        success: true,
        data: stdout,
        error: stderr || null
      };
    } catch (error) {
      console.error('Error executing Tailscale command:', error);
      throw error;
    }
  }
  
  /**
   * Execute a command via direct SSH
   */
  async executeSSHCommand(options) {
    const { host, port, username, password, command } = options;
    
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          
          let data = '';
          let errorData = '';
          
          stream.on('data', (chunk) => {
            data += chunk;
          });
          
          stream.stderr.on('data', (chunk) => {
            errorData += chunk;
          });
          
          stream.on('close', () => {
            conn.end();
            resolve({ 
              success: true, 
              data, 
              error: errorData || null 
            });
          });
        });
      }).connect({
        host,
        port: port || 22,
        username,
        password
      });
      
      conn.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Execute a command via proxy API (for Vercel deployment)
   */
  async executeViaProxyApi(options) {
    const { host, port, username, password, command, path } = options;
    
    try {
      const response = await fetch(`${this.proxyApiUrl}/api/ssh/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.PROXY_API_TOKEN}`
        },
        body: JSON.stringify({ host, port, username, password, command, path })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to execute command via proxy');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error executing via proxy API:', error);
      throw error;
    }
  }
  
  /**
   * List files using the appropriate connection method
   */
  async listFiles(options) {
    const { path, ...connectionOptions } = options;
    
    // Create an appropriate command based on the target system
    // This is a simplified example - you might need to adapt based on the target OS
    const command = `powershell -c "Get-ChildItem -Force '${path}' | Select-Object Name,Length,LastWriteTime,Mode,@{Name='IsDirectory';Expression={$_.PSIsContainer}} | ConvertTo-Json"`;
    
    return this.executeCommand({
      ...connectionOptions,
      command,
      path
    });
  }
  
  /**
   * Get connection method information
   */
  getConnectionInfo() {
    return {
      method: this.connectionMethod,
      isVercelEnvironment: this.isVercelEnvironment
    };
  }
}

module.exports = new ConnectionManager(); 