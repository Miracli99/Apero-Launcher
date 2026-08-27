/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */

const { ipcRenderer } = require('electron')
const { Status } = require('minecraft-java-core')
const fs = require('fs');
const pkg = require('../package.json');

import config from './utils/config.js';
import database from './utils/database.js';
import logger from './utils/logger.js';
import popup from './utils/popup.js';
import { skin2D } from './utils/skin.js';
import slider from './utils/slider.js';

const visualThemes = {
    beer: {
        badge: 'Cuvée du jour',
        title: 'BelleBit Taproom',
        tagline: 'Recettes houblonnées, profils brassés maison et serveurs toujours en pression.',
        slogan: 'Ajuste ta cuvée de paramètres avant de trinquer.',
        note: 'Astuce : garde au frais tes réglages avant de partir miner.'
    },
    neon: {
        badge: 'Signal connecté',
        title: 'BelleBit Neon Grid',
        tagline: 'Traverse le réseau, choisis ton monde et branche-toi sur l’aventure.',
        slogan: 'Calibre ton signal avant d’entrer dans la grille.',
        note: 'Astuce : une configuration stable garde le portail synchronisé.'
    },
    coffee: {
        badge: 'Pause du jour',
        title: 'BelleBit Coffee House',
        tagline: 'Un launcher chaleureux, des mondes corsés et une aventure fraîchement préparée.',
        slogan: 'Prépare tes réglages comme ton café préféré.',
        note: 'Astuce : enregistre ta recette avant de repartir explorer.'
    },
    forest: {
        badge: 'Sentier ouvert',
        title: 'BelleBit Wildwood',
        tagline: 'Entre mousse, lucioles et vieux portails, ton prochain monde t’attend.',
        slogan: 'Accorde ton équipement avant de suivre les lucioles.',
        note: 'Astuce : vérifie ton sac avant de quitter le campement.'
    }
};

function applyVisualTheme(theme = 'beer') {
    const selectedTheme = visualThemes[theme] ? theme : 'beer';
    const copy = visualThemes[selectedTheme];
    const currentTheme = document.body.dataset.visualTheme;

    const updateTheme = () => {
        document.body.dataset.visualTheme = selectedTheme;

        const content = {
            '.home .badge': copy.badge,
            '.home .taproom-title': copy.title,
            '.home .tagline': copy.tagline,
            '.settings .beer-slogan': copy.slogan,
            '.settings .beer-footer-note': copy.note
        };

        for (const [selector, text] of Object.entries(content)) {
            const element = document.querySelector(selector);
            if (element) element.textContent = text;
        }

        document.querySelectorAll('.visual-theme-card').forEach(card => {
            const isSelected = card.dataset.theme === selectedTheme;
            card.classList.toggle('active-visual-theme', isSelected);
            card.setAttribute('aria-pressed', String(isSelected));
        });
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (currentTheme && currentTheme !== selectedTheme && document.startViewTransition && !reduceMotion) {
        return document.startViewTransition(updateTheme);
    }

    updateTheme();
}

async function setBackground() {
    let background
    let body = document.body;
    body.className = 'dark global';
    if (fs.existsSync(`${__dirname}/assets/images/background/easterEgg`) && Math.random() < 0.005) {
        let backgrounds = fs.readdirSync(`${__dirname}/assets/images/background/easterEgg`);
        let Background = backgrounds[Math.floor(Math.random() * backgrounds.length)];
        background = `url(./assets/images/background/easterEgg/${Background})`;
    } else if (fs.existsSync(`${__dirname}/assets/images/background/dark`)) {
        let backgrounds = fs.readdirSync(`${__dirname}/assets/images/background/dark`);
        let Background = backgrounds[Math.floor(Math.random() * backgrounds.length)];
        background = `linear-gradient(#00000080, #00000080), url(./assets/images/background/dark/${Background})`;
    }
    body.style.backgroundImage = background || '#000';
    body.style.backgroundSize = 'cover';
}

async function changePanel(id) {
    let panel = document.querySelector(`.${id}`);
    let active = document.querySelector(`.active`)
    if (!panel || panel === active) return;
    if (active) active.classList.remove("active");
    panel.classList.add("active");
}

async function appdata() {
    return await ipcRenderer.invoke('appData').then(path => path)
}

async function addAccount(data) {
    let skin = false
    if (data?.profile?.skins[0]?.base64) skin = await new skin2D().creatHeadTexture(data.profile.skins[0].base64);
    let div = document.createElement("div");
    div.classList.add("account");
    div.id = data.ID;

    let profileImage = document.createElement("div");
    profileImage.classList.add("profile-image");
    if (skin) profileImage.style.backgroundImage = `url(${skin})`;

    let profileInfos = document.createElement("div");
    profileInfos.classList.add("profile-infos");

    let profilePseudo = document.createElement("div");
    profilePseudo.classList.add("profile-pseudo");
    profilePseudo.textContent = data.name || '';

    let profileUuid = document.createElement("div");
    profileUuid.classList.add("profile-uuid");
    profileUuid.textContent = data.uuid || '';

    let deleteProfile = document.createElement("div");
    deleteProfile.classList.add("delete-profile");
    deleteProfile.id = data.ID;

    let deleteProfileIcon = document.createElement("div");
    deleteProfileIcon.classList.add("icon-account-delete", "delete-profile-icon");

    profileInfos.appendChild(profilePseudo);
    profileInfos.appendChild(profileUuid);
    deleteProfile.appendChild(deleteProfileIcon);
    div.appendChild(profileImage);
    div.appendChild(profileInfos);
    div.appendChild(deleteProfile);
    return document.querySelector('.accounts-list').appendChild(div);
}

async function accountSelect(data) {
    let account = document.getElementById(`${data.ID}`);
    let activeAccount = document.querySelector('.account-select')

    if (activeAccount) activeAccount.classList.toggle('account-select');
    if (!account) return;
    account.classList.add('account-select');
    if (data?.profile?.skins[0]?.base64) headplayer(data.profile.skins[0].base64);
}

async function headplayer(skinBase64) {
    let skin = await new skin2D().creatHeadTexture(skinBase64);
    document.querySelector(".player-head").style.backgroundImage = `url(${skin})`;
}

async function setStatus(opt) {
    let nameServerElement = document.querySelector('.server-status-name')
    let statusServerElement = document.querySelector('.server-status-text')
    let playersOnline = document.querySelector('.status-player-count .player-count')

    if (!opt) {
        statusServerElement.classList.add('red')
        statusServerElement.textContent = `Ferme - 0 ms`
        document.querySelector('.status-player-count').classList.add('red')
        playersOnline.textContent = '0'
        return
    }

    let { ip, port, nameServer } = opt
    nameServerElement.textContent = nameServer || 'Minecraft'
    let status = new Status(ip, port);
    let statusServer = await status.getStatus().then(res => res).catch(err => err);

    if (!statusServer.error) {
        statusServerElement.classList.remove('red')
        document.querySelector('.status-player-count').classList.remove('red')
        statusServerElement.textContent = `En ligne - ${statusServer.ms} ms`
        playersOnline.textContent = statusServer.playersConnect
    } else {
        statusServerElement.classList.add('red')
        statusServerElement.textContent = `Ferme - 0 ms`
        document.querySelector('.status-player-count').classList.add('red')
        playersOnline.textContent = '0'
    }
}


export {
    appdata as appdata,
    changePanel as changePanel,
    config as config,
    database as database,
    logger as logger,
    popup as popup,
    setBackground as setBackground,
    skin2D as skin2D,
    addAccount as addAccount,
    accountSelect as accountSelect,
    slider as Slider,
    pkg as pkg,
    setStatus as setStatus,
    applyVisualTheme as applyVisualTheme
}
