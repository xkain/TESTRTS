# Installation et connexion

Cette page explique comment installer **ESPSomfy-RTS Enhanced**, y ajouter un appareil, lui
donner le code PIN ou le mot de passe de l'appareil, et changer ces réglages plus tard.

## 1. Installer l'intégration { #installer }

### Depuis le Marketplace (anciennement HACS) { #marketplace }

1. Ouvrez le **Marketplace** (Home Assistant 2026.11 ou plus récent), ou **HACS** sur une version
    antérieure.
2. Recherchez **ESPSomfy-RTS Enhanced**.
3. Cliquez sur `Télécharger`, puis redémarrez Home Assistant.

### À la main { #manuelle }

Copiez le dossier `custom_components/espsomfy_rts_enhanced/` du dépôt de l'intégration dans le
dossier `custom_components/` de votre configuration Home Assistant, puis redémarrez Home Assistant.

!!! note "Une installation manuelle ne se met pas à jour seule"

    Le Marketplace vous prévient quand une nouvelle version de l'intégration paraît. Une copie
    manuelle, elle, est à refaire à chaque version.

## 2. Ajouter un appareil { #ajouter }

### Découverte automatique { #decouverte }

Une fois l'intégration installée, Home Assistant repère de lui-même les appareils ESPSomfy-RTS
du réseau local, qui s'annoncent par mDNS (zeroconf). Ils apparaissent comme **découverts** dans
**Paramètres** › **Appareils et services**.

Cliquez sur `Ajouter` : la fenêtre **ESPSomfy-RTS Découvert** demande *« Voulez-vous ajouter
{model} avec l'identifiant du serveur {server_id} à Home Assistant ? »*, où **{model}** et
**{server_id}** sont remplacés par le modèle et l'identifiant de l'appareil. Validez :
l'appareil est ajouté sous son nom.

![Appareil découvert dans Paramètres › Appareils et services](home-assistant/img/ha-decouverte){ .on-glb }

Si la sécurité de l'appareil est activée, Home Assistant vous demande ensuite son code PIN ou son
mot de passe, voir [PIN ou mot de passe](#securite).

!!! tip "Adresse qui change"

    Un appareil déjà configuré qui réapparaît sous une autre adresse IP est mis à jour de
    lui-même : Home Assistant retient la nouvelle adresse et recharge l'intégration.

### Ajout manuel { #ajout-manuel }

Si l'appareil n'est pas découvert, par exemple parce qu'il est sur un autre sous-réseau :

1. **Paramètres** › **Appareils et services** › `Ajouter une intégration`.
2. Recherchez **ESPSomfy-RTS Enhanced**.
3. Remplissez la fenêtre **Configurer ESPSomfy-RTS** (*« Fournir les options de sécurité
    configurées pour votre dispositif »*) :

| Champ | À saisir |
| :--- | :--- |
| **Adresse hôte pour le dispositif ESPSomfy-RTS** | l'adresse IP de l'appareil, ou son nom d'hôte. Obligatoire |
| **Nom d'utilisateur** | seulement si l'appareil est protégé par mot de passe |
| **Mot de passe** | seulement si l'appareil est protégé par mot de passe |
| **Code PIN** | seulement si l'appareil est protégé par un code PIN |

Laissez vides les champs que la sécurité de l'appareil n'utilise pas.

![Fenêtre Configurer ESPSomfy-RTS](home-assistant/img/ha-ajout-manuel){ .on-glb }

## 3. PIN ou mot de passe { #securite }

L'intégration utilise le code PIN ou le mot de passe définis dans la page **Sécurité** de
l'appareil. Elle les garde dans Home Assistant et s'en sert pour obtenir une clé d'accès.

### Quand Home Assistant les redemande { #reauth }

Home Assistant ouvre une **ré-authentification** dans **Paramètres** › **Appareils et services**
quand :

* l'appareil exige une authentification et aucun identifiant n'est enregistré, typiquement après
    une découverte automatique, ou après avoir activé la sécurité sur l'appareil ;
* l'appareil refuse les identifiants enregistrés au démarrage de l'intégration ;
* l'appareil refuse la connexion à répétition, par exemple après un changement de code PIN.

La fenêtre **Authentification ESPSomfy-RTS** explique : *« Cet appareil demande une
authentification. Saisissez le code PIN ou le mot de passe définis dans ESPSomfy-RTS pour que
Home Assistant puisse s'y connecter. »* Une fois validée, elle se ferme sur **Ré-authentification
réussie** et l'intégration se recharge. Si la connexion se rétablit seule entre-temps, la demande
disparaît d'elle-même.

### Des champs adaptés à l'appareil { #champs }

Pour la ré-authentification et la reconfiguration, l'intégration demande d'abord à l'appareil
quel type de sécurité il applique, et n'affiche que les champs utiles :

| Sécurité de l'appareil | Champs affichés |
| :--- | :--- |
| aucune | **Adresse hôte pour le dispositif ESPSomfy-RTS** seule |
| code PIN | l'adresse et **Code PIN**, obligatoire |
| mot de passe | l'adresse, **Nom d'utilisateur** et **Mot de passe**, obligatoires |
| inconnue (appareil injoignable) | l'adresse et les trois champs, tous facultatifs |

### Messages d'erreur { #erreurs }

| Message | Cause |
| :--- | :--- |
| **Nom d'hôte ou adresse IP invalide** | l'adresse saisie n'est ni une adresse IP ni un nom d'hôte valide |
| **Appareil non trouvé** | aucun appareil ESPSomfy-RTS ne répond à cette adresse, ou il demande des identifiants qui n'ont pas été fournis |
| **Échec de la connexion** | la connexion à l'appareil a été interrompue pendant la vérification |
| **Code PIN invalide** | le code PIN ne correspond pas à celui de l'appareil |
| **Nom d'utilisateur ou mot de passe invalide** | l'identifiant ou le mot de passe ne correspondent pas |
| **Identifiant invalide** | l'appareil a refusé la connexion pour une autre raison |
| **Trop de tentatives. Réessayez dans N secondes.** | l'appareil s'est verrouillé après plusieurs essais manqués ; attendez le délai indiqué |
| **Erreur inattendue** | erreur imprévue, détaillée dans le journal de Home Assistant |
| **Cette adresse répond pour un autre appareil ESPSomfy-RTS** | en reconfiguration ou ré-authentification, l'adresse saisie mène à un autre appareil que celui de cette entrée |

!!! warning "Chaque essai compte"

    L'appareil se verrouille après quelques identifiants refusés. Vérifiez le code PIN ou le mot de
    passe dans la page **Sécurité** de l'appareil avant de réessayer.

!!! note "Sécurité réservée à la configuration"

    Si l'appareil ne protège que sa configuration et qu'aucun identifiant n'est enregistré,
    l'état et les commandes des équipements fonctionnent, mais la sauvegarde, le redémarrage, la
    mise à jour du micrologiciel et la force du signal des télécommandes liées restent
    indisponibles. Saisissez le code PIN ou le mot de passe par une
    [reconfiguration](#reconfigurer).

## 4. Reconfigurer { #reconfigurer }

Pour changer l'adresse de l'appareil ou ses identifiants : **Paramètres** › **Appareils et
services** › **ESPSomfy-RTS Enhanced**, menu ⋮ de l'appareil › `Reconfigurer`. Le bouton
`Changer l'adresse ou le PIN` de l'onglet **Appareil** du [panneau](panneau.md#appareil) mène à
cette page de l'intégration.

La fenêtre **Reconfigurer ESPSomfy-RTS** (*« Modifiez l'adresse de l'appareil ou les identifiants
définis dans ESPSomfy-RTS. »*) présente les [champs adaptés](#champs) à la sécurité de l'appareil.
Elle se ferme sur **Reconfiguration réussie** et l'intégration se recharge.

## 5. Options { #options }

Le bouton `Configurer` de l'appareil ouvre la fenêtre **ESPSomfy-RTS**, qui rappelle que *« Les
équipements, groupes, plannings et sauvegardes se modifient dans le panneau ESPSomfy RTS de la
barre latérale. »* Elle ne porte qu'un réglage :

| Réglage | Effet |
| :--- | :--- |
| **Canal développeur** | *« Les mises à jour du firmware peuvent aussi proposer la dernière version de développement, publiée à chaque modification. Réservé aux essais : une telle version peut être instable. »* |

Enregistrer recharge l'intégration. Le même réglage existe dans l'onglet **Appareil** du
[panneau](panneau.md#appareil).

## 6. Venir de l'intégration d'origine { #migration }

Si vous utilisez l'intégration d'origine de rstrouse (`ESPSomfy-RTS-HA`, domaine
`espsomfy_rts`), le passage se fait ainsi :

1. Notez, ou faites une capture d'écran, du nom de vos entités actuelles.
2. Supprimez l'ancienne intégration depuis le Marketplace (ou HACS), ou supprimez le dossier
    `custom_components/espsomfy_rts`.
3. Redémarrez Home Assistant.
4. Installez **ESPSomfy-RTS Enhanced**, voir [Installer l'intégration](#installer).
5. Redémarrez à nouveau Home Assistant, puis ajoutez l'appareil s'il n'est pas déjà découvert.
6. Renommez si besoin vos entités à l'identique, pour que vos tableaux de bord, automatisations
    et scripts les retrouvent.

!!! important "Le domaine change"

    Les actions s'appellent désormais `espsomfy_rts_enhanced.<action>` et non plus
    `espsomfy_rts.<action>`. Pensez-y dans vos automatisations, et dans celles que vous reprenez
    ailleurs.
