const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const fs = require('fs-extra');
const path = require('path');
const session = require('express-session');
const { Client } = require('ssh2');
const { execSync } = require('child_process');
const os = require('os');
const connectionManager = require('./connection-manager');

const app = express();
const PORT = process.env.PORT || 4000;

// Set up session
app.use(session({
  secret: 'ssh-nas-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 3600000 } // 1 hour
}));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(fileUpload({
  createParentPath: true,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
}));

// Create public directory for static assets
const PUBLIC_DIR = path.join(__dirname, 'public');
fs.ensureDirSync(PUBLIC_DIR);

// Local storage as fallback
const LOCAL_STORAGE = path.join(__dirname, 'storage');
fs.ensureDirSync(LOCAL_STORAGE);

// Get platform type
const platform = os.platform();
console.log('Operating system platform:', platform);

// Detect if running on macOS
const isMacOS = platform === 'darwin';
console.log('Is macOS:', isMacOS);

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  // Allow local file browsing mode without SSH
  if (req.session.useLocalFiles) {
    return next();
  }
  
  if (req.session.sshConfig) {
    return next();
  }
  
  if (req.path === '/login.html' || req.path === '/api/ssh/connect' || req.path === '/api/local/connect') {
    return next();
  }
  
  if (req.path === '/') {
    return res.redirect('/login.html');
  }
  
  // For API requests that require authentication
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized. Please login first.' });
  }
  
  return res.redirect('/login.html');
};

// Apply authentication middleware
app.use(isAuthenticated);

// Routes
app.get('/', (req, res) => {
  if (!req.session.sshConfig) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SSH connection
app.post('/api/ssh/connect', async (req, res) => {
  const { host, port, username, password } = req.body;
  
  if (!host || !username || !password) {
    return res.status(400).json({ error: 'Host, username, and password are required' });
  }
  
  try {
    // Test SSH connection
    const conn = new Client();
    
    const connectPromise = new Promise((resolve, reject) => {
      conn.on('ready', () => {
        conn.end();
        resolve();
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
    
    // Store credentials in session
    req.session.sshConfig = {
      host,
      port: port || 22,
      username,
      password
    };
    
    return res.json({ success: true, message: 'SSH connection successful' });
  } catch (error) {
    console.error('SSH connection error:', error);
    return res.status(401).json({ error: 'Failed to connect: ' + error.message });
  }
});

// New endpoint for local file access
app.post('/api/local/connect', (req, res) => {
  // Set session to use local files mode
  req.session.useLocalFiles = true;
  
  return res.json({ success: true, message: 'Local file access enabled' });
});

// Modify Logout
app.get('/api/ssh/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Execute SSH commands to list files
const executeSSHCommand = async (sshConfig, command) => {
  try {
    console.log(`Executing command: ${command}`);
    
    // Try to use the ConnectionManager
    const result = await connectionManager.executeCommand({
      host: sshConfig.host,
      port: sshConfig.port,
      username: sshConfig.username,
      password: sshConfig.password,
      command
    });
    
    console.log(`Command executed using ${connectionManager.getConnectionInfo().method} method`);
    
    // Return just the data part of the result
    return result.data;
  } catch (error) {
    console.error(`Command execution failed: ${error.message}`);
    
    // Fall back to traditional SSH if the connection manager fails
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        console.log(`SSH ready, executing command: ${command}`);
        
        conn.exec(command, (err, stream) => {
          if (err) {
            console.error('SSH exec error:', err);
            conn.end();
            return reject(err);
          }
          
          let data = '';
          let stderr = '';
          
          stream.on('data', (chunk) => {
            console.log('SSH data chunk:', chunk.toString());
            data += chunk;
          });
          
          stream.stderr.on('data', (chunk) => {
            console.error('SSH stderr:', chunk.toString());
            stderr += chunk;
          });
          
          stream.on('close', (code, signal) => {
            console.log(`SSH stream closed with code ${code}`);
            conn.end();
            if (code !== 0) {
              reject(new Error(`Command failed with code ${code}: ${stderr}`));
            } else {
              resolve(data);
            }
          });
          
          stream.on('error', (err) => {
            console.error('SSH stream error:', err);
            conn.end();
            reject(err);
          });
        });
      }).on('error', (err) => {
        console.error('SSH connection error:', err);
        reject(err);
      }).connect(sshConfig);
    });
  }
};

// List files using SSH
app.get('/api/files', async (req, res) => {
  const currentPath = req.query.path || '~';
  
  // Check if we're using local file mode
  if (req.session.useLocalFiles) {
    try {
      let directoryToList = currentPath;
      
      // Handle special cases for root directories
      if (currentPath === '~' || currentPath === '/' || currentPath === '\\') {
        // If at root path, show volumes and key directories
        console.log('Listing local macOS volumes...');
        
        // Get list of mounted volumes on macOS
        const files = [];
        
        // Add home directory
        files.push({
          name: 'Home Directory',
          path: os.homedir(),
          size: 0,
          modifiedAt: new Date().toISOString(),
          isDirectory: true
        });
        
        // Add common directories
        files.push({
          name: 'Applications',
          path: '/Applications',
          size: 0,
          modifiedAt: new Date().toISOString(),
          isDirectory: true
        });
        
        files.push({
          name: 'Documents',
          path: path.join(os.homedir(), 'Documents'),
          size: 0,
          modifiedAt: new Date().toISOString(),
          isDirectory: true
        });
        
        files.push({
          name: 'Downloads',
          path: path.join(os.homedir(), 'Downloads'),
          size: 0,
          modifiedAt: new Date().toISOString(),
          isDirectory: true
        });
        
        // Add the current working directory
        files.push({
          name: 'AccessHUB Server',
          path: process.cwd(),
          size: 0,
          modifiedAt: new Date().toISOString(),
          isDirectory: true
        });
        
        // List volumes from /Volumes if on macOS
        if (isMacOS) {
          const volumesDir = '/Volumes';
          if (fs.existsSync(volumesDir)) {
            try {
              const volumes = fs.readdirSync(volumesDir);
              
              for (const volume of volumes) {
                // Skip the main system volume that's already represented by '/'
                if (volume === 'Macintosh HD') continue;
                
                try {
                  const volumePath = path.join(volumesDir, volume);
                  const stats = fs.statSync(volumePath);
                  
                  files.push({
                    name: `${volume} (Drive)`,
                    path: volumePath,
                    size: 0,
                    modifiedAt: stats.mtime.toISOString(),
                    isDirectory: true
                  });
                } catch (err) {
                  console.error(`Error accessing volume ${volume}:`, err);
                  // Skip volumes we can't access
                }
              }
            } catch (err) {
              console.error('Error listing volumes:', err);
            }
          }
          
          // Also try to get mounted network shares
          try {
            // On macOS, network shares are typically mounted in /Volumes
            const networkDir = '/Volumes';
            if (fs.existsSync(networkDir)) {
              const items = fs.readdirSync(networkDir);
              
              for (const item of items) {
                try {
                  const itemPath = path.join(networkDir, item);
                  const stats = fs.statSync(itemPath);
                  
                  // Add if not already added
                  if (stats.isDirectory() && !files.some(f => f.path === itemPath)) {
                    files.push({
                      name: `${item} (Network)`,
                      path: itemPath,
                      size: 0,
                      modifiedAt: stats.mtime.toISOString(),
                      isDirectory: true
                    });
                  }
                } catch (err) {
                  // Skip items we can't access
                }
              }
            }
          } catch (err) {
            console.error('Error listing network shares:', err);
          }
        }
        
        return res.json(files);
      }
      
      // For any other path, resolve home path if needed
      if (currentPath === '~') {
        directoryToList = os.homedir();
      }
      
      // For any other path, list the directory contents
      console.log(`Listing local directory: ${directoryToList}`);
      const dirContents = fs.readdirSync(directoryToList);
      const files = [];
      
      for (const item of dirContents) {
        try {
          const itemPath = path.join(directoryToList, item);
          const stats = fs.statSync(itemPath);
          
          files.push({
            name: item,
            path: itemPath,
            size: stats.isFile() ? stats.size : 0,
            modifiedAt: stats.mtime.toISOString(),
            isDirectory: stats.isDirectory()
          });
        } catch (err) {
          console.error(`Error accessing ${item}:`, err);
          // Skip items we can't access
        }
      }
      
      return res.json(files);
    } catch (error) {
      console.error('Error listing local files:', error);
      return res.status(500).json({ error: `Failed to list local files: ${error.message}` });
    }
  }
  
  // Check if SSH config exists for remote access
  if (!req.session.sshConfig) {
    return res.status(401).json({ error: 'SSH connection required' });
  }
  
  try {
    // Check if we're connecting to Windows by checking username/host
    const isWindows = true; // Assume Windows for now
    
    // Special case for Windows root to show all drives
    if (isWindows && (currentPath === '~' || currentPath === '/' || currentPath === '\\')) {
      // List all drives on Windows
      const drivesCommand = `powershell -c "Get-PSDrive -PSProvider 'FileSystem' | Select-Object Name,Root | ConvertTo-Json"`;
      console.log("Executing Windows drives command:", drivesCommand);
      
      const drivesData = await executeSSHCommand(req.session.sshConfig, drivesCommand);
      console.log("Drives command output:", drivesData);
      
      try {
        const drives = JSON.parse(drivesData);
        const driveArray = Array.isArray(drives) ? drives : [drives];
        
        const files = driveArray.map(drive => {
          return {
            name: `${drive.Name}:`,
            path: `${drive.Name}:`,
            size: 0,
            modifiedAt: new Date().toISOString(),
            isDirectory: true
          };
        });
        
        res.json(files);
        return;
      } catch (error) {
        console.error("Error parsing Windows drives output:", error);
        // Continue with fallback method
      }
    }
    
    // Different commands for Windows vs Unix
    let lsCommand;
    
    if (isWindows) {
      // For Windows use PowerShell commands
      // If we're showing a drive root (like "C:"), add a backslash
      let windowsPath = currentPath;
      if (/^[A-Za-z]:$/.test(windowsPath)) {
        windowsPath = `${windowsPath}\\`;
      } else if (currentPath === '~') {
        windowsPath = '%USERPROFILE%';
      }
      
      lsCommand = `powershell -c "Get-ChildItem -Force '${windowsPath}' | Select-Object Name,Length,LastWriteTime,Mode,@{Name='IsDirectory';Expression={$_.PSIsContainer}} | ConvertTo-Json"`;
      console.log("Executing Windows command:", lsCommand);
    } else {
      // For Unix systems
      lsCommand = `ls -la "${currentPath}" | grep -v '^total'`;
      console.log("Executing Unix command:", lsCommand);
    }
    
    console.log("SSH Config:", { ...req.session.sshConfig, password: '******' });
    const data = await executeSSHCommand(req.session.sshConfig, lsCommand);
    console.log("Command output:", data);
    
    let files = [];
    
    if (isWindows) {
      try {
        // Try to parse JSON output from PowerShell
        const items = JSON.parse(data);
        
        // Handle both single item (object) and multiple items (array)
        const itemArray = Array.isArray(items) ? items : [items];
        
        files = itemArray.map(item => {
          const isDirectory = item.IsDirectory;
          // Handle Windows paths (convert backslashes to forward slashes)
          const name = item.Name;
          const itemPath = currentPath === '~' 
            ? name 
            : path.posix.join(currentPath, name).replace(/\\/g, '/');
          
          return {
            name,
            path: itemPath,
            size: item.Length || 0,
            modifiedAt: item.LastWriteTime,
            isDirectory
          };
        });
      } catch (error) {
        console.error("Error parsing Windows JSON output:", error);
        // Fallback to basic text parsing if JSON parsing fails
        res.status(500).json({ 
          error: 'Failed to parse directory listing', 
          details: error.message,
          rawOutput: data
        });
        return;
      }
    } else {
      // Original Unix parsing
      const lines = data.trim().split('\n');
      files = lines.map(line => {
        const parts = line.trim().split(/\s+/);
        const permissions = parts[0];
        const owner = parts[2];
        const group = parts[3];
        const size = parseInt(parts[4], 10);
        
        // Get date parts
        const month = parts[5];
        const day = parts[6];
        const yearOrTime = parts[7];
        
        // Get filename (might contain spaces)
        const nameStartIndex = line.indexOf(yearOrTime) + yearOrTime.length + 1;
        const name = line.substring(nameStartIndex).trim();
        
        const isDirectory = permissions.startsWith('d');
        
        return {
          name,
          path: path.join(currentPath, name).replace(/\\/g, '/'),
          size,
          permissions,
          owner,
          group,
          modifiedAt: `${month} ${day} ${yearOrTime}`,
          isDirectory
        };
      });
    }
    
    res.json(files);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      command: 'ls command failed'
    });
  }
});

// Download a file
app.get('/api/download', async (req, res) => {
  const filePath = req.query.path;
  
  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }
  
  // Handle local file mode
  if (req.session.useLocalFiles) {
    try {
      // Check if the file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      // Check if it's a regular file
      const stats = fs.statSync(filePath);
      
      if (!stats.isFile()) {
        return res.status(400).json({ error: 'The requested path is not a file' });
      }
      
      // Get file extension for content type
      const extension = path.extname(filePath).toLowerCase().substring(1);
      
      // Set content type based on file extension for proper preview
      const contentTypes = {
        // Images
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        // Documents
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'md': 'text/markdown',
        'html': 'text/html',
        'htm': 'text/html',
        'css': 'text/css',
        'js': 'text/javascript',
        'json': 'application/json',
        'xml': 'application/xml',
        'csv': 'text/csv',
        // Audio
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        // Video
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'avi': 'video/x-msvideo',
        'mov': 'video/quicktime',
        'wmv': 'video/x-ms-wmv',
        // Archives
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',
        '7z': 'application/x-7z-compressed',
      };
      
      // Check if request has a 'preview' query param to handle previews differently from downloads
      const isPreview = req.query.preview === 'true';
      
      // Set appropriate headers
      const contentType = contentTypes[extension] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      
      // Only set Content-Disposition for downloads, not for previews
      if (!isPreview) {
        const fileName = path.basename(filePath);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
      }
      
      // Send the file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      return;
    } catch (error) {
      console.error('Error downloading local file:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  if (!req.session.sshConfig) {
    return res.status(401).json({ error: 'SSH connection required' });
  }
  
  try {
    // Create a temporary file to store the downloaded content
    const fileName = path.basename(filePath);
    const tempFilePath = path.join(LOCAL_STORAGE, `temp_${Date.now()}_${fileName}`);
    
    // Create SSH connection
    const conn = new Client();
    
    const downloadPromise = new Promise((resolve, reject) => {
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          
          // Create a read stream from the remote file
          const readStream = sftp.createReadStream(filePath);
          const writeStream = fs.createWriteStream(tempFilePath);
          
          readStream.on('error', (err) => {
            conn.end();
            reject(err);
          });
          
          writeStream.on('error', (err) => {
            conn.end();
            reject(err);
          });
          
          writeStream.on('close', () => {
            conn.end();
            resolve();
          });
          
          // Pipe the remote file to the local file
          readStream.pipe(writeStream);
        });
      }).on('error', (err) => {
        reject(err);
      }).connect(req.session.sshConfig);
    });
    
    await downloadPromise;
    
    // Send the file to the client
    res.download(tempFilePath, fileName, (err) => {
      // Delete the temporary file after it's sent
      fs.unlink(tempFilePath).catch(err => console.error('Error deleting temp file:', err));
      
      if (err) {
        console.error('Error sending file:', err);
      }
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload a file
app.post('/api/upload', (req, res) => {
  // Check for local file mode
  if (req.session.useLocalFiles) {
    try {
      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ message: 'No files were uploaded' });
      }
      
      const currentPath = req.body.path || '~';
      const file = req.files.file;
      
      // Determine the target path
      let targetDir = currentPath;
      if (currentPath === '~') {
        targetDir = os.homedir();
      }
      
      console.log(`Uploading file to local path: ${targetDir}`);
      
      // Create a full path for the uploaded file
      const uploadPath = path.join(targetDir, file.name);
      
      // Move the file to the target directory
      file.mv(uploadPath, (err) => {
        if (err) {
          console.error('Error uploading file:', err);
          return res.status(500).json({ error: err.message });
        }
        
        res.json({
          message: 'File uploaded successfully',
          file: {
            name: file.name,
            size: file.size,
            mimetype: file.mimetype
          }
        });
      });
      
      return;
    } catch (error) {
      console.error('Error in upload handler:', error);
      res.status(500).json({ error: error.message });
      return;
    }
  }
  
  // Original SSH-based upload code
  if (!req.session.sshConfig) {
    return res.status(401).json({ error: 'SSH connection required' });
  }
  
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: 'No files were uploaded' });
    }
    
    const currentPath = req.body.path || '~';
    const file = req.files.file;
    
    // Save file locally first
    const tempFilePath = path.join(LOCAL_STORAGE, `temp_${Date.now()}_${file.name}`);
    
    file.mv(tempFilePath, async (err) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      try {
        // Then upload to remote server via SFTP
        const conn = new Client();
        
        const uploadPromise = new Promise((resolve, reject) => {
          conn.on('ready', () => {
            conn.sftp((err, sftp) => {
              if (err) {
                conn.end();
                return reject(err);
              }
              
              const remoteFilePath = path.posix.join(currentPath, file.name);
              const readStream = fs.createReadStream(tempFilePath);
              const writeStream = sftp.createWriteStream(remoteFilePath);
              
              writeStream.on('close', () => {
                conn.end();
                resolve();
              });
              
              writeStream.on('error', (err) => {
                conn.end();
                reject(err);
              });
              
              readStream.pipe(writeStream);
            });
          }).on('error', (err) => {
            reject(err);
          }).connect(req.session.sshConfig);
        });
        
        await uploadPromise;
        
        // Delete the temporary file
        await fs.unlink(tempFilePath);
        
        res.json({
          message: 'File uploaded successfully',
          file: {
            name: file.name,
            size: file.size,
            mimetype: file.mimetype
          }
        });
      } catch (error) {
        // Clean up temp file if upload fails
        await fs.unlink(tempFilePath).catch(err => console.error('Error deleting temp file:', err));
        res.status(500).json({ error: error.message });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a file via SSH
app.delete('/api/delete', async (req, res) => {
  const filePath = req.query.path;
  
  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }
  
  // Handle local file mode
  if (req.session.useLocalFiles) {
    try {
      // Check if the path exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File or directory not found' });
      }
      
      // Check if it's a directory or file
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        // Remove directory recursively
        fs.rmdirSync(filePath, { recursive: true });
      } else {
        // Remove file
        fs.unlinkSync(filePath);
      }
      
      res.json({ message: 'Item deleted successfully' });
      return;
    } catch (error) {
      console.error('Error deleting local item:', error);
      res.status(500).json({ error: error.message });
      return;
    }
  }
  
  if (!req.session.sshConfig) {
    return res.status(401).json({ error: 'SSH connection required' });
  }
  
  try {
    // Check if we're on Windows
    const isWindows = true; // Assume Windows for now
    
    if (isWindows) {
      let deleteCommand;
      // PowerShell command to check if path is a directory
      const checkDirCommand = `powershell -c "if (Test-Path -Path '${filePath}' -PathType Container) { Write-Output 'directory' } else { Write-Output 'file' }"`;
      console.log("Executing Windows check directory command:", checkDirCommand);
      const fileType = (await executeSSHCommand(req.session.sshConfig, checkDirCommand)).trim();
      
      if (fileType === 'directory') {
        // Use PowerShell to remove directory
        deleteCommand = `powershell -c "Remove-Item -Path '${filePath}' -Recurse -Force"`;
      } else {
        // Use PowerShell to remove file
        deleteCommand = `powershell -c "Remove-Item -Path '${filePath}' -Force"`;
      }
      
      console.log("Executing Windows delete command:", deleteCommand);
      await executeSSHCommand(req.session.sshConfig, deleteCommand);
    } else {
      // Check if it's a directory or a file first
      const statCommand = `if [ -d "${filePath}" ]; then echo "directory"; else echo "file"; fi`;
      const fileType = (await executeSSHCommand(req.session.sshConfig, statCommand)).trim();
      
      // Delete command based on file type
      let deleteCommand;
      if (fileType === 'directory') {
        deleteCommand = `rm -rf "${filePath}"`;
      } else {
        deleteCommand = `rm -f "${filePath}"`;
      }
      
      await executeSSHCommand(req.session.sshConfig, deleteCommand);
    }
    
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create directory via SSH
app.post('/api/directory', async (req, res) => {
  const { name, path: currentPath = '~' } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Directory name is required' });
  }
  
  // Check for local file mode
  if (req.session.useLocalFiles) {
    try {
      // Determine the target path
      let targetDir = currentPath;
      if (currentPath === '~') {
        targetDir = os.homedir();
      }
      
      console.log(`Creating directory in local path: ${targetDir}`);
      
      // Create the full path for the new directory
      const newDirPath = path.join(targetDir, name);
      
      // Check if directory already exists
      if (fs.existsSync(newDirPath)) {
        return res.status(400).json({ error: 'Directory already exists' });
      }
      
      // Create the directory
      fs.mkdirSync(newDirPath, { recursive: true });
      
      res.json({ message: 'Directory created successfully' });
      return;
    } catch (error) {
      console.error('Error creating local directory:', error);
      res.status(500).json({ error: error.message });
      return;
    }
  }
  
  if (!req.session.sshConfig) {
    return res.status(401).json({ error: 'SSH connection required' });
  }
  
  try {
    // Check if we're on Windows
    const isWindows = true; // Assume Windows for now
    
    let dirPath;
    let mkdirCommand;
    
    if (isWindows) {
      // Handle Windows path construction
      if (currentPath === '~') {
        // Use user profile for home directory
        dirPath = `%USERPROFILE%\\${name}`;
      } else if (/^[A-Za-z]:$/.test(currentPath)) {
        // Handle drive root (like "C:")
        dirPath = `${currentPath}\\${name}`;
      } else {
        // Normal path
        dirPath = path.win32.join(currentPath, name);
      }
      
      // PowerShell command to create directory
      mkdirCommand = `powershell -c "New-Item -Path '${dirPath}' -ItemType Directory -Force"`;
      console.log("Executing Windows mkdir command:", mkdirCommand);
    } else {
      // Unix path and command
      dirPath = path.posix.join(currentPath, name);
      mkdirCommand = `mkdir -p "${dirPath}"`;
    }
    
    await executeSSHCommand(req.session.sshConfig, mkdirCommand);
    
    res.json({ message: 'Directory created successfully' });
  } catch (error) {
    console.error('Error creating directory:', error);
    res.status(500).json({ error: error.message });
  }
});

// Initialize the connection manager
(async () => {
  try {
    await connectionManager.initialize();
    console.log(`Connection method: ${connectionManager.getConnectionInfo().method}`);
    
    // If Tailscale is available, log the available devices
    if (connectionManager.getConnectionInfo().method === 'tailscale') {
      const devices = await connectionManager.getTailscaleDevices();
      console.log(`Found ${devices.length} Tailscale devices`);
      devices.forEach(device => {
        console.log(`- ${device.name} (${device.address}): ${device.online ? 'Online' : 'Offline'}`);
      });
    }
  } catch (error) {
    console.error('Error initializing connection manager:', error);
  }
})();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the NAS storage at: http://localhost:${PORT}`);
});