---
title: Télécommandes compatibles
---

# Télécommandes compatibles

Cette page recense les télécommandes, capteurs et accessoires radio dont des utilisateurs ont rapporté
le comportement avec ESPSomfy-RTS. Elle vaut aussi bien pour la v2.x que pour la v3.x.

!!! info "D'où viennent ces informations"

    Elles sont tirées de la lecture de **l'ensemble des tickets** du dépôt d'origine de la v2.x
    ([rstrouse/ESPSomfy-RTS](https://github.com/rstrouse/ESPSomfy-RTS/issues)), ouverts et fermés,
    ainsi que de leurs commentaires, à la date du 28 octobre 2026. Les tickets de
    [ce fork](https://github.com/xkain/ESPSomfy-RTS/issues) ont aussi été relus : ils ne citent aucun
    modèle de télécommande de plus. Ce sont des **retours
    d'utilisateurs**, pas des essais menés par le projet : un modèle absent de la liste n'est pas
    pour autant incompatible, et un modèle listé peut se comporter différemment selon sa série ou
    celle du moteur. Les numéros entre parenthèses renvoient au ticket concerné.

## La règle qui décide de tout

ESPSomfy-RTS parle **le protocole RTS de Somfy, sur 433,42 MHz**. La seule question utile est donc :
*la télécommande, et le moteur qu'elle pilote, sont-ils en RTS ?*

* Le sigle **RTS** figure sur le produit ou sur sa notice : **compatible**.
* Le sigle **io** (io-homecontrol) figure sur le produit : **incompatible**. C'est une autre
  technologie, sur 868 MHz, que le CC1101 ne sait ni recevoir ni émettre et que le firmware ne
  décode pas ([#99](https://github.com/rstrouse/ESPSomfy-RTS/issues/99),
  [#503](https://github.com/rstrouse/ESPSomfy-RTS/issues/503)).

!!! warning "Attention aux gammes à deux versions"

    Beaucoup de modèles existent en deux versions, **RTS** et **io**, au nom presque identique
    (*Situo 5 RTS Pure II* et *Situo 5 Variation A/M io Pure II*, *Smoove Origin RTS* et
    *Smoove Origin io*…). Lisez l'étiquette complète, pas seulement le nom de la gamme.

## Télécommandes confirmées

Ces modèles ont été vus fonctionner : leurs touches apparaissent dans le journal radio, ils se lient
à un équipement, et pour beaucoup l'équipement a aussi été appairé avec l'appareil.

| Modèle | Remarques | Tickets |
| --- | --- | --- |
| **Telis 1 RTS Pure** | Une voie. Pilote très répandu pour les stores bannes. | [#307](https://github.com/rstrouse/ESPSomfy-RTS/issues/307), [#399](https://github.com/rstrouse/ESPSomfy-RTS/issues/399), [#417](https://github.com/rstrouse/ESPSomfy-RTS/issues/417) |
| **Telis 4 RTS Pure** | Cinq voies : la cinquième commande l'ensemble. Une même télécommande se lie à plusieurs équipements ; plusieurs télécommandes se lient au même (jusqu'à 7). | [#25](https://github.com/rstrouse/ESPSomfy-RTS/issues/25), [#131](https://github.com/rstrouse/ESPSomfy-RTS/issues/131), [#256](https://github.com/rstrouse/ESPSomfy-RTS/issues/256) |
| **Telis 4 Modulis** (molette centrale) | Envoie des commandes de pas haut/bas : régler la longueur de trame sur **80 bits** pour que l'appareil les reproduise. | [#161](https://github.com/rstrouse/ESPSomfy-RTS/issues/161), [#237](https://github.com/rstrouse/ESPSomfy-RTS/issues/237) |
| **Telis 16 RTS Pure** | Ne pas donner la même adresse à un équipement et à un groupe (rolling codes désynchronisés). | [#371](https://github.com/rstrouse/ESPSomfy-RTS/issues/371), [#655](https://github.com/rstrouse/ESPSomfy-RTS/issues/655) |
| **Situo 1 RTS Pure II** et **Situo 5 RTS Pure II** | Les modèles les plus cités. | [#20](https://github.com/rstrouse/ESPSomfy-RTS/issues/20), [#32](https://github.com/rstrouse/ESPSomfy-RTS/issues/32), [#72](https://github.com/rstrouse/ESPSomfy-RTS/issues/72), [#120](https://github.com/rstrouse/ESPSomfy-RTS/issues/120), [#127](https://github.com/rstrouse/ESPSomfy-RTS/issues/127) |
| **Smoove 1 RTS** et **Smoove Origin RTS** | Commandes murales. Vérifier que ce n'est pas la version *io*. | [#3](https://github.com/rstrouse/ESPSomfy-RTS/issues/3), [#48](https://github.com/rstrouse/ESPSomfy-RTS/issues/48), [#243](https://github.com/rstrouse/ESPSomfy-RTS/issues/243), [#678](https://github.com/rstrouse/ESPSomfy-RTS/issues/678) |
| **Decoflex RTS** | Commande murale, donnée comme compatible au même titre que la Smoove RTS. | [#319](https://github.com/rstrouse/ESPSomfy-RTS/issues/319) |
| **Centralis RTS** (commande centralisée murale) | Se lie normalement. Pressions sur la commande murale et sur l'appareil se mélangent si des rolling codes divergent. | [#202](https://github.com/rstrouse/ESPSomfy-RTS/issues/202), [#307](https://github.com/rstrouse/ESPSomfy-RTS/issues/307) |
| **Chronis RTS** (programmateur) | Se lie une fois la radio accordée. Les programmations internes de la télécommande ne sont pas relayées, seules ses commandes émises le sont. | [#202](https://github.com/rstrouse/ESPSomfy-RTS/issues/202) |

## Portails et portes de garage

Les télécommandes de portail ne disposent souvent pas de bouton **PROG** : la mise en
appairage se fait sur le moteur (bouton d'alimentation maintenu environ 2 secondes), puis l'appareil
émet à son tour la commande. Elles n'envoient qu'une commande unique `Toggle`, sur **80 bits** dans
la plupart des cas signalés. Le type d'équipement à choisir est *Portail* ou *Garage* à **un bouton**.

| Modèle | État signalé | Tickets |
| --- | --- | --- |
| **Keytis 2 NS RTS** | Fonctionne, y compris en liant plusieurs télécommandes. | [#388](https://github.com/rstrouse/ESPSomfy-RTS/issues/388) |
| **Keypop 2 RTS** (portail Evolvia / Exavia) | Fonctionne : un équipement par bouton, les adresses des deux boutons étant espacées de 65 536. | [#199](https://github.com/rstrouse/ESPSomfy-RTS/issues/199), [#469](https://github.com/rstrouse/ESPSomfy-RTS/issues/469), [#593](https://github.com/rstrouse/ESPSomfy-RTS/issues/593) |
| **Keytis RTS** avec moteur Dexxo Optimo / Evolvia 400 | Réception correcte, mais plusieurs utilisateurs n'ont pas réussi l'appairage ; la cause est le plus souvent le câblage de l'émission (broches TX/RX inversées dans les réglages). | [#442](https://github.com/rstrouse/ESPSomfy-RTS/issues/442), [#472](https://github.com/rstrouse/ESPSomfy-RTS/issues/472), [#498](https://github.com/rstrouse/ESPSomfy-RTS/issues/498), [#657](https://github.com/rstrouse/ESPSomfy-RTS/issues/657) |
| **Keygo RTS** | Les Keygo à un bouton se lient et ouvrent bien le portail, mais la position d'un portail ne se déduit pas d'un `Toggle`. Un cas de trames toutes signalées invalides avec la *Keygo 4 RTS* reste ouvert. | [#156](https://github.com/rstrouse/ESPSomfy-RTS/issues/156), [#677](https://github.com/rstrouse/ESPSomfy-RTS/issues/677) |
| Moteurs **Dexxo Pro / Optimo RTS** | Fonctionnent en mode 1 ou 3 boutons selon le réglage du moteur. | [#138](https://github.com/rstrouse/ESPSomfy-RTS/issues/138), [#143](https://github.com/rstrouse/ESPSomfy-RTS/issues/143), [#243](https://github.com/rstrouse/ESPSomfy-RTS/issues/243) |

## Capteurs et accessoires radio

| Modèle | État signalé | Tickets |
| --- | --- | --- |
| **Soliris RTS** (capteur soleil et vent) | Se lie comme une télécommande. Le soleil et le vent peuvent aussi être simulés depuis l'appareil. | [#54](https://github.com/rstrouse/ESPSomfy-RTS/issues/54), [#147](https://github.com/rstrouse/ESPSomfy-RTS/issues/147), [#443](https://github.com/rstrouse/ESPSomfy-RTS/issues/443) |
| **Eolis RTS** (capteur de vent) | Se lie. Le modèle **Eolis 3D RTS**, à détection de vibration et en trames de 80 bits, n'est pas réceptionné de façon régulière. | [#282](https://github.com/rstrouse/ESPSomfy-RTS/issues/282), [#594](https://github.com/rstrouse/ESPSomfy-RTS/issues/594) |
| **Sunis RTS** (capteur de soleil) | Réception signalée uniquement pendant le balayage de fréquence, pas dans le journal normal : cas ouvert. La version **Sunis WireFree II io** est incompatible. | [#495](https://github.com/rstrouse/ESPSomfy-RTS/issues/495), [#682](https://github.com/rstrouse/ESPSomfy-RTS/issues/682) |
| Contact sec RTS (réf. **1841022**) | Fonctionne en mode *Garage* à un bouton ; son interface de commande est atypique (il avait d'abord répondu à `My + Haut` / `My + Bas` seulement). | [#153](https://github.com/rstrouse/ESPSomfy-RTS/issues/153) |

## Télécommandes d'autres marques

Quelques moteurs vendus sous d'autres marques parlent un **dialecte** de Somfy. Ils se pilotent en
choisissant le protocole **RTW** ou **RTV** pour l'équipement, et leur télécommande se lie de la même
façon.

* **Moteurs ASA / Mantion SMT** (RTW) : fonctionnent. Le défaut signalé sur la ligne d'origine, où
  les touches `Haut` et `Bas` d'une télécommande liée étaient lues comme `My`, a été **corrigé dans
  ce fork** ([#38](https://github.com/rstrouse/ESPSomfy-RTS/issues/38),
  [#664](https://github.com/rstrouse/ESPSomfy-RTS/issues/664)).
* **Émetteur PL01** (RTV, **433,92 MHz**) : fonctionne. Le CC1101 n'écoute qu'une fréquence à la fois,
  donc cet émetteur et une télécommande Somfy classique ne se reçoivent pas en même temps
  ([#77](https://github.com/rstrouse/ESPSomfy-RTS/issues/77),
  [#292](https://github.com/rstrouse/ESPSomfy-RTS/issues/292)).
* **Silent Gliss SG10948** : signalée sans réception à 433,42 MHz ; à essayer sur 433,92 MHz en RTV,
  sans retour de résultat ([#178](https://github.com/rstrouse/ESPSomfy-RTS/issues/178)).

## Incompatibles

| Modèle | Raison | Tickets |
| --- | --- | --- |
| **Situo 1 / 5 io**, **Situo 5 Variation A/M io** | io-homecontrol, 868 MHz | [#9](https://github.com/rstrouse/ESPSomfy-RTS/issues/9), [#89](https://github.com/rstrouse/ESPSomfy-RTS/issues/89), [#503](https://github.com/rstrouse/ESPSomfy-RTS/issues/503) |
| **Smoove Origin io**, **Smoove Uno A/M io** | io-homecontrol | [#495](https://github.com/rstrouse/ESPSomfy-RTS/issues/495), [#567](https://github.com/rstrouse/ESPSomfy-RTS/issues/567) |
| **Keygo io**, **Maestria io**, **Sunis WireFree II io** | io-homecontrol | [#412](https://github.com/rstrouse/ESPSomfy-RTS/issues/412), [#495](https://github.com/rstrouse/ESPSomfy-RTS/issues/495), [#529](https://github.com/rstrouse/ESPSomfy-RTS/issues/529) |
| Boîtiers **TaHoma** et **Connexoon** | Passerelles io-homecontrol (leur côté RTS se pilote, mais pas leurs équipements io) | [#355](https://github.com/rstrouse/ESPSomfy-RTS/issues/355), [#495](https://github.com/rstrouse/ESPSomfy-RTS/issues/495) |
| Télécommandes à **40 bits** (type Nobily / Dooya) | Trame d'une autre famille, non décodée | [#178](https://github.com/rstrouse/ESPSomfy-RTS/issues/178) |

## Si votre modèle n'est pas dans la liste

La méthode est toujours la même : appuyez sur une touche de la télécommande avec le journal radio
ouvert.

* Une ligne apparaît avec le protocole `RTS`, `RTW` ou `RTV` : le modèle est lisible, et il y a
  de bonnes chances qu'il se lie et se pilote.
* Rien n'apparaît : vérifiez d'abord le câblage et l'accord du récepteur (une télécommande
  Somfy RTS qui ne s'entend pas est presque toujours un problème de câblage ou de réglage).
  Lancez ensuite un balayage de fréquence : si la télécommande n'apparaît nulle part, elle n'est
  vraisemblablement pas en RTS sur 433 MHz.
* Une trame invalide ou une commande inconnue : la télécommande parle un dialecte voisin. Essayez
  les protocoles `RTW` ou `RTV`, et une fréquence de 433,92 MHz.

Pour la marche à suivre détaillée, voir la page [Dépannage de la radio](../v3/radio/depannage.md)
et les [composants](composants.md) nécessaires.
