import { app, BrowserWindow } from 'electron';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import yargs from 'yargs';
import { serverEvents, EVENT_NAMES } from '../server-events.js';

const cliArguments = yargs(process.argv)
    .usage('Usage: <your-start-script> [options]')
    .option('width', {
        type: 'number',
        default: 1280,
        describe: 'The width of the window',
    })
    .option('height', {
        type: 'number',
        default: 720,
        describe: 'The height of the window',
    })
    .parseSync();

/** @type {string} The URL to load in the window. */
let appUrl;
/** @type {BrowserWindow} The main window. */
let mainWindow;
/** @type {number} The server port. */
let serverPort;

/**
 * Find an available port
 * @returns {Promise<number>} The available port
 */
function findAvailablePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
}

/**
 * Get loading HTML content
 * @param {string} status The status message
 * @returns {string} The HTML content
 */
function getLoadingHTML(status) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>SillyTavern</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
        }
        .container {
            text-align: center;
        }
        .title {
            font-size: 2.5em;
            margin-bottom: 30px;
            background: linear-gradient(90deg, #e94560, #ff6b6b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(255, 255, 255, 0.1);
            border-top-color: #e94560;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .status {
            font-size: 1.2em;
            color: rgba(255, 255, 255, 0.8);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="title">SillyTavern</h1>
        <div class="spinner"></div>
        <p class="status">${status}</p>
    </div>
</body>
</html>`;
}

function createSillyTavernWindow() {
    mainWindow = new BrowserWindow({
        height: cliArguments.height,
        width: cliArguments.width,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
    });

    // Show loading screen initially
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getLoadingHTML('Initiating...'))}`);
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Handle window close
    mainWindow.on('closed', () => {
        mainWindow = null;
        app.quit();
    });
}

function loadServerURL() {
    if (!appUrl || !mainWindow) {
        console.error('The server has not started yet or window is not available.');
        return;
    }
    mainWindow.loadURL(appUrl);
}

async function startServer() {
    // Find an available port
    serverPort = await findAvailablePort();
    console.log(`Using port: ${serverPort}`);

    // Set the port in command line args before server starts
    globalThis.COMMAND_LINE_ARGS = globalThis.COMMAND_LINE_ARGS || {};
    globalThis.COMMAND_LINE_ARGS.port = serverPort;

    return new Promise((_resolve, _reject) => {
        serverEvents.addListener(EVENT_NAMES.SERVER_STARTED, ({ url }) => {
            appUrl = url.toString();
            console.log(`Server started at: ${appUrl}`);
            loadServerURL();
        });

        const sillyTavernRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
        process.chdir(sillyTavernRoot);

        // Override process.argv to include our port
        process.argv.push('--port', String(serverPort));

        import('../server-global.js');
    });
}

app.whenReady().then(async () => {
    // Create window first to show loading screen
    createSillyTavernWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createSillyTavernWindow();
            if (appUrl) {
                loadServerURL();
            }
        }
    });

    // Start the server
    await startServer();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
