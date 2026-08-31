/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */

const { ipcRenderer } = require('electron')

class database {
    async createData(tableName, data) {
        return await ipcRenderer.invoke('data-create', tableName, data);
    }

    async readData(tableName, key = 1) {
        return await ipcRenderer.invoke('data-read', tableName, key);
    }

    async readAllData(tableName) {
        return await ipcRenderer.invoke('data-read-all', tableName);
    }

    async updateData(tableName, data, key = 1) {
        return await ipcRenderer.invoke('data-update', tableName, data, key);
    }

    async deleteData(tableName, key = 1) {
        await ipcRenderer.invoke('data-delete', tableName, key);
    }
}

export default database;
