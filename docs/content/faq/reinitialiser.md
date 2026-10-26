# Comment réinitialiser mon appareil ?

Selon votre lignée, la réinitialisation se fait par **trois coupures d'alimentation rapides**,
chacune dans les 5 secondes qui suivent le démarrage précédent. Ce qui suit ce geste dépend de la
version.

=== "v3.x"

    Le geste ouvre le **mode Récupération** : un réseau Wi-Fi `ESPSomfy-RECOVERY`, sans mot de
    passe, qui sert une page où **vous choisissez ce qu'il faut effacer** (réseau, sécurité,
    équipements, plannings, codes tournants, ou tout). Rien n'est effacé tant que vous n'avez pas
    validé, et **Annuler** redémarre l'appareil sans rien toucher.

    Voir [Mode Récupération](../v3/recuperation.md).

=== "v2.x"

    Le geste a deux paliers, **à l'aveugle** (aucun voyant ne vous guide) : trois cycles effacent
    le réseau et la sécurité, six cycles font un retour complet à l'état d'usine.

    Voir [Factory Reset](../v2/maintenance/factory-reset.md).

!!! warning "Avant tout effacement complet"

    Faites une **sauvegarde** si l'appareil démarre encore : sans elle, il faudra réappairer tous
    vos équipements. Les codes tournants effacés rendent les moteurs sourds à l'appareil tant qu'ils
    n'ont pas été appairés de nouveau.
