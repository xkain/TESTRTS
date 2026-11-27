# Assistant de connexion

L'assistant relie l'appareil à votre réseau en trois étapes : le type de connexion, ses réglages,
puis où retrouver l'appareil. Il s'ouvre tout seul au premier démarrage, quand vous êtes connecté
au [point d'accès](../../../aide/point-d-acces.md) de l'appareil. Il se relance à tout moment depuis
le bandeau de la page [Réseau](index.md), avec `Relancer l'assistant de première connexion`.

La colonne de gauche suit les étapes. Sur le point d'accès, elle rappelle aussi que vous êtes
connecté directement à l'appareil, sur `192.168.4.1`, et qu'il faudra revenir sur votre réseau
habituel à la fin.

## 1. Connexion { #connexion }

![Assistant de connexion, étape 1](v3/img/assistant-connexion-mode){ .on-glb }

*Comment l'appareil rejoint-il votre réseau ?* Trois cartes, qui ne décident que des réglages de
l'étape suivante :

| Carte | Pour |
|---|---|
| **Wi-Fi** (*Le plus courant*) | rejoindre votre réseau sans fil habituel |
| **Ethernet** | une connexion filaire ou PoE, sans repli sans fil |
| **Ethernet + Wi-Fi de secours** | le câble d'abord, le Wi-Fi si le câble ne répond plus |

Ce que fait l'appareil dans chaque cas, et quand il rouvre son point d'accès, est décrit dans
[Ce que fait chaque type](index.md#types).

*Vous remplacez un ancien appareil ?* `Restaurer une sauvegarde` ouvre la
[restauration](../systeme/index.md#backup), réglée pour tout reprendre sauf le réseau, que
l'assistant configure juste après.

Sur un [boîtier officiel](../../materiel/boitiers-officiels.md), l'étape s'adapte : le boîtier
Wi-Fi seul la saute, l'assistant ouvre directement les réglages Wi-Fi ; le boîtier Ethernet ne
propose pas **Ethernet** seul, sa carte n'ayant rien à régler. Cinq clics sur le titre de l'étape
font réapparaître cette carte, jusqu'à la fermeture de l'assistant.

## 2. Réseau { #reseau }

Les réglages du type choisi, en tuiles numérotées dans l'ordre où on les remplit.

=== "Wi-Fi"

    ![Assistant de connexion, étape 2 en Wi-Fi](v3/img/assistant-connexion-wifi){ .on-glb }

=== "Ethernet + Wi-Fi de secours"

    ![Assistant de connexion, étape 2 en Ethernet + Wi-Fi de secours](v3/img/assistant-connexion-both){ .on-glb }

| Tuile | Ce qu'elle demande |
|---|---|
| **Choisissez votre carte Ethernet** | en Ethernet : le **Type de carte**, comme dans l'onglet [Ethernet](index.md#ethernet) de la page Réseau ; en définition manuelle, les broches s'affichent dessous. Sur un boîtier officiel : *Branchez le câble Ethernet*, rien à régler. |
| **Choisissez votre réseau Wi-Fi** (ou **le Wi-Fi de secours**) | l'assistant cherche les réseaux dès cette étape et les liste du plus fort au plus faible. Toucher un réseau remplit son nom. `+ Mon réseau n'apparaît pas (réseau caché)` permet de le saisir, `Chercher à nouveau` relance la recherche. |
| **Saisissez son mot de passe** | le **SSID du réseau** et le **Mot de passe**, *celui de votre box, souvent inscrit dessous* |
| **Nommez l'appareil (facultatif)** | le **Nom d'hôte**, lettres, chiffres ou tiret, 31 caractères au plus. L'adresse `http://<nom>.local` se met à jour en direct. |

Tant qu'il manque quelque chose, le pied de la fenêtre le dit (*Choisissez un réseau et saisissez
son mot de passe*, un mot de passe de moins de 8 caractères, un nom d'hôte invalide) et
`Enregistrer et connecter` reste grisé. Un mot de passe vide est permis : réseau ouvert, ou mot de
passe déjà enregistré et inchangé.

`Enregistrer et connecter` envoie le réseau et le nom en une fois. En Ethernet, sur une carte
générique, la [confirmation critique](index.md#confirmation-critique) des broches passe d'abord.
`Retour` revient à l'étape 1.

## 3. Terminé { #termine }

![Assistant de connexion, étape 3](v3/img/assistant-connexion-done){ .on-glb }

*C'est enregistré : l'appareil rejoint « … »* (votre Wi-Fi, ou *votre réseau par le câble*). Son
propre réseau Wi-Fi va disparaître : c'est normal. Trois tuiles disent comment le retrouver :

1. **Revenez sur votre réseau** : reconnectez ce téléphone ou cet ordinateur à votre réseau
    habituel.
2. **Ouvrez l'interface à cette adresse** : le lien `http://<nom>.local`, qui ne répond qu'une
    fois revenu sur votre réseau.
3. **L'adresse ne répond pas ? Passez par votre box** : cherchez le nom de l'appareil dans la
    liste des appareils connectés de votre box, et ouvrez l'adresse IP qu'elle lui a donnée.

Ouvert depuis le point d'accès, l'assistant s'arrête là : l'appareil quitte ce réseau. Relancé
depuis la page Réseau, `Fermer` ramène à l'interface.

## Ignorer l'assistant

`Ignorer l'assistant` (ou `Ignorer`, en haut de la colonne) ferme l'assistant sans rien enregistrer
et ne le rouvre plus au démarrage. Le réseau se règle alors depuis la page [Réseau](index.md).
