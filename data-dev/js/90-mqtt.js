// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
class MQTT {
    initialized = false;
    // Dernier root topic RÉELLEMENT en vigueur côté firmware. Le panneau MQTT n'est peuplé qu'à
    // l'ouverture du socket et après connexion (cf. 20-shell.js) : revenir sur l'onglet ne le
    // recharge pas. Tant que tout enregistrement était accepté, le champ affiché ne pouvait pas
    // diverger de ce qui était stocké ; depuis que le root topic peut être REFUSÉ, il le peut --
    // et un champ resté vide se lit comme "le vide a été enregistré", ce qu'il n'a pas été.
    // Cette valeur sert à remettre le champ en accord avec le firmware sur un refus.
    storedRootTopic = '';
    init() {
        this.initialized = true;
        const page = get('divMQTT');
        bindGenSections(page);
        // Différé d'un tour : _markDirty (watchDirty) passe après cet écouteur.
        ['input', 'change'].forEach(evt => page.addEventListener(evt, () => setTimeout(() => this.updateDirtyCount(), 0)));
        this._saveBar = new SaveBar(page, { onSave: () => this.connectMQTT(), onRevert: () => this.revertPage() });
        // La découverte vit sur la page Home Assistant, avec sa propre barre : /connectmqtt ne lit
        // que les clés reçues, chaque page n'envoie donc que les siennes.
        const ha = get('divHomeAssistant');
        bindGenSections(ha);
        ['input', 'change'].forEach(evt => ha.addEventListener(evt, () => setTimeout(() => this.updateDirtyCount(), 0)));
        this._haBar = new SaveBar(ha, { onSave: () => this.saveDiscovery(), onRevert: () => this.revertPage() });
    }

    // Onglets mobiles de la page Home Assistant ; sur PC les deux sections partagent une grille.
    haTab(i) {
        const page = get('divHomeAssistant');
        page.dataset.haTab = String(i);
        page.querySelectorAll('.ha-tabs .gen-tab').forEach((b, n) => {
            b.classList.toggle('selected', n === i);
            b.setAttribute('aria-selected', n === i ? 'true' : 'false');
        });
        genTabsSync(page.querySelector('.ha-tabs'));
    }

    async loadMQTT() {
        getJSONSync('/mqttsettings', (err, settings) => {
            if (err) {
                ui.serviceError(err);
            } else {
                this._settings = settings;
                this.storedRootTopic = settings.rootTopic || '';
                this._applySettings();
                watchDirty(get('divMQTT'));
                watchDirty(get('divHomeAssistant'));
                this.updateDirtyCount();
            }
        });
    }
    // Remet à l'écran l'état enregistré : au chargement, après un enregistrement et sur « Annuler ».
    // only : 'mqtt' ou 'ha' pour ne remettre qu'une page, sans écraser la saisie en cours de l'autre.
    _applySettings(only) {
        const s = this._settings;
        if (only !== 'ha') ui.toElement(get('divMQTT'), { mqtt: s });
        if (only !== 'mqtt') ui.toElement(get('divHomeAssistant'), { mqtt: s });
        // Le serveur ne renvoie jamais le mot de passe existant, seulement s'il est défini :
        // masque factice si déjà configuré, jamais de pré-remplissage avec le vrai secret.
        resetSecretField(get('fldMqttPassword'), s.hasPassword);
        this._render();
    }
    // Tête d'état et aperçus suivent la saisie, avant tout enregistrement.
    _render() {
        const on = get('cbMqttEnabled').checked, disco = get('cbPubDisco').checked;
        const root = get('fldMqttTopic').value.trim() || '…';
        const dTopic = get('fldDiscoTopic').value.trim() || '…';
        const user = get('fldMqttUsername').value.trim();
        get('mqttHeroHalo').classList.toggle('is-off', !on);
        get('mqttHeroTitle').textContent = tr(on ? 'ENABLED' : 'IS_DISABLED');
        get('mqttHeroBroker').textContent = `mqtt://${get('fldMqttHost').value.trim() || '…'}:${get('fldMqttPort').value.trim() || '…'}`;
        get('mqttHeroRoot').textContent = root;
        get('mqttHeroDisco').textContent = disco ? tr('MQTT_HERO_DISCO_ON').replace('{TOPIC}', dTopic) : tr('MQTT_HERO_DISCO_OFF');
        get('mqttHeroCred').textContent = user ? tr('MQTT_HERO_CRED_USER').replace('{USER}', user) : tr('NONE');
        get('mqttHeroSum').textContent = `${get('mqttHeroBroker').textContent.replace('mqtt://', '')} · ${root}`;
        get('mqttOffNote').hidden = on;
        get('divMQTT').classList.toggle('mqtt-off', !on);
        get('divHomeAssistant').classList.toggle('mqtt-off', !on);
        get('haMqttOffTile').hidden = on;
        get('codeMqttStatus').textContent = root + '/status';
        get('codeMqttPos').textContent = root + '/shades/1/position';
        get('codeMqttCmd').textContent = root + '/shades/1/target/set';
        get('codeMqttDisco').textContent = dTopic + '/cover/1/config';
        get('mqttPrevDisco').hidden = !disco;
        get('mqttPrevDiscoOff').hidden = disco;
        get('fldDiscoTopic').disabled = !disco;
    }
    _fields() {
        const s = this._settings || {};
        const yesNo = (v) => tr(v ? 'BT_YES' : 'BT_NO');
        const field = (label, id, saved, now, show = (v) => v, secret = false) => ({ label, el: get(id), saved, now, show, secret, ha: get('divHomeAssistant').contains(get(id)) });
        const val = (id) => get(id).value;
        return [
            field('MQTT_HERO_ENABLE', 'cbMqttEnabled', !!s.enabled, get('cbMqttEnabled').checked, yesNo),
            field('MQTT_HOST', 'fldMqttHost', s.hostname || '', val('fldMqttHost')),
            field('MQTT_PORT', 'fldMqttPort', String(s.port ?? ''), val('fldMqttPort')),
            field('MQTT_USERNAME', 'fldMqttUsername', s.username || '', val('fldMqttUsername')),
            field('SECURITY_PASSWORD', 'fldMqttPassword', '', secretValue(get('fldMqttPassword')), undefined, true),
            field('MQTT_ROOT_TOPIC', 'fldMqttTopic', s.rootTopic || '', val('fldMqttTopic')),
            field('MQTT_CLIENT_ID', 'fldMqttClientId', s.clientId || '', val('fldMqttClientId')),
            field('MQTT_PUB_DISCOVERY', 'cbPubDisco', !!s.pubDisco, get('cbPubDisco').checked, yesNo),
            field('MQTT_DISCOVERY_TOPIC', 'fldDiscoTopic', s.discoTopic || '', val('fldDiscoTopic'))
        ].filter(f => String(f.saved) !== String(f.now));
    }
    updateDirtyCount() {
        if (!this._settings) return;
        const diffs = this._fields();
        [[get('divMQTT'), this._saveBar, false], [get('divHomeAssistant'), this._haBar, true]].forEach(([page, bar, ha]) => {
            if (!bar || !page.offsetParent) return;
            page.querySelectorAll('.is-dirty').forEach(el => el.classList.remove('is-dirty'));
            const mine = diffs.filter(f => f.ha === ha);
            mine.forEach(f => f.el.classList.add('is-dirty'));
            bar.update(mine.map(f => ({ label: tr(f.label), from: f.show(f.saved), to: f.show(f.now), secret: f.secret })));
        });
        _recomputeIsDirty();
        if (!isDirty) document.body.classList.remove('dirty-alerted');
        this._render();
    }
    revertPage() {
        if (!this._settings) return;
        this._applySettings();
        this.updateDirtyCount();
    }

    saveDiscovery() {
        const disco = { pubDisco: get('cbPubDisco').checked, discoTopic: get('fldDiscoTopic').value };
        putJSONSync('/connectmqtt', disco, (err, response) => {
            if (err) {
                ui.serviceError(err);
                logger.error('Failed to save MQTT discovery:', err);
                return;
            }
            ui.toast(tr('MSG_SAVE_SUCCESS'));
            if (response && typeof response.hostname === 'string') this._settings = response;
            else Object.assign(this._settings, disco);
            this._applySettings('ha');
            clearDirty(get('divHomeAssistant'));
            this.updateDirtyCount();
        });
    }

    connectMQTT() {
        const d = get('divMQTT');
        let obj = ui.fromElement(d);
        // Chaîne vide si le masque factice n'a jamais été effacé (= mot de passe non modifié).
        obj.mqtt.password = secretValue(get('fldMqttPassword'));

        if (obj.mqtt.enabled && (typeof obj.mqtt.hostname !== 'string' || obj.mqtt.hostname.length === 0)) {
            return ui.fieldError('fldMqttHost', tr('ERR_MQTT_HOSTNAME_REQUIRED'));
        }
        if (typeof obj.mqtt.hostname === 'string' && obj.mqtt.hostname.length > 64) {
            return ui.fieldError('fldMqttHost', tr('ERR_HOSTNAME_MAX_LENGTH_64'));
        }

        // Plage TCP valide 1-65535. Le champ HTML est en type="text" (pas type="number"), rien
        // n'empêche donc de saisir une valeur hors plage ; côté firmware, MQTTSettings::port est un
        // uint16_t (ConfigSettings.h) qui tronque silencieusement toute valeur > 65535 plutôt que de
        // la rejeter -- sans ce garde-fou, un port mal saisi était accepté ici puis enregistré sous
        // une tout autre valeur, sans le moindre avertissement.
        if (isNaN(obj.mqtt.port) || obj.mqtt.port < 1 || obj.mqtt.port > 65535) {
            return ui.fieldError('fldMqttPort', tr('ERR_MQTT_PORT_HINT'));
        }

        if (typeof obj.mqtt.username === 'string' && obj.mqtt.username.length > 32) {
            return ui.fieldError('fldMqttUsername', tr('ERR_USERNAME_MAX_LENGTH_32'));
        }

        if (typeof obj.mqtt.password === 'string' && obj.mqtt.password.length > 32) {
            return ui.fieldError('fldMqttPassword', tr('ERR_PASSWORD_MAX_LENGTH_32'));
        }

        if (typeof obj.mqtt.rootTopic === 'string' && obj.mqtt.rootTopic.length > 64) {
            return ui.fieldError('fldMqttTopic', tr('ERR_ROOT_TOPIC_MAX_LENGTH_64'));
        }

        // Ce préfixe est la seule chose qui délimite l'espace réservé à
        // ce module sur le courtier : vide, ou porteur d'un joker, les topics de commande
        // (shades/+/target/set) deviennent accessibles à n'importe quel autre client du courtier.
        // Le firmware refuse désormais la charge utile dans ce cas (MQTTSettings::fromJSON, qui
        // fait échouer /connectmqtt en 400) -- contrôlé ici pour expliquer POURQUOI dans la langue
        // de l'utilisateur, plutôt que de lui renvoyer une erreur de service opaque. Vérifié même
        // lorsque MQTT est désactivé : le réglage est enregistré dans les deux cas.
        if (typeof obj.mqtt.rootTopic !== 'string' || obj.mqtt.rootTopic.trim().length === 0
            || /[+#]/.test(obj.mqtt.rootTopic) || /^[\/$]/.test(obj.mqtt.rootTopic)) {
            ui.errorMessage(tr('ERR_ROOT_TOPIC_INVALID'), tr('ERR_ROOT_TOPIC_HINT'));
            // Le champ est remis sur la valeur en vigueur côté firmware, et non laissé sur la
            // saisie refusée : rien ne rechargera ce panneau avant la prochaine ouverture du
            // socket, la valeur refusée y resterait donc affichée -- y compris après avoir quitté
            // la page et y être revenu. Vidé, le champ se lit comme un root topic vide ENREGISTRÉ,
            // alors que l'enregistrement n'a pas eu lieu. Sélectionné plutôt que simplement
            // affiché, pour que la correction reste immédiate.
            const fld = get('fldMqttTopic');
            fld.value = this.storedRootTopic;
            fld.focus();
            fld.select();
            return;
        }

        // Si toutes les validations passent, on enregistre
        putJSONSync('/connectmqtt', obj.mqtt, (err, response) => {
            if (err) {
                ui.serviceError(err);
                logger.error('Failed to save MQTT settings:', err);
            } else {
                ui.toast(tr('MSG_SAVE_SUCCESS'));
                logger.debug('MQTT settings saved:', response);
                // Le firmware renvoie les réglages tels qu'il vient de les enregistrer : c'est la
                // seule valeur qui fasse foi pour un refus ultérieur.
                if (response && typeof response.rootTopic === 'string') this.storedRootTopic = response.rootTopic;
                if (response && typeof response.hostname === 'string') this._settings = response;
                this._applySettings('mqtt');
                clearDirty(get('divMQTT'));
                this.updateDirtyCount();
            }
        });
    }
}

var mqtt = new MQTT();
