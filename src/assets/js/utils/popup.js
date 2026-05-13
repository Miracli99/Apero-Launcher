/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */

const { ipcRenderer } = require('electron');

function formatPopupContent(content) {
    if (content == null) return '';
    if (typeof content === 'string') return content;
    if (content instanceof Error) return content.message;

    if (typeof content === 'object') {
        if (content.message) return formatPopupContent(content.message);
        if (content.errorMessage) return formatPopupContent(content.errorMessage);
        if (content.error) return formatPopupContent(content.error);
        if (content.code && content.details) return `${content.code}: ${formatPopupContent(content.details)}`;
        if (content.code) return String(content.code);

        try {
            return JSON.stringify(content);
        } catch (err) {
            return 'Erreur inconnue';
        }
    }

    return String(content);
}

export default class popup {
    constructor() {
        this.popup = document.querySelector('.popup');
        this.popupTitle = document.querySelector('.popup-title');
        this.popupContent = document.querySelector('.popup-content');
        this.popupOptions = document.querySelector('.popup-options');
        this.popupButton = document.querySelector('.popup-button');
    }

    openPopup(info) {
        this.popup.style.display = 'flex';
        if (info.background == false) this.popup.style.background = 'none';
        else this.popup.style.background = '#000000b3'
        this.popupTitle.textContent = info.title || '';
        this.popupContent.style.color = info.color ? info.color : '#e21212';
        this.popupContent.textContent = formatPopupContent(info.content);

        if (info.options) this.popupOptions.style.display = 'flex';

        if (this.popupOptions.style.display !== 'none') {
            this.popupButton.onclick = () => {
                if (info.exit) return ipcRenderer.send('main-window-close');
                this.closePopup();
            }
        }
    }

    closePopup() {
        this.popup.style.display = 'none';
        this.popupTitle.textContent = '';
        this.popupContent.textContent = '';
        this.popupOptions.style.display = 'none';
        this.popupButton.onclick = null;
    }
}
