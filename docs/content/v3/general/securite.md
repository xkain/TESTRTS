# Sécurité de l'appareil

Protège l'accès à votre interface ESPSomfy-RTS contre toute manipulation non autorisée de
vos équipements ou de la configuration.

Depuis **Général**, le bouton **Sécurité de l'appareil** (avec un badge d'état) ouvre cette
fenêtre — voir [Général](index.md).

## Type de sécurité

Un commutateur à trois positions :

* **Désactivé** : l'accès à ESPSomfy-RTS n'est pas restreint. Toute personne sur votre
    réseau local peut accéder et modifier la configuration ou contrôler vos équipements.
* **Code Pin** : un code à 4 chiffres sera demandé à chaque ouverture de l'interface. Rapide
    à saisir, y compris depuis un téléphone.
* **Mot de Passe** : un identifiant et un mot de passe seront demandés à chaque ouverture.
    Plus robuste qu'un code PIN — recommandé si l'appareil est joignable au-delà de votre
    réseau local.

## Configuration sécurisée uniquement

Autorise l'accès libre au tableau de bord (contrôle des équipements/groupes), mais exige une
authentification pour modifier les paramètres. Pratique pour laisser toute la famille
piloter les équipements au quotidien, tout en protégeant la configuration elle-même.

## Saisie selon le mode

* **Code Pin** : 4 chiffres, saisis case par case. Si un code est déjà enregistré, un
    rappel l'indique sans jamais l'afficher en clair.
* **Mot de Passe** : identifiant (32 caractères max) et mot de passe, avec confirmation. Même
    logique de rappel si un mot de passe est déjà enregistré.

## Une fois authentifié

Le code PIN ou le mot de passe n'est pas redemandé à chaque action : une fois saisi, il reste
valable pour **cet onglet du navigateur**, tant qu'il reste ouvert — y compris après avoir
rechargé la page. L'authentification n'est redemandée que si vous fermez l'onglet, ou en
ouvrez un nouveau. Deux onglets ouverts côte à côte sur la même interface devront donc
chacun s'authentifier séparément.

## Validation

Cliquer sur **Enregistrer** affiche une fenêtre de confirmation avant application, avec un
avertissement adapté au mode choisi. Quelques erreurs de saisie courantes :

| Message | Cause |
|---|---|
| *Code PIN invalide* | le code doit contenir exactement 4 chiffres |
| *Les mots de passe ne correspondent pas* | ressaisissez la confirmation à l'identique |
| *La longueur maximale du nom d'utilisateur est de 32 caractères* | identifiant trop long |

