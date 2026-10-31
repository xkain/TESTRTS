# L'interface ne répond plus

Plusieurs portes de secours existent, de la plus légère à la plus complète. Elles dépendent de
la version du firmware.

=== "v3.x et +"

    1. **Le [point d'accès de secours](../aide/point-d-acces.md)**&nbsp;: sans Wi-Fi ou sans
       réseau, l'appareil ouvre son propre point d'accès, à rejoindre pour le reconfigurer.
    2. **Le mode Récupération**&nbsp;: trois coupures d'alimentation rapides, chacune
       dans les 5 secondes qui suivent le démarrage précédent. Il répare un appareil
       dont l'interface pose problème sans dépendre de ce qui est cassé, et vous laisse choisir
       ce qu'il faut effacer. Voir [Mode Récupération](../v3/recuperation.md).
    3. **Les journaux du port série**&nbsp;: quand plus rien ne répond par le réseau,
       le câble USB reste le seul témoin. Voir
       [Journaux du port série](../outils/journaux-port-serie.md).
    4. **Un nouveau flash**, avec l'[Installateur web](../outils/installateur-web.md) (ou, s'il ne
       fonctionne pas, l'[installateur de secours](../outils/installateur-esphome.md)),
       puis la [restauration d'une sauvegarde](../v3/firmware/restaurer.md).

=== "v2.x"

    1. **Le [point d'accès de secours](../aide/point-d-acces.md)**&nbsp;: sans Wi-Fi ou sans
       réseau, l'appareil ouvre son propre point d'accès, à rejoindre pour le reconfigurer.
    2. **La réinitialisation par cycles d'alimentation** (depuis la v2.5.1)&nbsp;: **trois**
       coupures rapides, chacune dans les 5 secondes qui suivent le démarrage précédent,
       effacent le réseau et la sécurité en conservant vos équipements&nbsp;; **six** coupures
       font un retour complet à l'état d'usine. Il n'y a pas de mode Récupération en v2.x&nbsp;:
       la procédure se fait à l'aveugle, sans voyant. Voir
       [Factory Reset](../v2/maintenance/factory-reset.md).
    3. **Les journaux du port série**&nbsp;: quand plus rien ne répond par le réseau,
       le câble USB reste le seul témoin. Voir
       [Journaux du port série](../outils/journaux-port-serie.md).
    4. **Un nouveau flash**, avec l'[Installateur web](../outils/installateur-web.md) (ou, s'il ne
       fonctionne pas, l'[installateur de secours](../outils/installateur-esphome.md)),
       puis la
       [restauration d'une sauvegarde](../v2/configuration/firmware.md#sauvegarde-et-restauration).
