# NodeJS Simple CDN File Server

A self-hosted, NodeJS-based web file server (CDN) featuring an admin panel for uploading, managing, and deleting files and folders. Files are served publicly via unique URLs generated upon upload.

## Purpose

This project provides a basic, self-contained file server solution suitable for scenarios where:

*   You need a simple way to host and share files publicly.
*   You require basic administrative control over uploads, deletions, and folder organization.
*   You prefer a lightweight NodeJS implementation.
*   You understand the security implications of the basic authentication method used (see **Security Warning**).

## Features

*   **Admin Panel:** Secure login area for managing files.
*   **User Authentication:** Basic authentication using a plaintext `users.json` file.
*   **File Upload:** Upload single files via the admin panel.
*   **Unique File Naming:** Automatically generates unique UUID-based filenames upon upload to prevent collisions and obscure original names.
*   **Folder Management:** Create and delete folders within the admin panel. Deleting a folder recursively removes its contents.
*   **File Deletion:** Delete individual files.
*   **Metadata Storage:** Uses a local `files.json` to track file/folder structure, original names, and metadata.
*   **Public File Serving:** Serves files under the `/f/` path (e.g., `/f/unique-filename.ext` or `/f/foldername/unique-filename.ext`).
*   **Simple UI:** Uses EJS templates and basic CSS for the interface.

## Tech Stack

*   [Node.js](https://nodejs.org/)
*   [Express.js](https://expressjs.com/)
*   [EJS (Embedded JavaScript templates)](https://ejs.co/)
*   [Multer](https://github.com/expressjs/multer) (for file uploads)
*   [UUID](https://github.com/uuidjs/uuid) (for generating unique filenames)
*   [fs-extra](https://github.com/jprichardson/node-fs-extra) (for filesystem operations like recursive deletion)
*   [express-session](https://github.com/expressjs/session) (for admin login sessions)

## ⚠️ Security Warning ⚠️

*   **Plaintext Passwords:** This project stores admin usernames and passwords in **plaintext** within `data/users.json`. This is **highly insecure** and **NOT suitable for production environments** or any situation where security is a concern. Anyone gaining access to this file will have all admin credentials. For real-world use, implement password hashing (e.g., using `bcrypt`).
*   **Default Session Store:** It uses the default `express-session` MemoryStore, which is not designed for production. It leaks memory over time, and sessions are lost when the server restarts. Use a persistent session store like `connect-redis` or `connect-mongo` for production.
*   **Input Validation:** Basic validation is present, but robust checks against path traversal and other attacks should be implemented for production use.
*   **Error Handling:** Error handling is basic. Implement more comprehensive logging and user feedback for production.

## Prerequisites

*   [Node.js](https://nodejs.org/) (includes npm)

## Installation & Setup

1.  **Clone or Download:**
    ```bash
    git clone <repository-url> cdn-fileserver
    cd cdn-fileserver
    ```
    Or download the code manually and navigate to the directory.

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Create Data and Upload Directories:**
    ```bash
    mkdir data uploads
    ```
    *(Note: `public`, `views` should already exist if cloned/downloaded correctly)*

4.  **Create Configuration Files:**
    *   Create `data/users.json`. Add at least one admin user in JSON format (REMEMBER: PLAINTEXT PASSWORDS!). Example:
        ```json
        [
          {
            "username": "admin",
            "password": "your_very_insecure_password"
          }
        ]
        ```
    *   Create an empty `data/files.json` to store file metadata. The server will initialize it if it's empty or doesn't exist, but creating it manually is good practice:
        ```json
        {
          "files": [],
          "folders": {}
        }
        ```

5.  **IMPORTANT: Configure Session Secret:**
    *   Open `server.js` and change the `secret` value within the `session({...})` configuration to a long, random string.

## Running the Server

```bash
node server.js
```

By default, the server will run on `http://localhost:3000`.

*   **Admin Login:** `http://localhost:3000/login`
*   **Admin Panel (after login):** `http://localhost:3000/admin`
*   **Public Files:** `http://localhost:3000/f/<generated-file-name.ext>` or `http://localhost:3000/f/<folder-name>/<generated-file-name.ext>`

## Usage

1.  **Login:** Navigate to `/login` and enter the credentials defined in `data/users.json`.
2.  **Admin Panel (`/admin`):**
    *   **Upload:** Select a file using the "Upload New File" form and click "Upload File". The file will be saved with a unique name in the `uploads/` directory (or the corresponding subfolder if browsing within one) and listed in the current view.
    *   **Create Folder:** Enter a valid folder name (alphanumeric, underscore, hyphen, dot allowed) in the "Create New Folder" form and click "Create Folder".
    *   **Browse Folders:** Click the "(Browse)" link next to a folder name to navigate into it. The path navigator at the top shows your current location.
    *   **Delete File:** Click the "Delete File" button next to the desired file. Confirmation is required.
    *   **Delete Folder:** Click the "Delete Folder" button next to the desired folder. Confirmation is required. This will delete the folder and **all files and subfolders within it**.
3.  **Accessing Files:** Files are publicly accessible using the `/f/` path followed by their stored path (including folders, if any). Example: If you upload `my-document.pdf` into a folder named `reports`, and it gets stored as `uploads/reports/abc-123.pdf`, the public URL will be `http://your-server/f/reports/abc-123.pdf`.

## Project Structure

```
cdn-fileserver/
├── data/
│   ├── files.json       # Stores file/folder metadata
│   └── users.json       # Stores admin credentials (PLAINTEXT - INSECURE!)
├── node_modules/
├── public/
│   └── css/
│       └── style.css    # Basic styling
├── uploads/             # Uploaded files are stored here (in subfolders too)
├── views/
│   ├── partials/
│   │   ├── footer.ejs
│   │   └── header.ejs
│   ├── admin.ejs        # Admin panel view
│   └── login.ejs        # Login page view
├── .gitignore
├── package.json
├── package-lock.json
└── server.js            # Main application file
```
