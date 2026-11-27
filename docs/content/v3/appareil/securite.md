# Sécurité de l'appareil

La page **Appareil › Sécurité** protège l'accès à votre appareil par un code PIN ou par un mot de
passe, contre toute manipulation de vos équipements ou de la configuration. Elle tient en deux
tuiles : le **mode de protection**, puis sa **portée**.

![Sécurité](v3/img/securite-page){ .on-glb }

## Le bandeau

Le bandeau, à gauche sur ordinateur et en haut de la page sur tablette et téléphone, dit en une
ligne ce qui est enregistré sur l'appareil, par exemple
*Protégé : Code Pin · Toute l'interface*, ou *Aucune protection : tout le réseau local peut tout
faire*. Il reprend aussi les lignes suivantes, affichées directement sur ordinateur, rangées
derrière le bouton **Détails** sur tablette et dans le menu ⋮ du bandeau sur téléphone :

| Ligne | Ce qu'elle dit |
|---|---|
| **Mode** | `Désactivé`, `Code Pin` ou `Mot de passe` |
| **Portée** | *Toute l'interface* ou *Configuration seulement* |
| **Tableau de bord** | *Libre* ou *Protégé* : le pilotage des équipements demande-t-il le code ? |

Le bandeau montre toujours l'état **enregistré**, jamais la saisie en cours.

## Mode de protection { #mode }

Trois choix, chacun avec sa description sous le sélecteur :

| Mode | Ce qui est demandé |
|---|---|
| `Désactivé` | rien : toute personne sur votre réseau local peut piloter les équipements et modifier la configuration. La description s'affiche en avertissement |
| `Code Pin` | un code de **4 chiffres**, saisi case par case. Rapide, y compris depuis un téléphone |
| `Mot de passe` | un **Identifiant** et un **Mot de passe**, saisi deux fois (**Confirmer le mot de passe**), 32 caractères au plus chacun. Plus robuste, recommandé si l'appareil est joignable au-delà de votre réseau local |

![Mode de protection, Code Pin](v3/img/securite-mode-pin){ .on-glb }

![Mode de protection, Mot de passe](v3/img/securite-mode-password){ .on-glb }

Si un code PIN ou un mot de passe est déjà enregistré, ses champs restent masqués et une ligne le
rappelle (*Un code PIN est déjà enregistré sur l'appareil.*) : le secret n'est jamais affiché ni
renvoyé par l'appareil. Laisser ces champs tels quels garde le secret en place ; les remplir le
remplace. L'œil à droite d'un champ de mot de passe montre ce que vous tapez.

Un seul secret existe à la fois : passer au code PIN efface le mot de passe enregistré, et
désactiver la protection efface les deux. La fenêtre de confirmation le rappelle.

En bas de la tuile, la ligne **Réseau de secours de l'appareil** dit si le
[point d'accès de secours](../../aide/point-d-acces.md) est *Ouvert* ou *Protégé*, et mène à
l'onglet **Accès** de la page Réseau, où se règle son mot de passe : il est indépendant de celui-ci.

### Qui demande ce code { #qui-demande-ce-code }

Quand la protection est active, une note le rappelle dans la tuile : *Le même code PIN ou mot de
passe sera demandé à Home Assistant et à tout autre logiciel qui pilote l'appareil, ainsi que par
le firmware de secours.* En détail :

| Accès | Protégé |
|---|---|
| L'interface web | oui |
| L'API HTTP de l'appareil, qu'utilisent l'[intégration Home Assistant](../domotique/home-assistant/index.md) et tout script ou autre logiciel domotique | oui : il faut d'abord se connecter avec le code ou le mot de passe |
| La connexion en temps réel (WebSocket), qui transmet l'état des équipements | oui |
| Le [firmware de secours](systeme/firmware-de-secours.md) | oui, sauf après les trois coupures d'alimentation |
| Les commandes reçues par [MQTT](../domotique/mqtt/index.md) | **non** : seuls les identifiants de votre courtier MQTT les protègent |

## Portée { #portee }

**Configuration sécurisée uniquement** : `Oui` / `Non`.

| Réponse | Effet |
|---|---|
| `Non` | toute l'interface demande le code, tableau de bord compris |
| `Oui` | le tableau de bord, le pilotage des équipements et des groupes, et la connexion en temps réel restent libres ; seuls les réglages demandent le code. Pratique pour laisser toute la famille piloter les équipements, en protégeant la configuration |

Tant que le mode est `Désactivé`, cette tuile est grisée : elle n'a pas d'objet.

## Enregistrer

Une modification fait apparaître la barre d'enregistrement en bas de l'écran. `Enregistrer` ouvre
une fenêtre de confirmation :

| Vers | Fenêtre |
|---|---|
| `Désactivé` | *Désactiver la sécurité ?* : l'interface redevient accessible librement sur le réseau local. Bouton `Désactiver la sécurité` |
| `Code Pin` | *Protéger l'interface par un code PIN ?* : notez le code, la case *J'ai noté le code PIN dans un endroit sûr.* doit être cochée. Bouton `Activer la protection` |
| `Mot de passe` | *Protéger l'interface par un mot de passe ?* : même principe, avec l'identifiant et le mot de passe |

Si la saisie est incomplète, un message l'explique avant toute fenêtre :

| Message | Cause |
|---|---|
| *Code PIN invalide* | le code doit contenir exactement 4 chiffres |
| *Nom d'utilisateur manquant* | le mode mot de passe demande un identifiant |
| *Mot de passe manquant* / *Confirmation du mot de passe requise* | l'un des deux champs est vide |
| *Les mots de passe ne correspondent pas* | ressaisissez la confirmation à l'identique |
| *Nom d'utilisateur invalide* / *Mot de passe invalide* | plus de 32 caractères |

## Une fois connecté

Le code PIN ou le mot de passe n'est pas redemandé à chaque action : une fois saisi, il reste
valable pour **cet onglet du navigateur**, tant qu'il reste ouvert, y compris après un
rechargement de la page. Il est redemandé si vous fermez l'onglet, en ouvrez un nouveau, ou si
l'adresse de votre ordinateur sur le réseau change.

## En cas d'oubli

Le [firmware de secours](systeme/firmware-de-secours.md#reinitialiser) efface le code PIN ou le
mot de passe sans toucher au reste : cochez **Sécurité** sur son écran de réinitialisation. Sans le
code, il faut d'abord y entrer par les
[trois coupures d'alimentation](systeme/firmware-de-secours.md#trois-coupures) : ce geste physique
garantit que vous êtes devant l'appareil.
