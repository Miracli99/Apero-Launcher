/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */
import { config, database, logger, changePanel, appdata, setStatus, pkg, popup } from '../utils.js'

const { Launch } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFile } = require('child_process')

const PATCH_WARNING_DELAY = 90 * 1000;
const PATCH_HELP_DELAY = 5 * 60 * 1000;

function formatLaunchError(error) {
    if (error == null) return 'Erreur inconnue';
    if (typeof error === 'string') return error;
    if (error.error || error.message || error.errorMessage) {
        return formatLaunchError(error.error || error.message || error.errorMessage);
    }
    try {
        return JSON.stringify(error);
    } catch (serializationError) {
        return 'Erreur inconnue';
    }
}

function prepareLaunchLog(instancePath) {
    const logDirectory = path.join(instancePath, 'launcher-logs');
    const logPath = path.join(logDirectory, 'latest.log');
    const previousLogPath = path.join(logDirectory, 'previous.log');

    fs.mkdirSync(logDirectory, { recursive: true });
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 0) {
        if (fs.existsSync(previousLogPath)) fs.rmSync(previousLogPath);
        fs.renameSync(logPath, previousLogPath);
    }
    fs.writeFileSync(logPath, '\uFEFF', 'utf8');

    return logPath;
}

function appendLaunchLog(logPath, event, value = '') {
    try {
        const timestamp = new Date().toISOString();
        const lines = String(value ?? '').trim().split(/\r?\n/);
        const output = lines.map(line => `[${timestamp}] [${event}] ${line}`).join('\n');
        fs.appendFileSync(logPath, `${output}\n`, 'utf8');
    } catch (error) {
        console.error(`Impossible d'écrire le journal de lancement : ${error.message}`);
    }
}

function stageDetail(value, fallback) {
    const lines = String(value ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const detail = lines.at(-1) || fallback;
    return detail.length > 140 ? `${detail.slice(0, 137)}...` : detail;
}

function formatElapsedTime(milliseconds) {
    return `${(milliseconds / 1000).toFixed(1)} s`;
}

function appendJavaProcessSnapshot(logPath) {
    if (process.platform !== 'win32') {
        appendLaunchLog(logPath, 'PROCESS', 'Capture automatique des processus Java disponible uniquement sous Windows.');
        return;
    }

    for (const executable of ['java.exe', 'javaw.exe']) {
        execFile('tasklist.exe', ['/FI', `IMAGENAME eq ${executable}`, '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10000 }, (error, stdout) => {
            const result = stdout?.trim();
            if (error && !result) {
                appendLaunchLog(logPath, 'PROCESS_ERROR', `${executable} : ${error.message}`);
                return;
            }
            appendLaunchLog(logPath, 'PROCESS', `${executable} : ${result || 'aucun processus détecté'}`);
        });
    }
}

function appendTextWithBreaks(element, value) {
    const lines = String(value || '').split(/\r?\n/);
    lines.forEach((line, index) => {
        if (index) element.appendChild(document.createElement('br'));
        element.appendChild(document.createTextNode(line));
    });
}

function createElement(className, text) {
    const element = document.createElement('div');
    if (className) element.className = className;
    if (typeof text !== 'undefined') element.textContent = text;
    return element;
}

function openSafeExternalUrl(url) {
    try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) return;
        shell.openExternal(parsedUrl.href);
    } catch (err) {
        console.error(`Invalid external URL: ${url}`);
    }
}

class Home {
    static id = "home";
    async init(config) {
        this.config = config;
        this.db = new database();
        this.news()
        this.socialLick()
        await this.instancesSelect()
        document.querySelector('.settings-btn').addEventListener('click', e => changePanel('settings'))
    }

    async news() {
        let newsElement = document.querySelector('.news-list');
        let news = await config.getNews().then(res => res).catch(err => false);
        if (news) {
            if (!news.length) {
                newsElement.appendChild(this.createNewsBlock({
                    title: "Aucun news n'ai actuellement disponible.",
                    content: 'Vous pourrez suivre ici toutes les news relative au serveur.',
                    day: 1,
                    month: 'Janvier'
                }));
            } else {
                for (let News of news) {
                    let date = this.getdate(News.publish_date)
                    newsElement.appendChild(this.createNewsBlock({
                        title: News.title,
                        content: News.content,
                        author: News.author,
                        day: date.day,
                        month: date.month
                    }));
                }
            }
        } else {
            newsElement.appendChild(this.createNewsBlock({
                title: 'Error.',
                content: 'Impossible de contacter le serveur des news.\nMerci de vérifier votre configuration.',
                day: 1,
                month: 'Janvier'
            }));
        }
        requestAnimationFrame(() => {
            newsElement.querySelectorAll('.news-block').forEach((block, index) => {
                block.style.setProperty('--news-index', Math.min(index, 5));
            });
            newsElement.classList.add('news-ready');
        });
    }

    createNewsBlock({ title, content, author, day, month }) {
        let blockNews = createElement('news-block');
        let newsHeader = createElement('news-header');
        let icon = document.createElement('img');
        icon.className = 'server-status-icon';
        icon.src = 'assets/images/icon.png';

        let headerText = createElement('header-text');
        headerText.appendChild(createElement('title', title));

        let date = createElement('date');
        date.appendChild(createElement('day', day));
        date.appendChild(createElement('month', month));

        let newsContent = createElement('news-content');
        let wrapper = createElement('bbWrapper');
        let paragraph = document.createElement('p');
        appendTextWithBreaks(paragraph, content);
        wrapper.appendChild(paragraph);

        if (author) {
            let authorParagraph = document.createElement('p');
            authorParagraph.className = 'news-author';
            authorParagraph.appendChild(document.createTextNode('Auteur - '));
            let authorSpan = document.createElement('span');
            authorSpan.textContent = author;
            authorParagraph.appendChild(authorSpan);
            wrapper.appendChild(authorParagraph);
        }

        newsHeader.appendChild(icon);
        newsHeader.appendChild(headerText);
        newsHeader.appendChild(date);
        newsContent.appendChild(wrapper);
        blockNews.appendChild(newsHeader);
        blockNews.appendChild(newsContent);
        return blockNews;
    }

    socialLick() {
        let socials = document.querySelectorAll('.social-block')

        socials.forEach(social => {
            social.addEventListener('click', e => {
                openSafeExternalUrl(e.currentTarget.dataset.url || e.target.dataset.url)
            })
        });
    }

    async instancesSelect() {
        let configClient = await this.db.readData('configClient')
        let auth = await this.db.readData('accounts', configClient.account_selected)
        let instancesList = await config.getInstanceList().catch(err => {
            console.error(err);
            return [];
        })
        let instanceSelect = instancesList.find(i => i.name == configClient?.instance_selct) ? configClient?.instance_selct : null

        let playBTN = document.querySelector('.play-btn')
        let instanceSelectBTN = document.querySelector('.instance-select')
        let instancePopup = document.querySelector('.instance-popup')
        let instancesListPopup = document.querySelector('.instances-List')
        let instanceCloseBTN = document.querySelector('.close-popup')
        let selectedProfileName = document.querySelector('.selected-profile-name')
        let selectedInstanceName = document.querySelector('.selected-instance-name')

        if (instancesList.length === 1) {
            instanceSelectBTN?.style.setProperty('display', 'none')
        }

        if (!instanceSelect) {
            let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
            if (!newInstanceSelect) {
                if (selectedProfileName) selectedProfileName.textContent = auth?.name || 'Aucun'
                if (selectedInstanceName) selectedInstanceName.textContent = 'Aucune'
                playBTN?.setAttribute('disabled', 'true')
                playBTN?.classList.add('disabled')
                await setStatus(null)
                return
            }
            let configClient = await this.db.readData('configClient')
            configClient.instance_selct = newInstanceSelect.name
            instanceSelect = newInstanceSelect.name
            await this.db.updateData('configClient', configClient)
        }

        if (selectedProfileName) selectedProfileName.textContent = auth?.name || 'Aucun'
        if (selectedInstanceName) selectedInstanceName.textContent = instanceSelect || 'Aucune'
        playBTN?.removeAttribute('disabled')
        playBTN?.classList.remove('disabled')

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = Array.isArray(instance.whitelist) ? instance.whitelist.find(whitelist => whitelist == auth?.name) : undefined
                if (whitelist !== auth?.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        if (!newInstanceSelect) {
                            let configClient = await this.db.readData('configClient')
                            configClient.instance_selct = null
                            instanceSelect = null
                            if (selectedInstanceName) selectedInstanceName.textContent = 'Aucune'
                            playBTN?.setAttribute('disabled', 'true')
                            playBTN?.classList.add('disabled')
                            await setStatus(null)
                            await this.db.updateData('configClient', configClient)
                            continue;
                        }
                        let configClient = await this.db.readData('configClient')
                        configClient.instance_selct = newInstanceSelect.name
                        instanceSelect = newInstanceSelect.name
                        if (selectedInstanceName) selectedInstanceName.textContent = instanceSelect
                        setStatus(newInstanceSelect.status)
                        await this.db.updateData('configClient', configClient)
                    }
                }
            } else console.log(`Initializing instance ${instance.name}...`)
            if (instance.name == instanceSelect) setStatus(instance.status)
        }

        instancePopup.addEventListener('click', async e => {
            let configClient = await this.db.readData('configClient')

            if (e.target.classList.contains('instance-elements')) {
                let newInstanceSelect = e.target.id
                let activeInstanceSelect = document.querySelector('.active-instance')

                if (activeInstanceSelect) activeInstanceSelect.classList.toggle('active-instance');
                e.target.classList.add('active-instance');

                configClient.instance_selct = newInstanceSelect
                await this.db.updateData('configClient', configClient)
                instanceSelect = newInstanceSelect
                if (selectedInstanceName) selectedInstanceName.textContent = newInstanceSelect
                this.closeInstancePopup(instancePopup)
                let instance = await config.getInstanceList()
                let options = instance.find(i => i.name == configClient.instance_selct)
                await setStatus(options?.status)
            }
        })

        instanceSelectBTN?.addEventListener('click', async () => {
            let configClient = await this.db.readData('configClient')
            let instanceSelect = configClient.instance_selct
            let auth = await this.db.readData('accounts', configClient.account_selected)

            instancesListPopup.textContent = ''
            for (let instance of instancesList) {
                if (instance.whitelistActive) {
                    const whitelistEntries = Array.isArray(instance.whitelist) ? instance.whitelist : [];
                    whitelistEntries.map(whitelist => {
                        if (whitelist == auth?.name) {
                            instancesListPopup.appendChild(this.createInstanceElement(instance, instanceSelect));
                        }
                    })
                } else {
                    instancesListPopup.appendChild(this.createInstanceElement(instance, instanceSelect));
                }
            }

            this.openInstancePopup(instancePopup)
        })

        playBTN?.addEventListener('click', async () => {
            if (playBTN.disabled || playBTN.classList.contains('is-activating')) return;
            playBTN.classList.add('is-activating');
            await new Promise(resolve => setTimeout(resolve, 180));
            playBTN.classList.remove('is-activating');
            await this.startGame()
        })

        instanceCloseBTN?.addEventListener('click', () => this.closeInstancePopup(instancePopup))
        instancePopup.addEventListener('click', e => {
            if (e.target === instancePopup) this.closeInstancePopup(instancePopup);
        })
    }

    openInstancePopup(instancePopup) {
        instancePopup.style.display = 'flex';
        requestAnimationFrame(() => instancePopup.classList.add('is-open'));
    }

    closeInstancePopup(instancePopup) {
        instancePopup.classList.remove('is-open');
        setTimeout(() => {
            if (!instancePopup.classList.contains('is-open')) instancePopup.style.display = 'none';
        }, 230);
    }

    createInstanceElement(instance, instanceSelect) {
        let element = createElement('instance-elements', instance.name);
        element.id = instance.name;
        if (instance.name == instanceSelect) element.classList.add('active-instance');
        return element;
    }

    async startGame() {
        let playInstanceBTN = document.querySelector('.play-instance');
        let profileSwitchBTN = document.querySelector('.profile-switch');
        let infoStartingBOX = document.querySelector('.info-starting-game');
        let infoStarting = document.querySelector(".info-starting-game-text");
        let launchStageDetail = document.querySelector('.launch-stage-detail');
        let progressBar = document.querySelector('.progress-bar');
        const launch = new Launch();
        let launchLogPath = null;

        try {
            let configClient = await this.db.readData('configClient');
            let instance = await config.getInstanceList();
            let authenticator = await this.db.readData('accounts', configClient.account_selected);
            let options = instance.find(i => i.name == configClient.instance_selct);
            let loaderConfig = options?.loadder || options?.loader;

            if (!authenticator) {
                throw { error: 'Aucun profil Minecraft n’est sélectionné. Reconnectez votre compte Microsoft.' };
            }

            if (authenticator.meta?.type === 'Xbox' && (!authenticator.name || !authenticator.uuid || !authenticator.access_token)) {
                throw { error: 'Le profil Microsoft enregistré est incomplet. Reconnectez le compte avant de lancer Minecraft.' };
            }

            if (!options) {
                throw { error: `Instance "${configClient.instance_selct}" introuvable.` };
            }

            if (!loaderConfig) {
                throw { error: `Configuration du loader introuvable pour l'instance "${options.name}".` };
            }

            const appDataPath = await appdata();
            const dataDirectoryName = process.platform === 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`;
            const instancePath = path.join(appDataPath, dataDirectoryName);
            launchLogPath = prepareLaunchLog(instancePath);
            const loaderLabel = loaderConfig.loadder_type?.toLowerCase() === 'neoforge' ? 'NeoForge' : 'Forge';
            const launchStartedAt = Date.now();
            let phaseStartedAt = null;
            let lastPhaseActivityAt = null;
            let phaseHelpDisplayed = false;
            let phaseWatchdog = null;
            let activePhaseLabel = null;
            let lastWatchdogLogAt = 0;

            const setLaunchStage = (title, detail) => {
                infoStarting.textContent = title;
                launchStageDetail.textContent = stageDetail(detail, title);
            };

            const stopPhaseWatchdog = (reason = 'étape suivante') => {
                if (activePhaseLabel && phaseStartedAt) {
                    appendLaunchLog(launchLogPath, 'PHASE_END', `${activePhaseLabel} - ${formatElapsedTime(Date.now() - phaseStartedAt)} - ${reason}`);
                }
                if (phaseWatchdog) clearInterval(phaseWatchdog);
                phaseWatchdog = null;
                phaseStartedAt = null;
                lastPhaseActivityAt = null;
                phaseHelpDisplayed = false;
                activePhaseLabel = null;
                lastWatchdogLogAt = 0;
            };

            const noteLaunchActivity = (event, value) => {
                appendLaunchLog(launchLogPath, event, value);
                if (phaseStartedAt) lastPhaseActivityAt = Date.now();
            };

            const startPhaseWatchdog = (phaseLabel) => {
                const now = Date.now();
                if (activePhaseLabel !== phaseLabel) {
                    if (activePhaseLabel && phaseStartedAt) {
                        appendLaunchLog(launchLogPath, 'PHASE_END', `${activePhaseLabel} - ${formatElapsedTime(now - phaseStartedAt)} - transition`);
                    }
                    activePhaseLabel = phaseLabel;
                    phaseStartedAt = now;
                    phaseHelpDisplayed = false;
                    appendLaunchLog(launchLogPath, 'PHASE_START', phaseLabel);
                }
                lastPhaseActivityAt = now;
                if (phaseWatchdog) return;

                phaseWatchdog = setInterval(() => {
                    const currentTime = Date.now();
                    const inactiveFor = currentTime - lastPhaseActivityAt;
                    const phaseDuration = currentTime - phaseStartedAt;
                    const elapsedMinutes = Math.max(1, Math.floor(phaseDuration / 60000));

                    if (inactiveFor >= PATCH_WARNING_DELAY) {
                        const slowPhaseLabel = activePhaseLabel === 'Finalisation'
                            ? 'Finalisation lente'
                            : `${activePhaseLabel} lent`;
                        const lastKnownDetail = launchStageDetail.textContent;
                        setLaunchStage(`${slowPhaseLabel} (${elapsedMinutes} min)...`, `Aucune nouvelle activité depuis ${Math.floor(inactiveFor / 1000)} secondes`);
                        if (currentTime - lastWatchdogLogAt >= 60000) {
                            lastWatchdogLogAt = currentTime;
                            const rendererMemory = Math.round(process.memoryUsage().rss / 1048576);
                            const freeMemory = (os.freemem() / 1073741824).toFixed(1);
                            appendLaunchLog(launchLogPath, 'WATCHDOG_STATE', `phase=${activePhaseLabel} | durée=${formatElapsedTime(phaseDuration)} | inactivité=${formatElapsedTime(inactiveFor)} | dernier détail=${lastKnownDetail} | renderer=${rendererMemory} Mo | RAM libre=${freeMemory} Go`);
                        }
                    }

                    if (phaseDuration >= PATCH_HELP_DELAY && !phaseHelpDisplayed) {
                        phaseHelpDisplayed = true;
                        appendLaunchLog(launchLogPath, 'WATCHDOG', `${activePhaseLabel} sans fin après ${elapsedMinutes} minutes.`);
                        appendJavaProcessSnapshot(launchLogPath);
                        new popup().openPopup({
                            title: 'Traitement anormalement long',
                            content: `Le traitement est toujours actif. Ne relancez pas Minecraft tant qu'un processus Java est en cours. Le diagnostic a été enregistré dans :\n${launchLogPath}`,
                            color: '#e6a23c',
                            options: true,
                            openPath: launchLogPath
                        });
                    }
                }, 15000);
            };

            appendLaunchLog(launchLogPath, 'SESSION', '------------------------------------------------------------');
            appendLaunchLog(launchLogPath, 'START', `${options.name} - Minecraft ${loaderConfig.minecraft_version} - ${loaderConfig.loadder_type} ${loaderConfig.loadder_version}`);
            appendLaunchLog(launchLogPath, 'LAUNCHER', `${pkg.version} | Electron ${process.versions.electron} | Node ${process.versions.node}`);
            appendLaunchLog(launchLogPath, 'SYSTEM', `${process.platform} ${process.arch} | ${os.cpus().length} CPU | RAM ${Math.round(os.freemem() / 1073741824)}/${Math.round(os.totalmem() / 1073741824)} Go libre`);
            appendLaunchLog(launchLogPath, 'PATH', `Racine : ${instancePath}`);
            appendLaunchLog(launchLogPath, 'CONFIG', `verify=${Boolean(options.verify)} | téléchargements=${configClient.launcher_config.download_multi} | mémoire=${configClient.java_config.java_memory.min}-${configClient.java_config.java_memory.max} Go | Java=${configClient.java_config.java_path || 'runtime intégré'}`);
            appendLaunchLog(launchLogPath, 'ACCOUNT', `${authenticator?.name || 'inconnu'} | type=${authenticator?.meta?.type || 'inconnu'} | jetons volontairement masqués`);
            appendLaunchLog(launchLogPath, 'REMOTE', options.url || 'manifest Mojang');

            let opt = {
                url: options.url,
                authenticator: authenticator,
                timeout: 30000,
                path: instancePath,
                instance: options.name,
                version: loaderConfig.minecraft_version,
                detached: configClient.launcher_config.closeLauncher == "close-all" ? false : true,
                downloadFileMultiple: configClient.launcher_config.download_multi,
                intelEnabledMac: configClient.launcher_config.intelEnabledMac,

                loader: {
                    type: loaderConfig.loadder_type,
                    build: loaderConfig.loadder_version,
                    enable: loaderConfig.loadder_type == 'none' ? false : true
                },

                verify: options.verify,

                ignored: [...(options.ignored || [])],

                java: {
                    path: configClient.java_config.java_path,
                },

                JVM_ARGS:  options.jvm_args ? options.jvm_args : [],
                GAME_ARGS: options.game_args ? options.game_args : [],

                screen: {
                    width: configClient.game_config.screen_size.width,
                    height: configClient.game_config.screen_size.height
                },

                memory: {
                    min: `${configClient.java_config.java_memory.min * 1024}M`,
                    max: `${configClient.java_config.java_memory.max * 1024}M`
                }
            }

            playInstanceBTN.style.display = "none"
            infoStartingBOX.style.display = "block"
            progressBar.style.display = "";
            setLaunchStage('Préparation du lancement...', `Chargement de ${options.name} avec ${loaderLabel} ${loaderConfig.loadder_version}`);
            profileSwitchBTN?.style.setProperty('visibility', 'hidden');
            profileSwitchBTN?.style.setProperty('pointer-events', 'none');
            ipcRenderer.send('main-window-progress-load')

            launch.on('extract', extract => {
                ipcRenderer.send('main-window-progress-load')
                noteLaunchActivity('EXTRACT', extract);
                setLaunchStage('Extraction des fichiers...', extract);
                console.log(extract);
            });

            launch.on('progress', (progress, size, element) => {
                stopPhaseWatchdog('téléchargement');
                const percentage = size > 0 ? ((progress / size) * 100).toFixed(0) : 0;
                appendLaunchLog(launchLogPath, 'DOWNLOAD', `${progress}/${size} (${percentage}%) | ${element || 'fichier non précisé'}`);
                setLaunchStage(`Téléchargement ${percentage}%`, element ? `Fichier : ${element}` : `${progress} / ${size} octets`);
                ipcRenderer.send('main-window-progress', { progress, size })
                progressBar.value = progress;
                progressBar.max = size;
            });

            launch.on('check', (progress, size, element) => {
                stopPhaseWatchdog('vérification');
                const checkedFiles = Math.min(Number(progress) + 1, Number(size));
                const percentage = size > 0 ? ((checkedFiles / size) * 100).toFixed(0) : 100;
                appendLaunchLog(launchLogPath, 'CHECK', `${checkedFiles}/${size} (${percentage}%) | ${element || 'bibliothèques'}`);
                setLaunchStage(
                    checkedFiles >= size ? 'Finalisation du lancement...' : `Vérification ${percentage}%`,
                    checkedFiles >= size ? `Les ${size} éléments sont contrôlés, préparation de ${loaderLabel}` : `${element || 'Bibliothèques'} : ${checkedFiles}/${size}`
                );
                ipcRenderer.send('main-window-progress', { progress: checkedFiles, size })
                progressBar.value = checkedFiles;
                progressBar.max = size;
                if (checkedFiles >= size) startPhaseWatchdog('Finalisation');
            });

            launch.on('estimated', (time) => {
                let hours = Math.floor(time / 3600);
                let minutes = Math.floor((time - hours * 3600) / 60);
                let seconds = Math.floor(time - hours * 3600 - minutes * 60);
                appendLaunchLog(launchLogPath, 'ESTIMATED', `${hours}h ${minutes}m ${seconds}s`);
                launchStageDetail.textContent = `Temps restant estimé : ${hours ? `${hours} h ` : ''}${minutes ? `${minutes} min ` : ''}${seconds} s`;
                console.log(`${hours}h ${minutes}m ${seconds}s`);
            })

            launch.on('speed', (speed) => {
                appendLaunchLog(launchLogPath, 'SPEED', `${(speed / 1067008).toFixed(2)} Mb/s`);
                console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
            })

            launch.on('patch', patch => {
                startPhaseWatchdog(`Patch ${loaderLabel}`);
                noteLaunchActivity('PATCH', patch);
                console.log(patch);
                ipcRenderer.send('main-window-progress-load')
                setLaunchStage(`Patch ${loaderLabel} en cours...`, stageDetail(patch, 'Exécution du patch Java'));
            });

            launch.on('data', (e) => {
                stopPhaseWatchdog('Minecraft démarré');
                appendLaunchLog(launchLogPath, 'MINECRAFT', e);
                progressBar.style.display = "none"
                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-hide")
                };
                new logger('Minecraft', '#36b030');
                ipcRenderer.send('main-window-progress-load')
                setLaunchStage('Démarrage en cours...', 'Le processus Minecraft a été créé');
                console.log(e);
            })

            launch.on('close', code => {
                stopPhaseWatchdog('processus terminé');
                appendLaunchLog(launchLogPath, 'CLOSE', `code=${code} | durée totale=${formatElapsedTime(Date.now() - launchStartedAt)}`);
                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-show")
                };
                ipcRenderer.send('main-window-progress-reset')
                infoStartingBOX.style.display = "none"
                playInstanceBTN.style.display = "flex"
                profileSwitchBTN?.style.removeProperty('visibility');
                profileSwitchBTN?.style.removeProperty('pointer-events');
                infoStarting.textContent = `Vérification`
                launchStageDetail.textContent = 'Prêt à relancer';
                new logger(pkg.name, '#7289da');
                console.log('Close');
            });

            launch.on('error', err => {
                stopPhaseWatchdog('erreur');
                const errorMessage = formatLaunchError(err);
                appendLaunchLog(launchLogPath, 'ERROR', `${errorMessage}${err?.stack ? `\n${err.stack}` : ''}`);
                let popupError = new popup()

                popupError.openPopup({
                    title: 'Erreur',
                    content: `${errorMessage}\n\nJournal : ${launchLogPath}`,
                    color: 'red',
                    options: true,
                    openPath: launchLogPath
                })

                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-show")
                };
                ipcRenderer.send('main-window-progress-reset')
                infoStartingBOX.style.display = "none"
                playInstanceBTN.style.display = "flex"
                profileSwitchBTN?.style.removeProperty('visibility');
                profileSwitchBTN?.style.removeProperty('pointer-events');
                infoStarting.textContent = `Vérification`
                launchStageDetail.textContent = 'Le lancement a échoué';
                new logger(pkg.name, '#7289da');
                console.log(err);
            });

            appendLaunchLog(launchLogPath, 'DISPATCH', 'Transmission de la configuration au cœur Minecraft.');
            launch.Launch(opt);
        } catch (err) {
            const errorMessage = formatLaunchError(err);
            if (launchLogPath) appendLaunchLog(launchLogPath, 'FATAL', `${errorMessage}${err?.stack ? `\n${err.stack}` : ''}`);
            let popupError = new popup();
            popupError.openPopup({
                title: 'Erreur',
                content: launchLogPath ? `${errorMessage}\n\nJournal : ${launchLogPath}` : errorMessage,
                color: 'red',
                options: true,
                openPath: launchLogPath
            })
            ipcRenderer.send('main-window-progress-reset')
            infoStartingBOX.style.display = "none"
            playInstanceBTN.style.display = "flex"
            profileSwitchBTN?.style.removeProperty('visibility');
            profileSwitchBTN?.style.removeProperty('pointer-events');
            infoStarting.textContent = `Vérification`
            launchStageDetail.textContent = 'Le lancement a échoué';
            console.error(err);
        }
    }

    getdate(e) {
        let date = new Date(e)
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        let day = date.getDate()
        let allMonth = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
        return { year: year, month: allMonth[month - 1], day: day }
    }
}
export default Home;
