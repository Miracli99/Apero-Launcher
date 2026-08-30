/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */
const { AZauth, Mojang } = require('minecraft-java-core');
const { ipcRenderer } = require('electron');

import { popup, database, changePanel, accountSelect, addAccount, config, setStatus } from '../utils.js';

const MICROSOFT_FALLBACK_CLIENT_ID = '00000000402b5328';

function getErrorMessage(err) {
    if (err == null) return 'Erreur inconnue';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    if (err.message) return getErrorMessage(err.message);
    if (err.errorMessage) return getErrorMessage(err.errorMessage);
    if (err.error) return getErrorMessage(err.error);
    return 'Erreur inconnue';
}

function validateMicrosoftProfile(account) {
    if (account?.error) return getErrorMessage(account);
    if (account?.meta?.type !== 'Xbox') return 'La connexion Microsoft n’a retourné aucun profil Xbox valide.';
    if (!account.name || !account.uuid || !account.access_token) {
        return 'Le compte Microsoft est connecté, mais aucun profil Minecraft Java complet n’a été reçu. Vérifiez que ce compte possède Minecraft Java, puis reconnectez-vous.';
    }
    return null;
}

class Login {
    static id = "login";
    async init(config) {
        this.config = config;
        this.db = new database();

        if (typeof this.config.online == 'boolean') {
            this.config.online ? this.getMicrosoft() : this.getCrack()
        } else if (typeof this.config.online == 'string') {
            if (this.config.online.match(/^(http|https):\/\/[^ "]+$/)) {
                this.getAZauth();
            }
        }
        
        document.querySelector('.cancel-home').addEventListener('click', () => {
            document.querySelector('.cancel-home').style.display = 'none'
            changePanel('settings')
        })
    }

    async getMicrosoft() {
        console.log('Initializing Microsoft login...');
        let popupLogin = new popup();
        let loginHome = document.querySelector('.login-home');
        let microsoftBtn = document.querySelector('.connect-home');
        loginHome.style.display = 'block';

        microsoftBtn.addEventListener("click", () => {
            const clientId = this.config?.client_id ?? MICROSOFT_FALLBACK_CLIENT_ID;
            popupLogin.openPopup({
                title: 'Connexion',
                content: 'Veuillez patienter...',
                color: 'var(--color)'
            });

            ipcRenderer.invoke('Microsoft-window', clientId).then(async account_connect => {
                if (account_connect == 'cancel' || !account_connect) {
                    popupLogin.closePopup();
                    return;
                }

                const profileError = validateMicrosoftProfile(account_connect);
                if (profileError) {
                    popupLogin.openPopup({
                        title: 'Profil Minecraft introuvable',
                        content: profileError,
                        options: true
                    });
                    return;
                }

                await this.saveData(account_connect)
                popupLogin.closePopup();

            }).catch(err => {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: getErrorMessage(err),
                    options: true
                });
            });
        })
    }

    async getCrack() {
        console.log('Initializing offline login...');
        let popupLogin = new popup();
        let loginOffline = document.querySelector('.login-offline');

        let emailOffline = document.querySelector('.email-offline');
        let connectOffline = document.querySelector('.connect-offline');
        loginOffline.style.display = 'block';

        connectOffline.addEventListener('click', async () => {
            if (emailOffline.value.length < 3) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Votre pseudo doit faire au moins 3 caractères.',
                    options: true
                });
                return;
            }

            if (emailOffline.value.match(/ /g)) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Votre pseudo ne doit pas contenir d\'espaces.',
                    options: true
                });
                return;
            }

            let MojangConnect = await Mojang.login(emailOffline.value);

            if (MojangConnect.error) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: MojangConnect.message,
                    options: true
                });
                return;
            }
            try {
                await this.saveData(MojangConnect)
                popupLogin.closePopup();
            } catch (err) {
                popupLogin.openPopup({
                    title: 'Erreur',
                    content: getErrorMessage(err),
                    options: true
                });
            }
        });
    }

    async getAZauth() {
        console.log('Initializing AZauth login...');
        let AZauthClient = new AZauth(this.config.online);
        let PopupLogin = new popup();
        let loginAZauth = document.querySelector('.login-AZauth');
        let loginAZauthA2F = document.querySelector('.login-AZauth-A2F');

        let AZauthEmail = document.querySelector('.email-AZauth');
        let AZauthPassword = document.querySelector('.password-AZauth');
        let AZauthA2F = document.querySelector('.A2F-AZauth');
        let connectAZauthA2F = document.querySelector('.connect-AZauth-A2F');
        let AZauthConnectBTN = document.querySelector('.connect-AZauth');
        let AZauthCancelA2F = document.querySelector('.cancel-AZauth-A2F');

        loginAZauth.style.display = 'block';

        AZauthConnectBTN.addEventListener('click', async () => {
            PopupLogin.openPopup({
                title: 'Connexion en cours...',
                content: 'Veuillez patienter...',
                color: 'var(--color)'
            });

            if (AZauthEmail.value == '' || AZauthPassword.value == '') {
                PopupLogin.openPopup({
                    title: 'Erreur',
                    content: 'Veuillez remplir tous les champs.',
                    options: true
                });
                return;
            }

            let AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value);

            if (AZauthConnect.error) {
                PopupLogin.openPopup({
                    title: 'Erreur',
                    content: AZauthConnect.message,
                    options: true
                });
                return;
            } else if (AZauthConnect.A2F) {
                loginAZauthA2F.style.display = 'block';
                loginAZauth.style.display = 'none';
                PopupLogin.closePopup();

                AZauthCancelA2F.addEventListener('click', () => {
                    loginAZauthA2F.style.display = 'none';
                    loginAZauth.style.display = 'block';
                });

                connectAZauthA2F.addEventListener('click', async () => {
                    PopupLogin.openPopup({
                        title: 'Connexion en cours...',
                        content: 'Veuillez patienter...',
                        color: 'var(--color)'
                    });

                    if (AZauthA2F.value == '') {
                        PopupLogin.openPopup({
                            title: 'Erreur',
                            content: 'Veuillez entrer le code A2F.',
                            options: true
                        });
                        return;
                    }

                    AZauthConnect = await AZauthClient.login(AZauthEmail.value, AZauthPassword.value, AZauthA2F.value);

                    if (AZauthConnect.error) {
                        PopupLogin.openPopup({
                            title: 'Erreur',
                            content: AZauthConnect.message,
                            options: true
                        });
                        return;
                    }

                    try {
                        await this.saveData(AZauthConnect)
                        PopupLogin.closePopup();
                    } catch (err) {
                        PopupLogin.openPopup({
                            title: 'Erreur',
                            content: getErrorMessage(err),
                            options: true
                        });
                    }
                });
            } else if (!AZauthConnect.A2F) {
                try {
                    await this.saveData(AZauthConnect)
                    PopupLogin.closePopup();
                } catch (err) {
                    PopupLogin.openPopup({
                        title: 'Erreur',
                        content: getErrorMessage(err),
                        options: true
                    });
                }
            }
        });
    }

    async saveData(connectionData) {
        if (connectionData?.meta?.type === 'Xbox') {
            const clientId = this.config?.client_id ?? MICROSOFT_FALLBACK_CLIENT_ID;
            connectionData.meta = { ...connectionData.meta, client_id: clientId };
        }
        let configClient = await this.db.readData('configClient');
        let account;
        if (connectionData?.meta?.type === 'Xbox') {
            const savedAccounts = await this.db.readAllData('accounts');
            const existingAccount = savedAccounts.find(savedAccount => {
                if (savedAccount.meta?.type !== 'Xbox') return false;
                if (connectionData.uuid && savedAccount.uuid === connectionData.uuid) return true;
                return savedAccount.name === connectionData.name;
            });

            if (existingAccount) {
                const refreshedMeta = { ...existingAccount.meta, ...connectionData.meta };
                delete refreshedMeta.requires_reauth;
                delete refreshedMeta.refresh_error;
                account = { ...connectionData, ID: existingAccount.ID, meta: refreshedMeta };
                await this.db.updateData('accounts', account, existingAccount.ID);
            }
        }
        if (!account) account = await this.db.createData('accounts', connectionData)
        let instanceSelect = configClient.instance_selct
        let instancesList = await config.getInstanceList()
        configClient.account_selected = account.ID;

        for (let instance of instancesList) {
            if (instance.whitelistActive) {
                let whitelist = Array.isArray(instance.whitelist) ? instance.whitelist.find(whitelist => whitelist == account.name) : undefined
                if (whitelist !== account.name) {
                    if (instance.name == instanceSelect) {
                        let newInstanceSelect = instancesList.find(i => i.whitelistActive == false)
                        if (!newInstanceSelect) {
                            configClient.instance_selct = null
                            await setStatus(null)
                            continue;
                        }
                        configClient.instance_selct = newInstanceSelect.name
                        await setStatus(newInstanceSelect.status)
                    }
                }
            }
        }

        await this.db.updateData('configClient', configClient);
        await addAccount(account);
        await accountSelect(account);
        changePanel('home');
    }
}
export default Login;
