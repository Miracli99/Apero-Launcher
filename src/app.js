/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */

const { app, ipcMain, nativeTheme } = require('electron');
const { Microsoft } = require('minecraft-java-core');
const { autoUpdater } = require('electron-updater')

const path = require('path');
const fs = require('fs');

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
    if (MainWindow.getWindow().isMaximized()) {
        MainWindow.getWindow().unmaximize();
    } else {
        MainWindow.getWindow().maximize();
    }
})

ipcMain.on('main-window-hide', () => MainWindow.getWindow().hide())
ipcMain.on('main-window-show', () => MainWindow.getWindow().show())

ipcMain.handle('Microsoft-window', async (_, client_id) => {
    return await new Microsoft(client_id).getAuth();
})

ipcMain.handle('is-dark-theme', (_, theme) => {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    return nativeTheme.shouldUseDarkColors;
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