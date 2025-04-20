const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises; // Use promises for async operations
const fse = require('fs-extra'); // For recursive delete and ensuring directories
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Require dotenv for secrects
const dotenv = require("dotenv");
// Config dotenv
dotenv.config(); // Load .env file

const app = express();
const port = process.env.WEB_PORT || 3825; // Default to 3825 if not set in .env
const sessionSecret = process.env.SESSION_SECRET;

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const FILES_METADATA_FILE = path.join(__dirname, 'data', 'files.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// --- Data Handling Functions ---

async function readUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') { // File doesn't exist
            console.log('users.json not found, creating empty array.');
            return [];
        }
        console.error("Error reading users file:", err);
        throw err; // Re-throw for higher level handling
    }
}

async function readFilesMetadata() {
    try {
        await fse.ensureFile(FILES_METADATA_FILE); // Ensure file exists
        const data = await fs.readFile(FILES_METADATA_FILE, 'utf8');
        // Handle empty file case
        if (!data.trim()) {
             console.log('files.json is empty, initializing structure.');
             return { files: [], folders: {} };
        }
        return JSON.parse(data);
    } catch (err) {
        console.error("Error reading files metadata:", err);
        // Provide a default structure on error to prevent crashes
        return { files: [], folders: {} };
    }
}

async function writeFilesMetadata(data) {
    try {
        await fs.writeFile(FILES_METADATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error("Error writing files metadata:", err);
        throw err;
    }
}

// Helper to get a specific folder object within the metadata structure
function getFolderReference(metadata, folderPath) {
    if (!folderPath) {
        return metadata; // Root
    }
    const parts = folderPath.split('/');
    let current = metadata;
    for (const part of parts) {
        if (!current.folders || !current.folders[part]) {
            return null; // Path doesn't exist
        }
        current = current.folders[part];
    }
    return current;
}

// Helper to get the parent folder object and the target name
function getParentFolderReference(metadata, fullPath) {
    if (!fullPath || !fullPath.includes('/')) {
        return { parent: metadata, name: fullPath }; // Item is in root
    }
    const parts = fullPath.split('/');
    const name = parts.pop();
    const parentPath = parts.join('/');
    const parent = getFolderReference(metadata, parentPath);
    return { parent, name };
}


// --- Middleware ---

// Session middleware (INSECURE MemoryStore for demo only)
app.use(session({
    secret: 'a_very_secret_key_change_me_later', // CHANGE THIS!
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Body parsing middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files (CSS, Client-side JS)
app.use(express.static(path.join(__dirname, 'public')));

// Static file serving for uploads (mounted at /f/)
app.use('/f', express.static(UPLOADS_DIR));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        // Get the target path from the hidden form field
        const targetPath = req.body.path || ''; // Default to root
        const destinationDir = path.join(UPLOADS_DIR, targetPath);

        try {
            // Ensure the directory exists recursively
            await fse.ensureDir(destinationDir);
            cb(null, destinationDir);
        } catch (err) {
            console.error("Error creating upload directory:", err);
            cb(err); // Pass error to multer
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = uuidv4();
        const extension = path.extname(file.originalname);
        const storedFilename = uniqueSuffix + extension;
        // Store the generated filename on the request object so we can access it later
        req.generatedFilename = storedFilename;
        cb(null, storedFilename);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 900 * 1024 * 1024 } // Example: 900MB limit
}).single('file'); // Matches the 'name' attribute of the file input

// Authentication Middleware
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
}

// --- Routes ---

// Login Routes
app.get('/login', (req, res) => {
    if (req.session.user) {
       return res.redirect('/admin'); // Already logged in
    }
    res.render('login', { title: 'Admin Login', error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.render('login', { title: 'Admin Login', error: 'Username and password required.' });
    }

    try {
        const users = await readUsers();
        const user = users.find(u => u.username === username && u.password === password); // !! PLAINTEXT COMPARE - INSECURE !!

        if (user) {
            req.session.user = { username: user.username }; // Store minimal user info in session
            res.redirect('/admin');
        } else {
            res.render('login', { title: 'Admin Login', error: 'Invalid username or password.' });
        }
    } catch (err) {
        console.error("Login error:", err);
        res.render('login', { title: 'Admin Login', error: 'An error occurred during login.' });
    }
});

// Logout Route
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Logout error:", err);
            // Handle error appropriately, maybe redirect with an error message
            return res.redirect('/admin'); // Or wherever appropriate
        }
        res.redirect('/login');
    });
});


// --- Admin Routes (Protected) ---
app.get('/admin', isAuthenticated, async (req, res) => {
    try {
        const fileStructure = await readFilesMetadata();
        const currentPath = req.query.path || ''; // Get path from query string, default to root
        res.render('admin', {
            title: 'Admin Dashboard',
            user: req.session.user,
            fileStructure: fileStructure,
            currentPath: currentPath, // Pass current path to view
            error: null,
            success: req.query.success // Pass success message if redirected
        });
    } catch (err) {
        res.render('admin', {
            title: 'Admin Dashboard',
            user: req.session.user,
            fileStructure: { files: [], folders: {} }, // Provide default structure on error
            currentPath: '',
            error: 'Error loading file structure.',
            success: null
        });
    }
});

// File Upload Route
app.post('/admin/upload', isAuthenticated, (req, res) => {
    upload(req, res, async (err) => {
        const currentPath = req.body.path || ''; // Get target path from hidden field
        const redirectUrl = `/admin?path=${encodeURIComponent(currentPath)}`;

        if (err instanceof multer.MulterError) {
            console.error("Multer error uploading file:", err);
            return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Upload error: ' + err.message)}`);
        } else if (err) {
            console.error("Unknown error uploading file:", err);
             return res.redirect(`${redirectUrl}&error=${encodeURIComponent('An unknown upload error occurred.')}`);
        }

        if (!req.file) {
            return res.redirect(`${redirectUrl}&error=${encodeURIComponent('No file selected for upload.')}`);
        }
        if (!req.generatedFilename) {
            console.error("Error: Filename not generated or passed correctly.");
             return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Internal error generating filename.')}`);
        }


        try {
            const metadata = await readFilesMetadata();
            const targetFolder = getFolderReference(metadata, currentPath);

            if (!targetFolder) {
                 // This shouldn't happen if ensureDir worked, but check anyway
                 console.error("Upload target folder not found in metadata:", currentPath);
                  // Attempt to delete the orphaned uploaded file
                 try {
                     const uploadedFilePath = path.join(UPLOADS_DIR, currentPath, req.generatedFilename);
                     await fs.unlink(uploadedFilePath);
                     console.log("Cleaned up orphaned file:", uploadedFilePath);
                 } catch (cleanupErr) {
                     console.error("Error cleaning up orphaned file:", cleanupErr);
                 }
                 return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Target folder not found.')}`);
            }

            // Ensure the 'files' array exists in the target folder
            if (!targetFolder.files) {
                targetFolder.files = [];
            }

            // Add file metadata
            targetFolder.files.push({
                originalName: req.file.originalname,
                storedName: req.generatedFilename, // Use the filename generated by multer
                size: req.file.size,
                uploadDate: new Date().toISOString(),
                type: 'file' // Explicitly mark as file
            });

            await writeFilesMetadata(metadata);
            res.redirect(`${redirectUrl}&success=${encodeURIComponent('File uploaded successfully!')}`);

        } catch (metaErr) {
            console.error("Error updating metadata after upload:", metaErr);
             // Attempt to delete the orphaned uploaded file
            try {
                 const uploadedFilePath = path.join(UPLOADS_DIR, currentPath, req.generatedFilename);
                 await fs.unlink(uploadedFilePath);
                 console.log("Cleaned up orphaned file due to metadata error:", uploadedFilePath);
            } catch (cleanupErr) {
                console.error("Error cleaning up orphaned file after metadata error:", cleanupErr);
            }
            res.redirect(`${redirectUrl}&error=${encodeURIComponent('Error saving file metadata.')}`);
        }
    });
});

// Create Folder Route
app.post('/admin/create-folder', isAuthenticated, async (req, res) => {
    const { folderName, path: parentPath } = req.body;
    const redirectUrl = `/admin?path=${encodeURIComponent(parentPath || '')}`;

    // Basic validation for folder name
    if (!folderName || !/^[a-zA-Z0-9_\-\.]+$/.test(folderName)) {
        return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Invalid folder name. Use alphanumeric, underscore, hyphen, dot.')}`);
    }
    if (folderName === '.' || folderName === '..') {
         return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Invalid folder name.')}`);
    }

    try {
        const metadata = await readFilesMetadata();
        const parentFolder = getFolderReference(metadata, parentPath);

        if (!parentFolder) {
             return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Parent path not found.')}`);
        }

        // Ensure 'folders' object exists
        if (!parentFolder.folders) {
            parentFolder.folders = {};
        }

        // Check if folder already exists
        if (parentFolder.folders[folderName]) {
            return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Folder already exists at this location.')}`);
        }

        // Add new folder structure to metadata
        parentFolder.folders[folderName] = {
            files: [],
            folders: {}
        };

         // --- Create the physical directory ---
         const physicalFolderPath = path.join(UPLOADS_DIR, parentPath || '', folderName);
         await fse.ensureDir(physicalFolderPath);
         // --- ---

        await writeFilesMetadata(metadata);
        res.redirect(`${redirectUrl}&success=${encodeURIComponent('Folder created successfully!')}`);

    } catch (err) {
        console.error("Error creating folder:", err);
        res.redirect(`${redirectUrl}&error=${encodeURIComponent('Error creating folder.')}`);
    }
});

// Delete File Route
app.post('/admin/delete-file', isAuthenticated, async (req, res) => {
    const { storedName, path: folderPath } = req.body; // path here is the folder containing the file
    const redirectUrl = `/admin?path=${encodeURIComponent(folderPath || '')}`;

    if (!storedName) {
         return res.redirect(`${redirectUrl}&error=${encodeURIComponent('File name missing.')}`);
    }

    try {
        const metadata = await readFilesMetadata();
        const targetFolder = getFolderReference(metadata, folderPath);

        if (!targetFolder || !targetFolder.files) {
             return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Folder or file list not found.')}`);
        }

        const fileIndex = targetFolder.files.findIndex(f => f.storedName === storedName);
        if (fileIndex === -1) {
             return res.redirect(`${redirectUrl}&error=${encodeURIComponent('File not found in metadata.')}`);
        }

        // Construct physical path
        const physicalFilePath = path.join(UPLOADS_DIR, folderPath || '', storedName);

        // Delete physical file
        try {
            await fs.unlink(physicalFilePath);
        } catch (fileErr) {
             // Log error but proceed to remove metadata if file doesn't exist physically
            if (fileErr.code !== 'ENOENT') {
                console.error("Error deleting physical file:", physicalFilePath, fileErr);
                return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Error deleting physical file.')}`);
            }
             console.warn("Physical file not found, removing metadata anyway:", physicalFilePath);
        }


        // Remove from metadata
        targetFolder.files.splice(fileIndex, 1);
        await writeFilesMetadata(metadata);

        res.redirect(`${redirectUrl}&success=${encodeURIComponent('File deleted successfully!')}`);

    } catch (err) {
        console.error("Error deleting file:", err);
        res.redirect(`${redirectUrl}&error=${encodeURIComponent('An error occurred while deleting the file.')}`);
    }
});

// Delete Folder Route
app.post('/admin/delete-folder', isAuthenticated, async (req, res) => {
    const { path: folderPath } = req.body; // folderPath is the full path to the folder to delete
    const parentRedirectPath = (folderPath.includes('/') ? folderPath.substring(0, folderPath.lastIndexOf('/')) : '');
    const redirectUrl = `/admin?path=${encodeURIComponent(parentRedirectPath)}`;


    if (!folderPath) {
        return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Folder path missing.')}`);
    }

    try {
        const metadata = await readFilesMetadata();

        // Find the parent folder and the name of the folder to delete
        const { parent: parentFolder, name: folderName } = getParentFolderReference(metadata, folderPath);

        if (!parentFolder || !parentFolder.folders || !parentFolder.folders[folderName]) {
             return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Folder not found in metadata.')}`);
        }

        // Construct physical path
        const physicalFolderPath = path.join(UPLOADS_DIR, folderPath);


         // --- Recursively delete physical folder and contents ---
         try {
             await fse.remove(physicalFolderPath); // fs-extra's remove handles non-empty directories
         } catch (folderErr) {
             // Log error but maybe proceed if it doesn't exist? Careful.
              if (folderErr.code !== 'ENOENT') {
                 console.error("Error deleting physical folder:", physicalFolderPath, folderErr);
                 return res.redirect(`${redirectUrl}&error=${encodeURIComponent('Error deleting physical folder.')}`);
              }
              console.warn("Physical folder not found, removing metadata anyway:", physicalFolderPath);
         }
         // --- ---


        // Remove folder from parent's metadata
        delete parentFolder.folders[folderName];
        await writeFilesMetadata(metadata);

        res.redirect(`${redirectUrl}&success=${encodeURIComponent('Folder and its contents deleted successfully!')}`);

    } catch (err) {
        console.error("Error deleting folder:", err);
         res.redirect(`${redirectUrl}&error=${encodeURIComponent('An error occurred while deleting the folder.')}`);
    }
});


// --- Global Error Handler (Basic) ---
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    // Avoid sending detailed errors to client in production
    res.status(500).send('Something broke!');
});

// --- Start Server ---
async function startServer() {
    try {
        // Ensure necessary directories and files exist before starting
        await fse.ensureDir(UPLOADS_DIR);
        await fse.ensureFile(USERS_FILE);
        await fse.ensureFile(FILES_METADATA_FILE);

        // Initialize files.json if empty
        const metadata = await readFilesMetadata();
        if (Object.keys(metadata).length === 0 || (!metadata.files && !metadata.folders)) {
             console.log("Initializing empty files.json structure.");
             await writeFilesMetadata({ files: [], folders: {} });
        }


        app.listen(port, () => {
            console.log(`CDN File Server listening at http://localhost:${port}`);
            console.log(`Admin panel: http://localhost:${port}/admin`);
            console.log(`Serving files from: ${UPLOADS_DIR} under /f/`);
             console.warn("SECURITY WARNING: Using plaintext passwords and default session store. NOT FOR PRODUCTION.");
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1); // Exit if essential setup fails
    }
}

startServer();
