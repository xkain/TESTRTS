# Mot de passe du point d'accès

Protège (ou non) le point d'accès de secours que l'appareil ouvre **lui-même** quand il ne
parvient pas à rejoindre votre réseau — à ne pas confondre avec le mot de passe de votre
réseau Wi-Fi domestique, qui se saisit depuis
[Connexion Réseau](index.md#connexion-wi-fi). Depuis **Réseau → Connexion**, le
bouton **Mot de passe du point d'accès** ouvre cette fenêtre.

## Quand ce point d'accès s'ouvre-t-il ?

Dès que la connexion principale configurée échoue : première installation, mot de passe
Wi-Fi incorrect, box internet en panne, câble Ethernet débranché sans secours configuré…
L'appareil ouvre alors son propre réseau pour que vous puissiez le reconfigurer — c'est le
même mécanisme, qu'il soit configuré en Wi-Fi ou en Ethernet.

!!! note "Note"

    Ce bouton vit hors des sections Wi-Fi et Ethernet de la page Connexion, parce qu'il ne
    dépend d'aucune des deux : même un [boîtier officiel](../materiel/boitiers-officiels.md) en Ethernet pur
    ouvre ce point d'accès si son câble tombe.

## Ouvert ou protégé

Un commutateur à deux positions :

* **Ouvert** *(réglage d'usine)* : n'importe qui à portée peut s'y connecter sans mot de
    passe. Ce choix n'est pas un oubli : un mot de passe identique sur tous les appareils
    neufs ne protégerait rien, et aurait surtout un risque concret — enfermer dehors la seule
    personne qui en a besoin, celle qui vient de flasher l'appareil et n'a ni lu le code
    source, ni la documentation, ni les journaux série pour le retrouver. Tant qu'il n'est pas
    configuré, l'appareil n'a de toute façon rien à protéger.
* **Protégé** : exige un mot de passe (8 à 63 caractères, limite du protocole WPA2) pour
    rejoindre ce point d'accès.

!!! warning "Avertissement"

    Si vous oubliez ce mot de passe **et** que votre connexion principale échoue un jour, vous
    ne pourrez plus reconfigurer l'appareil à distance : il faudra passer par le
    [Mode Récupération](../recuperation.md)) (trois coupures d'alimentation
    rapprochées), qui ouvre son propre point d'accès indépendant, toujours sans mot de passe.

## Enregistrement

Le champ mot de passe ne s'affiche jamais en clair : il part masqué, et le laisser tel quel
signifie « je n'y touche pas » — le serveur ne renvoie jamais le secret existant. L'état
actuel (Ouvert/Protégé) s'affiche en badge sur le bouton, dans la page Connexion, sans avoir
à rouvrir cette fenêtre.

