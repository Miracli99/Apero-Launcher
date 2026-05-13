/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */
import { config, database, logger, changePanel, appdata, setStatus, pkg, popup } from '../utils.js'

const { Launch } = require('minecraft-java-core')
const { shell, ipcRenderer } = require('electron')
const path = require('path')

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
        this.instancesSelect()
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
                instancePopup.style.display = 'none'
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

            instancePopup.style.display = 'flex'
        })

        playBTN?.addEventListener('click', async () => {
            await this.startGame()
        })

        instanceCloseBTN?.addEventListener('click', () => instancePopup.style.display = 'none')
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
        let progressBar = document.querySelector('.progress-bar');
        const launch = new Launch();

        try {
            let configClient = await this.db.readData('configClient');
            let instance = await config.getInstanceList();
            let authenticator = await this.db.readData('accounts', configClient.account_selected);
            let options = instance.find(i => i.name == configClient.instance_selct);
            let loaderConfig = options?.loadder || options?.loader;

            if (!options) {
                throw { error: `Instance "${configClient.instance_selct}" introuvable.` };
            }

            if (!loaderConfig) {
                throw { error: `Configuration du loader introuvable pour l'instance "${options.name}".` };
            }

            const appDataPath = await appdata();
            const dataDirectoryName = process.platform === 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`;
            const instancePath = path.join(appDataPath, dataDirectoryName);

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
            profileSwitchBTN?.style.setProperty('visibility', 'hidden');
            profileSwitchBTN?.style.setProperty('pointer-events', 'none');
            ipcRenderer.send('main-window-progress-load')

            launch.on('extract', extract => {
                ipcRenderer.send('main-window-progress-load')
                console.log(extract);
            });

            launch.on('progress', (progress, size) => {
                infoStarting.textContent = `Téléchargement ${((progress / size) * 100).toFixed(0)}%`
                ipcRenderer.send('main-window-progress', { progress, size })
                progressBar.value = progress;
                progressBar.max = size;
            });

            launch.on('check', (progress, size) => {
                infoStarting.textContent = `Vérification ${((progress / size) * 100).toFixed(0)}%`
                ipcRenderer.send('main-window-progress', { progress, size })
                progressBar.value = progress;
                progressBar.max = size;
            });

            launch.on('estimated', (time) => {
                let hours = Math.floor(time / 3600);
                let minutes = Math.floor((time - hours * 3600) / 60);
                let seconds = Math.floor(time - hours * 3600 - minutes * 60);
                console.log(`${hours}h ${minutes}m ${seconds}s`);
            })

            launch.on('speed', (speed) => {
                console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
            })

            launch.on('patch', patch => {
                console.log(patch);
                ipcRenderer.send('main-window-progress-load')
                infoStarting.textContent = `Patch en cours...`
            });

            launch.on('data', (e) => {
                progressBar.style.display = "none"
                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-hide")
                };
                new logger('Minecraft', '#36b030');
                ipcRenderer.send('main-window-progress-load')
                infoStarting.textContent = `Demarrage en cours...`
                console.log(e);
            })

            launch.on('close', code => {
                if (configClient.launcher_config.closeLauncher == 'close-launcher') {
                    ipcRenderer.send("main-window-show")
                };
                ipcRenderer.send('main-window-progress-reset')
                infoStartingBOX.style.display = "none"
                playInstanceBTN.style.display = "flex"
                profileSwitchBTN?.style.removeProperty('visibility');
                profileSwitchBTN?.style.removeProperty('pointer-events');
                infoStarting.textContent = `Vérification`
                new logger(pkg.name, '#7289da');
                console.log('Close');
            });

            launch.on('error', err => {
                let popupError = new popup()

                popupError.openPopup({
                    title: 'Erreur',
                    content: err.error,
                    color: 'red',
                    options: true
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
                new logger(pkg.name, '#7289da');
                console.log(err);
            });

            launch.Launch(opt);
        } catch (err) {
            let popupError = new popup();
            popupError.openPopup({
                title: 'Erreur',
                content: err?.error || err?.message || 'Impossible de charger le profil.',
                color: 'red',
                options: true
            })
            ipcRenderer.send('main-window-progress-reset')
            infoStartingBOX.style.display = "none"
            playInstanceBTN.style.display = "flex"
            profileSwitchBTN?.style.removeProperty('visibility');
            profileSwitchBTN?.style.removeProperty('pointer-events');
            infoStarting.textContent = `Vérification`
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
