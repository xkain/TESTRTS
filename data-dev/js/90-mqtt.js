class MQTT {
    initialized = false;
    // Dernier root topic RÉELLEMENT en vigueur côté firmware. Le panneau MQTT n'est peuplé qu'à
    // l'ouverture du socket et après connexion (cf. 20-shell.js) : revenir sur l'onglet ne le
    // recharge pas. Tant que tout enregistrement était accepté, le champ affiché ne pouvait pas
    // diverger de ce qui était stocké ; depuis que le root topic peut être REFUSÉ, il le peut --
    // et un champ resté vide se lit comme "le vide a été enregistré", ce qu'il n'a pas été.
    // Cette valeur sert à remettre le champ en accord avec le firmware sur un refus.
    storedRootTopic = '';
    init() { this.initialized = true; }

    async loadMQTT() {
        getJSONSync('/mqttsettings', (err, settings) => {
            if (err) {
                ui.serviceError(err);
            } else {
                this.storedRootTopic = settings.rootTopic || '';
                ui.toElement(get('divMQTT'), { mqtt: settings });
                // Le serveur ne renvoie jamais le mot de passe existant, seulement s'il est défini :
                // masque factice si déjà configuré, jamais de pré-remplissage avec le vrai secret.
                initSecretField(get('fldMqttPassword'), settings.hasPassword);
                get('divDiscoveryTopic').style.display = settings.pubDisco ? '' : 'none';
                watchDirty(get('divMQTT'));
            }
        });
    }

    connectMQTT() {
        const d = get('divMQTT');
        let obj = ui.fromElement(d);
        // Chaîne vide si le masque factice n'a jamais été effacé (= mot de passe non modifié).
        obj.mqtt.password = secretValue(get('fldMqttPassword'));

        // 1. Validation du Hostname (si MQTT est activé OU si le champ est rempli)
        if (obj.mqtt.enabled && (typeof obj.mqtt.hostname !== 'string' || obj.mqtt.hostname.length === 0)) {
            ui.errorMessage(tr('ERR_HOSTNAME'), tr('ERR_MQTT_HOSTNAME_REQUIRED'));
            return;
        }
        if (typeof obj.mqtt.hostname === 'string' && obj.mqtt.hostname.length > 64) {
            ui.errorMessage(tr('ERR_HOSTNAME'), tr('ERR_HOSTNAME_MAX_LENGTH_64'));
            return;
        }

        // 2. Validation du Port -- plage TCP valide 1-65535. Le champ HTML est en type="text"
        // (pas type="number"), rien n'empêche donc de saisir une valeur hors plage ; côté firmware,
        // MQTTSettings::port est un uint16_t (ConfigSettings.h) qui tronque silencieusement toute
        // valeur > 65535 plutôt que de la rejeter -- sans ce garde-fou, un port mal saisi était
        // accepté ici puis enregistré sous une tout autre valeur, sans le moindre avertissement.
        if (isNaN(obj.mqtt.port) || obj.mqtt.port < 1 || obj.mqtt.port > 65535) {
            ui.errorMessage(tr('ERR_PORT_INVALID'), tr('ERR_MQTT_PORT_HINT'));
            return;
        }

        // 3. Validation de la longueur du Nom d'utilisateur (> 32)
        if (typeof obj.mqtt.username === 'string' && obj.mqtt.username.length > 32) {
            ui.errorMessage(tr('ERR_USERNAME_INVALID'), tr('ERR_USERNAME_MAX_LENGTH_32'));
            return;
        }

        // 4. Validation du Mot de passe (> 32)
        if (typeof obj.mqtt.password === 'string' && obj.mqtt.password.length > 32) {
            ui.errorMessage(tr('ERR_PASSWORD_INVALID'), tr('ERR_PASSWORD_MAX_LENGTH_32'));
            return;
        }

        // 5. Validation du Root Topic (> 64)
        if (typeof obj.mqtt.rootTopic === 'string' && obj.mqtt.rootTopic.length > 64) {
            ui.errorMessage(tr('ERR_ROOT_TOPIC_INVALID'), tr('ERR_ROOT_TOPIC_MAX_LENGTH_64'));
            return;
        }

        // 6. Contenu du Root Topic. Ce préfixe est la seule chose qui délimite l'espace réservé à
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
                ui.successMessage(tr('MSG_SAVE_SUCCESS'));
                logger.debug('MQTT settings saved:', response);
                // Le firmware renvoie les réglages tels qu'il vient de les enregistrer : c'est la
                // seule valeur qui fasse foi pour un refus ultérieur.
                if (response && typeof response.rootTopic === 'string') this.storedRootTopic = response.rootTopic;
                clearDirty();
            }
        });
    }
}

var mqtt = new MQTT();
