/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */

const { app, ipcMain } = require('electron');
const { Microsoft } = require('minecraft-java-core');
const { autoUpdater } = require('electron-updater')

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('electron-store');

const UpdateWindow = require("./assets/js/windows/updateWindow.js");
const MainWindow = require("./assets/js/windows/mainWindow.js");

let dev = process.env.NODE_ENV === 'dev';

if (dev) {
    let appPath = path.resolve('./data/Launcher').replace(/\\/g, '/');
    let appdata = path.resolve('./data').replace(/\\/g, '/');
    if (!fs.existsSync(appPath)) fs.mkdirSync(appPath, { recursive: true });
    if (!fs.existsSync(appdata)) fs.mkdirSync(appdata, { recursive: true });
    app.setPath('userData', appPath);
    app.setPath('appData', appdata)
}

function getEncryptionKey(userDataPath) {
    if (dev) return undefined;

    const keyPath = path.join(userDataPath, 'key.txt');
    if (fs.existsSync(keyPath)) return fs.readFileSync(keyPath, 'utf8').trim();

    const key = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(keyPath, key, { encoding: 'utf8', mode: 0o600 });
    return key;
}

const userDataPath = app.getPath('userData');
const launcherStore = new Store({
    name: 'launcher-data',
    cwd: userDataPath,
    encryptionKey: getEncryptionKey(userDataPath)
});

function getTable(tableName) {
    const table = launcherStore.get(tableName, []);
    return Array.isArray(table) ? table : [];
}

if (!getTable('configClient').length) {
    launcherStore.set('configClient', [{
        ID: 1,
        account_selected: null,
        instance_select: null,
        java_config: {
            java_path: null,
            java_memory: { min: 2, max: 4 }
        },
        game_config: {
            screen_size: { width: 854, height: 480 }
        },
        launcher_config: {
            download_multi: 5,
            visualTheme: 'beer',
            closeLauncher: 'close-launcher',
            intelEnabledMac: true
        }
    }]);
}

ipcMain.handle('data-create', (_, tableName, data) => {
    const table = getTable(tableName);
    const nextId = table.reduce((max, item) => Math.max(max, Number(item.ID) || 0), 0) + 1;
    const savedData = { ...data, ID: nextId };
    table.push(savedData);
    launcherStore.set(tableName, table);
    return savedData;
});

ipcMain.handle('data-read', (_, tableName, key = 1) => {
    return getTable(tableName).find(item => item.ID === key);
});

ipcMain.handle('data-read-all', (_, tableName) => getTable(tableName));

ipcMain.handle('data-update', (_, tableName, data, key = 1) => {
    const table = getTable(tableName);
    const savedData = { ...data, ID: key };
    const index = table.findIndex(item => item.ID === key);

    if (index === -1) table.push(savedData);
    else table[index] = savedData;

    launcherStore.set(tableName, table);
    return savedData;
});

ipcMain.handle('data-delete', (_, tableName, key = 1) => {
    launcherStore.set(tableName, getTable(tableName).filter(item => item.ID !== key));
});

if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(() => {
    if (dev) return MainWindow.createWindow()
    UpdateWindow.createWindow()
});

const withWindow = (getter, callback) => {
    const win = getter();
    if (!win) return;
    callback(win);
};

ipcMain.on('main-window-open', () => MainWindow.createWindow())
ipcMain.on('main-window-dev-tools', () => withWindow(() => MainWindow.getWindow(), (win) => win.webContents.openDevTools({ mode: 'detach' })))
ipcMain.on('main-window-dev-tools-close', () => withWindow(() => MainWindow.getWindow(), (win) => win.webContents.closeDevTools()))
ipcMain.on('main-window-close', () => MainWindow.destroyWindow())
ipcMain.on('main-window-reload', () => withWindow(() => MainWindow.getWindow(), (win) => win.reload()))
ipcMain.on('main-window-progress', (event, options) => withWindow(() => MainWindow.getWindow(), (win) => win.setProgressBar(options.progress / options.size)))
ipcMain.on('main-window-progress-reset', () => withWindow(() => MainWindow.getWindow(), (win) => win.setProgressBar(-1)))
ipcMain.on('main-window-progress-load', () => withWindow(() => MainWindow.getWindow(), (win) => win.setProgressBar(2)))
ipcMain.on('main-window-minimize', () => withWindow(() => MainWindow.getWindow(), (win) => win.minimize()))

ipcMain.on('update-window-close', () => UpdateWindow.destroyWindow())
ipcMain.on('update-window-dev-tools', () => withWindow(() => UpdateWindow.getWindow(), (win) => win.webContents.openDevTools({ mode: 'detach' })))
ipcMain.on('update-window-progress', (event, options) => withWindow(() => UpdateWindow.getWindow(), (win) => win.setProgressBar(options.progress / options.size)))
ipcMain.on('update-window-progress-reset', () => withWindow(() => UpdateWindow.getWindow(), (win) => win.setProgressBar(-1)))
ipcMain.on('update-window-progress-load', () => withWindow(() => UpdateWindow.getWindow(), (win) => win.setProgressBar(2)))

ipcMain.handle('path-user-data', () => app.getPath('userData'))
ipcMain.handle('appData', e => app.getPath('appData'))

ipcMain.on('main-window-maximize', () => {
    withWindow(() => MainWindow.getWindow(), (win) => {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    })
})

ipcMain.on('main-window-hide', () => withWindow(() => MainWindow.getWindow(), (win) => win.hide()))
ipcMain.on('main-window-show', () => withWindow(() => MainWindow.getWindow(), (win) => win.show()))

ipcMain.handle('Microsoft-window', async (_, client_id) => {
    return await new Microsoft(client_id).getAuth();
})

app.on('window-all-closed', () => app.quit());

autoUpdater.autoDownload = false;

ipcMain.handle('update-app', async () => {
    return await new Promise(async (resolve, reject) => {
        autoUpdater.checkForUpdates().then(res => {
            resolve(res);
        }).catch(error => {
            reject({
                error: true,
                message: error
            })
        })
    })
})

autoUpdater.on('update-available', () => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('updateAvailable');
});

ipcMain.on('start-update', () => {
    autoUpdater.downloadUpdate();
})

autoUpdater.on('update-not-available', () => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('update-not-available');
});

autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall();
});

autoUpdater.on('download-progress', (progress) => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('download-progress', progress);
})

autoUpdater.on('error', (err) => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('error', err);
});
