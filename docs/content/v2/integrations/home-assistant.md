<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/Home-Assistant.md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Home Assistant

Cette page couvre l'intégration dédiée **ESPSomfy-RTS enhanced**, son installation via HACS, et
la compatibilité avec l'intégration d'origine de rstrouse. Pour piloter l'appareil depuis Home
Assistant **sans** intégration dédiée, voir [MQTT](mqtt.md#auto-découverte-mqtt-auto-discovery) ou
l'[API REST](index.md#interface-rest-api).

L'intégration de **ESPSomfy-RTS** dans **Home Assistant** n'est pas seulement une option, c'est l'aboutissement logique de votre installation. Si ESPSomfy-RTS est le "cerveau" qui parle à vos moteurs, Home Assistant est le "chef d'orchestre" qui donne vie à votre maison.

<img width="800px" src="https://github.com/user-attachments/assets/56f95aab-334b-446b-b64c-8e2f672b0e66" />
<img width="800px" src="https://github.com/user-attachments/assets/80c82ee9-625d-4cbb-a3d2-32525225eba3" />




# Pourquoi est-ce une combinaison gagnante ?

L'utilisation de l'intégration dédiée (via **HACS**) transforme radicalement votre expérience utilisateur :

* **Gestion Native des "Covers" :** Vos volets sont reconnus comme des entités standards (objets "Cover"). Cela vous permet de les piloter à la voix via **Alexa, Google Assistant ou Siri**, de les intégrer à des interfaces tactiles élégantes ou de les commander depuis l'application mobile, que vous soyez dans votre salon ou à l'autre bout du monde.
* **Exemple d'automatisations Avancées :** Ne vous contentez plus d'un simple bouton. Créez une maison qui anticipe vos besoins :
    * *Arrivée à la maison :* Le portail et le garage s'ouvrent automatiquement dès que votre smartphone est détecté à 100 mètres de la maison.
    * *Simulation de Présence :* Durant vos vacances, Home Assistant anime vos volets de façon aléatoire pour simuler une activité réelle et dissuader toute intrusion.
    * *Rythme Circadien :* Programmez un réveil doux avec une ouverture progressive 10 minutes avant votre lever, et une fermeture automatique précise au coucher du soleil.
* **Synchronisation Parfaite :** Contrairement à une télécommande classique qui envoie un signal "dans le vide", cette intégration remonte l'état des volets en temps réel. De plus, chaque groupe créé dans ESPSomfy-RTS est instantanément importé dans Home Assistant avec toutes ses commandes associées.
* **Indépendance Totale du Cloud :** Tout le système fonctionne en réseau local. Pas de dépendance aux serveurs Somfy, pas de coupure en cas de panne internet et une latence quasi nulle. Vos volets répondent au doigt et à l'œil.

Une fois vos automatisations configurées pour répondre à vos scénarios de vie, vous n'aurez plus jamais besoin de chercher une télécommande. C'est un véritable **"game changer"** pour le confort de votre foyer, la technologie s'efface pour laisser place à un quotidien parfaitement fluide.



# Installation via HACS

Si vous êtes un utilisateur de Home Assistant, oubliez les configurations manuelles fastidieuses. Rendez-vous sur le dépôt de l'intégration pour une installation simplifiée en quelques clics :

| Ressource | Lien de téléchargement |
| :--- | :--- |
| **Dépôt Intégration** | [ESPSomfy-RTS enhanced pour Home Assistant](https://github.com/xkain/ESPSomfy-RTS-enhanced) |

<br />

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=xkain&repository=ESPSomfy-RTS-enhanced">
  <img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.">
</a>

---

# Documentation de l'intégration

Une fois l'intégration installée, tout ce qu'elle expose dans Home Assistant — entités, services,
attributs, événements — est documenté dans son **wiki dédié** :

> ### 📘 [Wiki ESPSomfy-RTS enhanced](https://github.com/xkain/ESPSomfy-RTS-enhanced/wiki)

| Pour… | Page |
| :--- | :--- |
| Savoir ce que l'intégration crée (équipements, groupes, capteurs, boutons) | [Entités exposées](https://github.com/xkain/ESPSomfy-RTS-enhanced/wiki/entites) |
| Suivre l'état de l'appareil : réseau, Wi-Fi, Ethernet, mémoire | [Diagnostics](https://github.com/xkain/ESPSomfy-RTS-enhanced/wiki/diagnostics) |
| Lire une position ou la dernière commande dans un template | [Attributs en template](https://github.com/xkain/ESPSomfy-RTS-enhanced/wiki/attributs) |
| Réagir à l'appui sur une télécommande physique | [Événements](https://github.com/xkain/ESPSomfy-RTS-enhanced/wiki/evenements) |
| Appeler les services : mouvement, inclinaison, recalage, soleil et vent, commandes brutes RTS | [Services](https://github.com/xkain/ESPSomfy-RTS-enhanced/wiki/Services) |
| Partir d'exemples complets et commentés | [Recettes d'automatisation](https://github.com/xkain/ESPSomfy-RTS-enhanced/wiki/automatisations) |
| Comprendre ce que le protocole RTS ne permet pas | [Pièges et limites](https://github.com/xkain/ESPSomfy-RTS-enhanced/wiki/pieges-et-limites) |

!!! important "Important"

    Le domaine de l'intégration est **`espsomfy_rts_enhanced`**. Vos services s'appellent donc sous
    la forme `espsomfy_rts_enhanced.<service>`, et non `espsomfy_rts.<service>` comme dans
    l'intégration d'origine. Pensez-y si vous reprenez une automatisation trouvée ailleurs.

Les services standard de Home Assistant (`cover.open_cover`, `cover.set_cover_position`,
`cover.stop_cover`…) fonctionnent par ailleurs sur toutes les entités `cover` de l'intégration.

---

# Compatibilité avec l'intégration de rstrouse (`ESPSomfy-RTS-HA`)

Si vous utilisez actuellement l'intégration originale de rstrouse ([ESPSomfy-RTS-HA](https://github.com/rstrouse/ESPSomfy-RTS-HA)), le système fonctionnera globalement. **Cependant, un problème critique de suivi des versions se pose.**

Les notes de version du firmware ne s'afficheront pas dans Home Assistant lorsqu'une mise à jour sera disponible. 

!!! important "Important"

    **Pourquoi c'est critique ?** <br>
    La future **v3.0.0** du firmware nécessitera obligatoirement une procédure de mise à jour manuelle (une page dédiée sera ajoutée à la documentation). Sans les notes de version visibles, vous risquez de lancer une mise à jour automatique qui échouera.

### Solution : Corriger le bouton "Lire l'annonce de la version"

Pour que l'intégration originale pointe vers le bon dépôt et affiche correctement les notes de mise à jour, vous devez modifier manuellement un fichier de l'intégration.

1. Ouvrez le fichier suivant sur votre serveur Home Assistant :
    `/config/custom_components/espsomfy_rts/update.py`
2. Repérez la fonction `release_url` aux alentours de la **ligne 155**.
3. Remplacez le bloc de code existant :

```python
@property
def release_url(self) -> str | None:
    """URL to the full release notes of the latest version available."""
    if (version := self.latest_version) is None:
        return None
    return f"https://github.com/rstouse/ESPSomfy-RTS/releases/tag/{version}"
```

par 

```python
@property
def release_url(self) -> str | None:
    """URL to the full release notes of the latest version available."""
    if (version := self.latest_version) is None:
        return None
    return f"https://github.com/xkain/ESPSomfy-RTS/releases/tag/{version}"
```

et redemarrer Home Assistant

