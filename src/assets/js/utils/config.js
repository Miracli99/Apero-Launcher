/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */

const pkg = require('../package.json');
const nodeFetch = require("node-fetch");
const convert = require('xml-js');
let url = pkg.user ? `${pkg.url}/${pkg.user}` : pkg.url

let config = `${url}/launcher/config-launcher/config.json`;
let news = `${url}/launcher/news-launcher/news.json`;

class Config {
    GetConfig() {
        return new Promise((resolve, reject) => {
            nodeFetch(config).then(async config => {
                if (config.status === 200) return resolve(config.json());
                else return reject({ error: { code: config.statusText, message: 'server not accessible' } });
            }).catch(error => {
                return reject({ error });
            })
        })
    }

    async getInstanceList() {
        const urlInstance = `${url}/files`;
        let response;
        try {
            response = await nodeFetch(urlInstance);
        } catch (error) {
            throw { error: { code: 'NETWORK_ERROR', message: 'Impossible de contacter le serveur d’instances.', details: error } };
        }

        if (!response.ok) {
            throw { error: { code: response.status, message: `Serveur d’instances indisponible (${response.statusText})` } };
        }

        let instancesJSON;
        try {
            instancesJSON = await response.json();
        } catch (error) {
            throw { error: { code: 'INVALID_JSON', message: 'Réponse invalide du serveur d’instances.', details: error } };
        }

        if (!instancesJSON || typeof instancesJSON !== 'object') {
            throw { error: { code: 'INVALID_DATA', message: 'Liste des instances introuvable ou vide.' } };
        }

        const instancesList = [];
        for (let [name, data] of Object.entries(instancesJSON)) {
            let instance = data;
            instance.name = name;
            instancesList.push(instance);
        }
        return instancesList;
    }

    async getNews() {
        let config = await this.GetConfig() || {}

        if (config.rss) {
            return new Promise((resolve, reject) => {
                nodeFetch(config.rss).then(async config => {
                    if (config.status === 200) {
                        let news = [];
                        let response = await config.text()
                        response = (JSON.parse(convert.xml2json(response, { compact: true })))?.rss?.channel?.item;

                        if (!Array.isArray(response)) response = [response];
                        for (let item of response) {
                            news.push({
                                title: item.title._text,
                                content: item['content:encoded']._text,
                                author: item['dc:creator']._text,
                                publish_date: item.pubDate._text
                            })
                        }
                        return resolve(news);
                    }
                    else return reject({ error: { code: config.statusText, message: 'server not accessible' } });
                }).catch(error => reject({ error }))
            })
        } else {
            return new Promise((resolve, reject) => {
                nodeFetch(news).then(async config => {
                    if (config.status === 200) return resolve(config.json());
                    else return reject({ error: { code: config.statusText, message: 'server not accessible' } });
                }).catch(error => {
                    return reject({ error });
                })
            })
        }
    }
}

export default new Config;
