// Global state
let currentPath = '~';
let currentViewMode = 'list'; // 'list' or 'grid'
let fileCache = {}; // Cache for files in each directory
let directoryTree = {
    name: 'Root',
    path: '~',
    isDirectory: true,
    children: [],
    expanded: true
};

// DOM Elements
const fileList = document.getElementById('file-list');
const fileTableBody = document.getElementById('file-table-body');
const gridView = document.getElementById('grid-view');
const emptyMessage = document.getElementById('empty-message');
const loadingIndicator = document.getElementById('loading');
const refreshButton = document.getElementById('refresh-btn');
const breadcrumb = document.getElementById('breadcrumb');
const dropArea = document.getElementById('modal-drop-area');
const gridViewBtn = document.getElementById('grid-view-btn');
const listViewBtn = document.getElementById('list-view-btn');
const themeToggle = document.getElementById('theme-toggle');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

// Create elements for preview modal
const previewModal = document.createElement('div');
previewModal.className = 'preview-modal';
previewModal.style.display = 'none';
previewModal.innerHTML = `
    <div class="preview-content">
        <div class="preview-header">
            <span class="preview-title">File Preview</span>
            <button class="preview-close">&times;</button>
        </div>
        <div class="preview-body">
            <div class="preview-loading">Loading preview...</div>
            <div class="preview-container"></div>
        </div>
    </div>
`;
document.body.appendChild(previewModal);

const previewContainer = previewModal.querySelector('.preview-container');
const previewLoading = previewModal.querySelector('.preview-loading');
const previewTitle = previewModal.querySelector('.preview-title');
const previewClose = previewModal.querySelector('.preview-close');

// Create elements for directory creation modal
const createDirModal = document.createElement('div');
createDirModal.className = 'modal directory-modal';
createDirModal.style.display = 'none';
createDirModal.innerHTML = `
    <div class="modal-content">
        <div class="modal-header">
            <span class="modal-title">Create New Directory</span>
            <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
            <form id="modal-directory-form">
                <div class="form-group">
                    <label for="modal-directory-name">Directory Name</label>
                    <input type="text" id="modal-directory-name" placeholder="Enter directory name" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="create-btn">Create</button>
                    <button type="button" class="cancel-btn">Cancel</button>
                </div>
            </form>
            <div id="modal-directory-message" class="message"></div>
        </div>
    </div>
`;
document.body.appendChild(createDirModal);

// Create elements for file upload modal
const uploadModal = document.createElement('div');
uploadModal.className = 'modal upload-modal';
uploadModal.style.display = 'none';
uploadModal.innerHTML = `
    <div class="modal-content">
        <div class="modal-header">
            <span class="modal-title">Upload Files</span>
            <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
            <form id="modal-upload-form">
                <div class="form-group">
                    <div class="modal-drop-area" id="modal-drop-area">
                        <div class="drop-message">
                            <i class="fas fa-cloud-upload-alt"></i>
                            <p>Drag files here or click to browse</p>
                        </div>
                        <input type="file" id="modal-file-input" class="file-input" multiple>
                    </div>
                    <div class="progress-container" id="modal-progress-container">
                        <div class="progress-bar" id="modal-progress-bar">
                            <div class="progress" id="modal-progress"></div>
                        </div>
                        <div class="progress-text" id="modal-progress-text">0%</div>
                    </div>
                </div>
                <div class="form-actions">
                    <button type="submit" class="upload-btn">Upload</button>
                    <button type="button" class="cancel-btn">Cancel</button>
                </div>
            </form>
            <div id="modal-upload-message" class="message"></div>
        </div>
    </div>
`;
document.body.appendChild(uploadModal);

const modalDirectoryForm = document.getElementById('modal-directory-form');
const modalDirectoryName = document.getElementById('modal-directory-name');
const modalDirectoryMessage = document.getElementById('modal-directory-message');
const modalDirCloseBtn = createDirModal.querySelector('.modal-close');
const modalDirCancelBtn = createDirModal.querySelector('.cancel-btn');

const modalUploadForm = document.getElementById('modal-upload-form');
const modalFileInput = document.getElementById('modal-file-input');
const modalDropArea = document.getElementById('modal-drop-area');
const modalProgressContainer = document.getElementById('modal-progress-container');
const modalProgress = document.getElementById('modal-progress');
const modalProgressText = document.getElementById('modal-progress-text');
const modalUploadMessage = document.getElementById('modal-upload-message');
const modalUploadCloseBtn = uploadModal.querySelector('.modal-close');
const modalUploadCancelBtn = uploadModal.querySelector('.cancel-btn');

// Close preview when clicking the close button
previewClose.addEventListener('click', () => {
    previewModal.style.display = 'none';
    previewContainer.innerHTML = '';
});

// Close preview when clicking outside the modal
previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        previewModal.style.display = 'none';
        previewContainer.innerHTML = '';
    }
});

// Close directory modal when clicking close button
modalDirCloseBtn.addEventListener('click', () => {
    createDirModal.style.display = 'none';
    modalDirectoryName.value = '';
    modalDirectoryMessage.textContent = '';
    modalDirectoryMessage.className = 'message';
});

// Close directory modal when clicking cancel button
modalDirCancelBtn.addEventListener('click', () => {
    createDirModal.style.display = 'none';
    modalDirectoryName.value = '';
    modalDirectoryMessage.textContent = '';
    modalDirectoryMessage.className = 'message';
});

// Close directory modal when clicking outside the modal
createDirModal.addEventListener('click', (e) => {
    if (e.target === createDirModal) {
        createDirModal.style.display = 'none';
        modalDirectoryName.value = '';
        modalDirectoryMessage.textContent = '';
        modalDirectoryMessage.className = 'message';
    }
});

// Close upload modal when clicking close button
modalUploadCloseBtn.addEventListener('click', () => {
    uploadModal.style.display = 'none';
    resetUploadModal();
});

// Close upload modal when clicking cancel button
modalUploadCancelBtn.addEventListener('click', () => {
    uploadModal.style.display = 'none';
    resetUploadModal();
});

// Close upload modal when clicking outside the modal
uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) {
        uploadModal.style.display = 'none';
        resetUploadModal();
    }
});

// Reset upload modal state
function resetUploadModal() {
    modalUploadForm.reset();
    modalProgressContainer.style.display = 'none';
    modalProgress.style.width = '0%';
    modalProgressText.textContent = '0%';
    modalUploadMessage.textContent = '';
    modalUploadMessage.className = 'message';
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// Initialize the application
function initApp() {
    // Set the current year in the footer
    document.getElementById('year').textContent = new Date().getFullYear();
    
    // Fetch initial files
    fetchFiles(currentPath);
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize dark mode
    initTheme();
    
    // Initialize default view mode
    setViewMode(currentViewMode);
}

// Initialize theme based on user preference
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

// Setup all event listeners
function setupEventListeners() {
    // Refresh button click
    refreshButton.addEventListener('click', () => fetchFiles(currentPath));
    
    // Modal upload form submit
    modalUploadForm.addEventListener('submit', handleModalUploadForm);
    
    // Modal directory form submit
    modalDirectoryForm.addEventListener('submit', handleModalDirectoryForm);
    
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // View mode toggle
    gridViewBtn.addEventListener('click', () => setViewMode('grid'));
    listViewBtn.addEventListener('click', () => setViewMode('list'));
    
    // Search functionality
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    
    // Drag and drop for modal file upload
    setupModalDragAndDrop();
    
    // Logout button
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    
    // New directory button in controls
    document.getElementById('new-dir-btn')?.addEventListener('click', showCreateDirectoryModal);
    
    // Upload button in controls
    document.getElementById('upload-btn')?.addEventListener('click', showUploadModal);
}

// Toggle between dark and light theme
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggle.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// Switch between grid and list view
function setViewMode(mode) {
    currentViewMode = mode;
    localStorage.setItem('viewMode', mode);
    
    if (mode === 'grid') {
        gridView.style.display = 'grid';
        fileList.style.display = 'none';
        gridViewBtn.classList.add('active');
        listViewBtn.classList.remove('active');
    } else {
        gridView.style.display = 'none';
        fileList.style.display = 'block';
        gridViewBtn.classList.remove('active');
        listViewBtn.classList.add('active');
    }
}

// Set up drag and drop functionality
function setupDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            dropArea.classList.remove('dragover');
        }, false);
    });
    
    dropArea.addEventListener('drop', handleDrop, false);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    }
}

// Set up drag and drop functionality for modal
function setupModalDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        modalDropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        modalDropArea.addEventListener(eventName, () => {
            modalDropArea.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        modalDropArea.addEventListener(eventName, () => {
            modalDropArea.classList.remove('dragover');
        }, false);
    });
    
    modalDropArea.addEventListener('drop', handleDrop, false);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            uploadFileFromModal(files[0]);
        }
    }
}

// Handle logout
async function handleLogout() {
    try {
        await fetch('/api/ssh/logout');
        window.location.href = '/login.html';
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '/login.html';
    }
}

// Handle search functionality
function handleSearch() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return;
    
    // Get current directory files from cache
    const files = fileCache[currentPath] || [];
    
    // Filter files based on search query
    const filteredFiles = files.filter(file => 
        file.name.toLowerCase().includes(query)
    );
    
    // Render filtered files
    renderFiles(filteredFiles, true);
}

// Handle upload form submission from modal
function handleModalUploadForm(e) {
    e.preventDefault();
    
    const file = modalFileInput.files[0];
    if (!file) {
        showMessage(modalUploadMessage, 'Please select a file to upload', true);
        return;
    }
    
    uploadFileFromModal(file);
}

// Show upload modal
function showUploadModal() {
    uploadModal.style.display = 'flex';
    resetUploadModal();
}

// Upload a file from the modal
async function uploadFileFromModal(file) {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', currentPath);
        
        // Show progress container and reset progress bar
        modalProgressContainer.style.display = 'block';
        modalProgress.style.width = '0%';
        modalProgressText.textContent = '0%';
        
        const xhr = new XMLHttpRequest();
        
        // Setup progress tracking
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                modalProgress.style.width = percentComplete + '%';
                modalProgressText.textContent = percentComplete + '%';
            }
        });
        
        // Setup completion handler
        xhr.onload = function() {
            if (xhr.status === 200) {
                showMessage(modalUploadMessage, 'File uploaded successfully', false);
                fetchFiles(currentPath);
                
                // Clear the form after a short delay
                setTimeout(() => {
                    uploadModal.style.display = 'none';
                    resetUploadModal();
                }, 1500);
            } else if (xhr.status === 401) {
                // If unauthorized, redirect to login page
                window.location.href = '/login.html';
            } else {
                let errorMessage = 'Upload failed';
                try {
                    const response = JSON.parse(xhr.responseText);
                    errorMessage = response.error || response.message || errorMessage;
                } catch (e) {
                    console.error('Error parsing response:', e);
                }
                showMessage(modalUploadMessage, errorMessage, true);
            }
        };
        
        // Setup error handler
        xhr.onerror = function() {
            showMessage(modalUploadMessage, 'Network error during upload', true);
        };
        
        // Send the request
        xhr.open('POST', '/api/upload', true);
        xhr.send(formData);
    } catch (error) {
        modalProgressContainer.style.display = 'none';
        showMessage(modalUploadMessage, error.message, true);
    }
}

// Handle directory form submission from modal
async function handleModalDirectoryForm(e) {
    e.preventDefault();
    
    const name = modalDirectoryName.value.trim();
    if (!name) {
        showMessage(modalDirectoryMessage, 'Directory name is required', true);
        return;
    }
    
    try {
        const response = await fetch('/api/directory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, path: currentPath })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            // If unauthorized, redirect to login page
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            throw new Error(errorData.error || 'Failed to create directory');
        }
        
        // Refresh the file list
        fetchFiles(currentPath);
        showMessage(modalDirectoryMessage, 'Directory created successfully', false);
        
        // Clear the form and close modal after a short delay
        setTimeout(() => {
            createDirModal.style.display = 'none';
            modalDirectoryName.value = '';
            modalDirectoryMessage.textContent = '';
            modalDirectoryMessage.className = 'message';
        }, 1500);
    } catch (error) {
        showMessage(modalDirectoryMessage, error.message, true);
    }
}

// Show create directory modal
function showCreateDirectoryModal() {
    createDirModal.style.display = 'flex';
    modalDirectoryName.value = '';
    modalDirectoryMessage.textContent = '';
    modalDirectoryMessage.className = 'message';
    setTimeout(() => modalDirectoryName.focus(), 100);
}

// Utility functions
function formatSize(bytes) {
    if (bytes === 0 || bytes === null || bytes === undefined) return '-';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    // Try to parse JSON date format with "/Date()/"
    if (typeof dateStr === 'string' && dateStr.includes('/Date(')) {
        const timestamp = parseInt(dateStr.replace(/\/Date\((\d+)\)\//, '$1'), 10);
        if (!isNaN(timestamp)) {
            const date = new Date(timestamp);
            return date.toLocaleString();
        }
    }
    
    try {
        const date = new Date(dateStr);
        return date.toLocaleString();
    } catch (e) {
        return dateStr;
    }
}

function getFileIcon(file) {
    if (file.isDirectory) {
        return '<i class="fas fa-folder folder-icon"></i>';
    }
    
    const extension = file.name.split('.').pop().toLowerCase();
    
    // Define file type icons
    const icons = {
        pdf: '<i class="fas fa-file-pdf" style="color: #cccccc;"></i>',
        doc: '<i class="fas fa-file-word" style="color: #bbbbbb;"></i>',
        docx: '<i class="fas fa-file-word" style="color: #bbbbbb;"></i>',
        xls: '<i class="fas fa-file-excel" style="color: #aaaaaa;"></i>',
        xlsx: '<i class="fas fa-file-excel" style="color: #aaaaaa;"></i>',
        ppt: '<i class="fas fa-file-powerpoint" style="color: #999999;"></i>',
        pptx: '<i class="fas fa-file-powerpoint" style="color: #999999;"></i>',
        txt: '<i class="fas fa-file-alt" style="color: #888888;"></i>',
        zip: '<i class="fas fa-file-archive" style="color: #777777;"></i>',
        rar: '<i class="fas fa-file-archive" style="color: #777777;"></i>',
        tar: '<i class="fas fa-file-archive" style="color: #777777;"></i>',
        gz: '<i class="fas fa-file-archive" style="color: #777777;"></i>',
        mp3: '<i class="fas fa-file-audio" style="color: #666666;"></i>',
        wav: '<i class="fas fa-file-audio" style="color: #666666;"></i>',
        mp4: '<i class="fas fa-file-video" style="color: #555555;"></i>',
        mov: '<i class="fas fa-file-video" style="color: #555555;"></i>',
        avi: '<i class="fas fa-file-video" style="color: #555555;"></i>',
        jpg: '<i class="fas fa-file-image" style="color: #dddddd;"></i>',
        jpeg: '<i class="fas fa-file-image" style="color: #dddddd;"></i>',
        png: '<i class="fas fa-file-image" style="color: #dddddd;"></i>',
        gif: '<i class="fas fa-file-image" style="color: #dddddd;"></i>',
        svg: '<i class="fas fa-file-image" style="color: #dddddd;"></i>',
        html: '<i class="fas fa-file-code" style="color: #aaaaaa;"></i>',
        css: '<i class="fas fa-file-code" style="color: #aaaaaa;"></i>',
        js: '<i class="fas fa-file-code" style="color: #aaaaaa;"></i>',
        json: '<i class="fas fa-file-code" style="color: #aaaaaa;"></i>',
        xml: '<i class="fas fa-file-code" style="color: #aaaaaa;"></i>',
        py: '<i class="fas fa-file-code" style="color: #999999;"></i>',
        java: '<i class="fas fa-file-code" style="color: #999999;"></i>',
        c: '<i class="fas fa-file-code" style="color: #999999;"></i>',
        cpp: '<i class="fas fa-file-code" style="color: #999999;"></i>',
        cs: '<i class="fas fa-file-code" style="color: #999999;"></i>',
        php: '<i class="fas fa-file-code" style="color: #999999;"></i>'
    };
    
    return icons[extension] || '<i class="fas fa-file file-icon"></i>';
}

function showLoading() {
    gridView.style.display = 'none';
    fileList.style.display = 'none';
    emptyMessage.style.display = 'none';
    loadingIndicator.style.display = 'flex';
}

function hideLoading() {
    loadingIndicator.style.display = 'none';
}

function showMessage(element, message, isError) {
    element.textContent = message;
    element.className = 'message ' + (isError ? 'error' : 'success');
    element.style.display = 'block';
    
    // Clear message after 5 seconds
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

// API functions
async function fetchFiles(path = '~') {
    showLoading();
    
    // Normalize path for consistency
    if (path !== '~') {
        path = path.replace(/\\/g, '/');
    }
    
    currentPath = path;
    console.log(`Fetching files for path: ${path}`);
    
    try {
        const encodedPath = encodeURIComponent(path);
        console.log(`Encoded path: ${encodedPath}`);
        
        const response = await fetch(`/api/files?path=${encodedPath}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            // If unauthorized, redirect to login page
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            throw new Error(errorData.error || 'Failed to fetch files');
        }
        
        const files = await response.json();
        console.log(`Received ${files.length} files`);
        
        // Cache the files for this path
        fileCache[path] = files;
        
        // Update the tree with the fetched files if we're at root
        if (path === '~') {
            updateDirectoryTree(files);
        }
        
        renderFiles(files);
        updateBreadcrumb(path);
        
        // Show empty message if no files
        if (files.length === 0) {
            gridView.style.display = 'none';
            fileList.style.display = 'none';
            emptyMessage.style.display = 'flex';
        } else {
            emptyMessage.style.display = 'none';
            setViewMode(currentViewMode);
        }
    } catch (error) {
        console.error(`Error fetching files for path ${path}:`, error);
        showMessage(uploadMessage, `Error: ${error.message}`, true);
        emptyMessage.style.display = 'flex';
    } finally {
        hideLoading();
    }
}

// Update the directory tree with fetched files
function updateDirectoryTree(files) {
    // Skip if the directoryTreeElement doesn't exist
    if (!directoryTreeElement) return;
    
    // Build tree from files
    const driveFiles = files.filter(file => file.isDirectory);
    directoryTree.children = driveFiles.map(drive => ({
        name: drive.name,
        path: drive.path,
        isDirectory: true,
        children: [],
        expanded: false
    }));
    
    renderDirectoryTree();
}

// Render the directory tree
function renderDirectoryTree() {
    // Clear existing tree
    if (directoryTreeElement) {
        directoryTreeElement.innerHTML = '';
        
        // Render root node
        const rootNode = document.createElement('div');
        rootNode.className = 'tree-node expanded';
        
        const rootContent = document.createElement('div');
        rootContent.className = 'tree-node-content';
        rootContent.classList.toggle('active', currentPath === '~');
        rootContent.innerHTML = `
            <span class="tree-node-toggle"><i class="fas fa-chevron-down"></i></span>
            <span class="tree-node-icon folder"><i class="fas fa-server"></i></span>
            <span class="tree-node-label">Root</span>
        `;
        rootContent.addEventListener('click', () => navigateToDirectory('~'));
        
        rootNode.appendChild(rootContent);
        
        // Create children container
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-node-children';
        
        // Render child nodes recursively (first level only for simplicity)
        directoryTree.children.forEach(child => {
            const nodeElement = document.createElement('div');
            nodeElement.className = 'tree-node';
            
            const nodeContent = document.createElement('div');
            nodeContent.className = 'tree-node-content';
            
            // Normalize path for comparison and storage
            const normalizedPath = child.path.replace(/\\/g, '/');
            nodeContent.dataset.path = normalizedPath;
            nodeContent.classList.toggle('active', currentPath === normalizedPath);
            
            nodeContent.innerHTML = `
                <span class="tree-node-toggle"><i class="fas fa-chevron-right"></i></span>
                <span class="tree-node-icon folder"><i class="fas fa-folder"></i></span>
                <span class="tree-node-label">${child.name}</span>
            `;
            
            // Navigate on click
            nodeContent.addEventListener('click', (e) => {
                if (e.target.closest('.tree-node-toggle')) {
                    loadSubDirectories(child);
                } else {
                    navigateToDirectory(normalizedPath);
                }
            });
            
            nodeElement.appendChild(nodeContent);
            childrenContainer.appendChild(nodeElement);
        });
        
        rootNode.appendChild(childrenContainer);
        directoryTreeElement.appendChild(rootNode);
    }
}

// Simplified load subdirectories for a directory in the tree
async function loadSubDirectories(node) {
    // Skip if the directoryTreeElement doesn't exist
    if (!directoryTreeElement) return;
    
    // Toggle expand/collapse
    node.expanded = !node.expanded;
    
    // If already loaded or being collapsed, just update visibility
    if (node.children.length > 0 || !node.expanded) {
        renderDirectoryTree();
        return;
    }
    
    try {
        // Skip if the directoryTreeElement doesn't exist
        if (!directoryTreeElement) return;
        
        // Show loading indicator
        const loadingNode = document.createElement('div');
        loadingNode.className = 'tree-loading';
        loadingNode.textContent = 'Loading...';
        
        // Normalize path for consistency
        const normalizedPath = node.path.replace(/\\/g, '/');
        
        const parentElement = document.querySelector(`.tree-node-content[data-path="${normalizedPath}"]`)
            ?.closest('.tree-node');
        
        if (parentElement) {
            const childContainer = document.createElement('div');
            childContainer.className = 'tree-node-children';
            childContainer.appendChild(loadingNode);
            parentElement.appendChild(childContainer);
        }
        
        // Load only top-level directories (no recursive loading)
        const response = await fetch(`/api/files?path=${encodeURIComponent(normalizedPath)}`);
        
        if (!response.ok) {
            throw new Error('Failed to load subdirectories');
        }
        
        const files = await response.json();
        const directories = files.filter(file => file.isDirectory);
        
        // Limit to top 20 directories to prevent performance issues
        node.children = directories.slice(0, 20).map(dir => ({
            name: dir.name,
            path: dir.path.replace(/\\/g, '/'), // Normalize paths
            isDirectory: true,
            children: [],
            expanded: false
        }));
        
        node.expanded = true;
        renderDirectoryTree();
    } catch (error) {
        console.error('Error loading subdirectories:', error);
        node.expanded = false;
        renderDirectoryTree();
    }
}

// Create a tree node element - simplified to improve performance
function createTreeNode(node) {
    const nodeElement = document.createElement('div');
    nodeElement.className = 'tree-node';
    if (node.expanded) nodeElement.classList.add('expanded');
    
    const nodeContent = document.createElement('div');
    nodeContent.className = 'tree-node-content';
    
    // Ensure path is stored properly
    const normalizedPath = node.path.replace(/\\/g, '/');
    nodeContent.dataset.path = normalizedPath;
    nodeContent.classList.toggle('active', currentPath === normalizedPath);
    
    // Toggle icon
    const toggleClass = node.expanded ? 'fa-chevron-down' : 'fa-chevron-right';
    
    nodeContent.innerHTML = `
        <span class="tree-node-toggle"><i class="fas ${toggleClass}"></i></span>
        <span class="tree-node-icon folder"><i class="fas fa-folder"></i></span>
        <span class="tree-node-label">${node.name}</span>
    `;
    
    // Navigate on click
    nodeContent.addEventListener('click', (e) => {
        if (e.target.closest('.tree-node-toggle')) {
            loadSubDirectories(node);
        } else {
            navigateToDirectory(normalizedPath);
        }
    });
    
    nodeElement.appendChild(nodeContent);
    
    // Add children if expanded - but only one level deep
    if (node.expanded && node.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-node-children';
        
        node.children.forEach(child => {
            const childNode = document.createElement('div');
            childNode.className = 'tree-node';
            
            const childContent = document.createElement('div');
            childContent.className = 'tree-node-content';
            
            // Ensure child path is stored properly
            const normalizedChildPath = child.path.replace(/\\/g, '/');
            childContent.dataset.path = normalizedChildPath;
            childContent.classList.toggle('active', currentPath === normalizedChildPath);
            
            childContent.innerHTML = `
                <span class="tree-node-toggle"><i class="fas fa-chevron-right"></i></span>
                <span class="tree-node-icon folder"><i class="fas fa-folder"></i></span>
                <span class="tree-node-label">${child.name}</span>
            `;
            
            // Navigate on click for child
            childContent.addEventListener('click', (e) => {
                if (e.target.closest('.tree-node-toggle')) {
                    loadSubDirectories(child);
                } else {
                    navigateToDirectory(normalizedChildPath);
                }
            });
            
            childNode.appendChild(childContent);
            childrenContainer.appendChild(childNode);
        });
        
        nodeElement.appendChild(childrenContainer);
    }
    
    return nodeElement;
}

// Delete a file or directory
async function deleteItem(path) {
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }
    
    // Normalize path for consistency
    const normalizedPath = path.replace(/\\/g, '/');
    console.log(`Deleting item: ${normalizedPath}`);
    
    try {
        const response = await fetch(`/api/delete?path=${encodeURIComponent(normalizedPath)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            // If unauthorized, redirect to login page
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            throw new Error(errorData.error || 'Failed to delete item');
        }
        
        // Refresh the file list
        fetchFiles(currentPath);
        showMessage(uploadMessage, 'Item deleted successfully', false);
    } catch (error) {
        console.error(`Error deleting item ${normalizedPath}:`, error);
        showMessage(uploadMessage, error.message, true);
    }
}

// Render files in the file list
function renderFiles(files, isSearchResult = false) {
    renderListView(files, isSearchResult);
    renderGridView(files, isSearchResult);
}

// Render files in list view
function renderListView(files, isSearchResult) {
    fileTableBody.innerHTML = '';
    
    if (files.length === 0) {
        return;
    }
    
    // Sort files - directories first, then files
    const sortedFiles = [...files].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });
    
    sortedFiles.forEach(file => {
        const tr = document.createElement('tr');
        
        // Normalize path for consistency
        const normalizedPath = file.path.replace(/\\/g, '/');
        
        // Name column with icon
        const tdName = document.createElement('td');
        if (file.isDirectory) {
            tdName.innerHTML = `<div class="dir-name">${getFileIcon(file)} ${file.name}</div>`;
            tdName.querySelector('.dir-name').addEventListener('click', () => navigateToDirectory(normalizedPath));
        } else {
            tdName.innerHTML = `<div class="file-name">${getFileIcon(file)} ${file.name}</div>`;
        }
        
        // Size column
        const tdSize = document.createElement('td');
        tdSize.textContent = file.isDirectory ? '-' : formatSize(file.size);
        
        // Modified date column
        const tdModified = document.createElement('td');
        tdModified.textContent = formatDate(file.modifiedAt);
        
        // Actions column
        const tdActions = document.createElement('td');
        tdActions.className = 'actions';
        
        if (!file.isDirectory) {
            // Preview button for files
            const previewBtn = document.createElement('button');
            previewBtn.className = 'action-btn preview-btn';
            previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
            previewBtn.title = 'Preview';
            previewBtn.addEventListener('click', () => previewFile(normalizedPath, file.name));
            
            // Only show preview for previewable files
            if (canPreviewFile(file.name)) {
                tdActions.appendChild(previewBtn);
            }
            
            // Download button for files
            const downloadBtn = document.createElement('button');
            downloadBtn.className = 'action-btn download-btn';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtn.title = 'Download';
            downloadBtn.addEventListener('click', () => {
                window.location.href = `/api/download?path=${encodeURIComponent(normalizedPath)}`;
            });
            tdActions.appendChild(downloadBtn);
        }
        
        // Delete button for both files and directories
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', () => deleteItem(normalizedPath));
        tdActions.appendChild(deleteBtn);
        
        // Append all columns
        tr.appendChild(tdName);
        tr.appendChild(tdSize);
        tr.appendChild(tdModified);
        tr.appendChild(tdActions);
        
        fileTableBody.appendChild(tr);
    });
}

// Render files in grid view
function renderGridView(files, isSearchResult) {
    gridView.innerHTML = '';
    
    if (files.length === 0) {
        return;
    }
    
    // Sort files - directories first, then files
    const sortedFiles = [...files].sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
    });
    
    sortedFiles.forEach(file => {
        const gridItem = document.createElement('div');
        gridItem.className = 'grid-item';
        
        // Normalize path for consistency
        const normalizedPath = file.path.replace(/\\/g, '/');
        
        const isImage = /\.(jpe?g|png|gif|bmp|webp)$/i.test(file.name);
        
        // Icon or thumbnail
        let iconHtml = '';
        if (file.isDirectory) {
            iconHtml = '<div class="grid-item-icon folder"><i class="fas fa-folder"></i></div>';
        } else if (isImage) {
            // For images, we could show a thumbnail but this would require additional backend support
            iconHtml = '<div class="grid-item-icon image"><i class="fas fa-file-image"></i></div>';
        } else {
            iconHtml = `<div class="grid-item-icon">${getFileIcon(file)}</div>`;
        }
        
        // Name
        const nameHtml = `<div class="grid-item-name">${file.name}</div>`;
        
        // Actions for grid items
        const actionsHtml = `
            <div class="grid-item-actions">
                ${!file.isDirectory && canPreviewFile(file.name) ? 
                    `<button class="action-btn preview-btn" title="Preview"><i class="fas fa-eye"></i></button>` : ''}
                ${!file.isDirectory ? 
                    `<button class="action-btn download-btn" title="Download"><i class="fas fa-download"></i></button>` : ''}
                <button class="action-btn delete-btn" title="Delete"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
        
        gridItem.innerHTML = iconHtml + nameHtml + actionsHtml;
        
        // Add click events
        if (file.isDirectory) {
            gridItem.querySelector('.grid-item-icon, .grid-item-name').addEventListener('click', () => navigateToDirectory(normalizedPath));
        }
        
        // Add action button events
        if (!file.isDirectory && canPreviewFile(file.name)) {
            const previewBtn = gridItem.querySelector('.preview-btn');
            if (previewBtn) {
                previewBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    previewFile(normalizedPath, file.name);
                });
            }
        }
        
        if (!file.isDirectory) {
            const downloadBtn = gridItem.querySelector('.download-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.location.href = `/api/download?path=${encodeURIComponent(normalizedPath)}`;
                });
            }
        }
        
        const deleteBtn = gridItem.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteItem(normalizedPath);
            });
        }
        
        gridView.appendChild(gridItem);
    });
}

// Check if a file can be previewed
function canPreviewFile(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const previewableExtensions = [
        // Images
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
        // Text/Code
        'txt', 'md', 'html', 'css', 'js', 'json', 'xml', 'csv',
        // PDF
        'pdf',
        // Audio
        'mp3', 'wav', 'ogg',
        // Video
        'mp4', 'webm'
    ];
    
    return previewableExtensions.includes(extension);
}

// Preview a file
async function previewFile(path, filename) {
    // Show the modal
    previewModal.style.display = 'flex';
    previewTitle.textContent = filename;
    previewContainer.innerHTML = '';
    previewLoading.style.display = 'block';
    
    try {
        const extension = filename.split('.').pop().toLowerCase();
        const previewUrl = `/api/download?path=${encodeURIComponent(path)}&preview=true`;
        
        // For images
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension)) {
            const img = document.createElement('img');
            img.className = 'preview-image';
            img.src = previewUrl;
            img.onload = () => previewLoading.style.display = 'none';
            previewContainer.appendChild(img);
        }
        // For text files
        else if (['txt', 'md', 'html', 'css', 'js', 'json', 'xml', 'csv'].includes(extension)) {
            try {
                // Create temporary code preview with just the URL
                const codeElem = document.createElement('pre');
                codeElem.className = 'preview-code';
                codeElem.textContent = 'Loading text...';
                previewContainer.appendChild(codeElem);
                
                // Fetch the file content
                const response = await fetch(previewUrl);
                const text = await response.text();
                
                // Update with actual content
                codeElem.textContent = text;
                previewLoading.style.display = 'none';
            } catch (error) {
                console.error('Error loading text file:', error);
                previewContainer.innerHTML = '<div class="preview-error">Failed to load text file.</div>';
                previewLoading.style.display = 'none';
            }
        }
        // For PDFs
        else if (extension === 'pdf') {
            const iframe = document.createElement('iframe');
            iframe.className = 'preview-pdf';
            iframe.src = previewUrl;
            iframe.onload = () => previewLoading.style.display = 'none';
            previewContainer.appendChild(iframe);
        }
        // For audio
        else if (['mp3', 'wav', 'ogg'].includes(extension)) {
            const audio = document.createElement('audio');
            audio.className = 'preview-audio';
            audio.controls = true;
            audio.src = previewUrl;
            audio.onloadeddata = () => previewLoading.style.display = 'none';
            previewContainer.appendChild(audio);
        }
        // For video
        else if (['mp4', 'webm'].includes(extension)) {
            const video = document.createElement('video');
            video.className = 'preview-video';
            video.controls = true;
            video.src = previewUrl;
            video.onloadeddata = () => previewLoading.style.display = 'none';
            previewContainer.appendChild(video);
        }
        // Fallback
        else {
            previewContainer.innerHTML = '<div class="preview-unsupported">This file type cannot be previewed.</div>';
            previewLoading.style.display = 'none';
        }
    } catch (error) {
        console.error('Error previewing file:', error);
        previewContainer.innerHTML = '<div class="preview-error">Failed to preview file.</div>';
        previewLoading.style.display = 'none';
    }
}

// Update breadcrumb navigation
function updateBreadcrumb(path) {
    breadcrumb.innerHTML = '';
    
    // Home/root crumb
    const homeCrumb = document.createElement('span');
    homeCrumb.className = 'crumb';
    homeCrumb.dataset.path = '~';
    homeCrumb.innerHTML = '<i class="fas fa-home"></i>';
    homeCrumb.addEventListener('click', () => navigateToDirectory('~'));
    breadcrumb.appendChild(homeCrumb);
    
    // If we're at root, just show home
    if (path === '~') {
        return;
    }
    
    // If it's a drive (e.g., "C:"), show that as a single crumb
    if (/^[A-Za-z]:$/.test(path)) {
        const driveCrumb = document.createElement('span');
        driveCrumb.className = 'crumb';
        driveCrumb.dataset.path = path;
        driveCrumb.textContent = path;
        driveCrumb.addEventListener('click', () => navigateToDirectory(path));
        breadcrumb.appendChild(driveCrumb);
        return;
    }
    
    // Break down the path into parts
    const parts = path.split(/[\/\\]/).filter(Boolean);
    
    // Build paths for each crumb
    let currentPath = '';
    
    parts.forEach((part, i) => {
        // Skip if it's an empty part
        if (!part) return;
        
        let segmentPath;
        
        // For first part which might be a drive letter with colon
        if (i === 0 && part.endsWith(':')) {
            currentPath = part;
            segmentPath = part;
        } 
        // For network paths that start with double slashes
        else if (i === 0 && path.startsWith('//')) {
            currentPath = '//' + part;
            segmentPath = '//' + part;
        }
        // For paths starting with a single slash
        else if (i === 0 && path.startsWith('/')) {
            currentPath = '/' + part;
            segmentPath = '/' + part;
        }
        // For all other parts
        else {
            // Windows-style backslash or forward slash
            const separator = path.includes('\\') ? '\\' : '/';
            currentPath = currentPath ? `${currentPath}${separator}${part}` : part;
            segmentPath = currentPath;
        }
        
        const crumb = document.createElement('span');
        crumb.className = 'crumb';
        crumb.dataset.path = segmentPath;
        crumb.textContent = part;
        crumb.addEventListener('click', () => navigateToDirectory(segmentPath));
        breadcrumb.appendChild(crumb);
    });
}

// Navigate to a directory
function navigateToDirectory(path) {
    // Handle Windows paths - ensure consistency
    if (path.includes('\\')) {
        // Convert backslashes to forward slashes for consistency
        path = path.replace(/\\/g, '/');
    }
    
    // Preserve trailing slash if it exists
    if (path !== '~' && (path.endsWith('/') || path.endsWith('\\'))) {
        // Make sure we keep the trailing slash
        if (!path.endsWith('/')) {
            path = path + '/';
        }
    }
    
    // Special case for drive letters
    if (/^[A-Za-z]:$/.test(path)) {
        // Keep the drive letter format as is
    }
    
    console.log("Navigating to: " + path);
    currentPath = path;
    fetchFiles(path);
} 