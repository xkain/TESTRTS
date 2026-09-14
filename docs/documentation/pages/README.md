# Les outils en ligne — ESPSomfy-RTS

Le site accompagne le firmware avec deux outils qui tournent **entièrement dans votre
navigateur**. Rien à installer, aucun compte, aucun serveur intermédiaire : la page fait le
travail sur votre machine et parle directement à votre appareil.

Chaque page répond à un besoin précis. Cette documentation dit lequel, et dans quel cas
l'ouvrir.

---

## Sommaire

| Page | À quoi elle sert | Quand l'ouvrir |
|---|---|---|
| [Installateur web](installateur.md) | écrire le firmware sur la puce par le câble USB, lire les journaux série | premier montage, changement de version, appareil qui ne démarre plus |
| [Géolocalisation](geolocalisation.md) | trouver les coordonnées GPS du domicile et les transmettre à l'appareil | une seule fois, pour les programmations au lever et au coucher du soleil |

La page d'accueil ne fait que mener à l'une ou l'autre : elle n'a pas de fonction propre.

---

## Ce qu'il faut savoir avant de commencer

### L'installateur exige un navigateur précis

Il repose sur **Web Serial**, une interface que tous les navigateurs n'implémentent pas.

| Navigateur | Installateur | Géolocalisation |
|---|---|---|
| Chrome, Edge, Brave, Opera (ordinateur) | oui | oui |
| Firefox | **non** | oui |
| Safari | **non** | oui |
| Navigateurs mobiles | **non** | oui |

Le refus de Firefox et de Safari n'est pas un défaut de la page : ces navigateurs ont
choisi de ne pas implémenter Web Serial. Aucune option ne le contourne.

La page doit aussi être chargée en **HTTPS** — ce qui est le cas sur le site publié.

La géolocalisation, elle, n'a besoin de rien de particulier.

### Ce qui sort de votre machine, et ce qui n'en sort pas

| | Reste chez vous | Part sur Internet |
|---|---|---|
| Installateur | le port série, l'image écrite, les journaux | le téléchargement du firmware depuis GitHub |
| Géolocalisation, position du navigateur | la position, envoyée seulement à votre appareil | rien |
| Géolocalisation, recherche par ville | — | le nom de la ville, envoyé à OpenStreetMap |

Le seul cas où une donnée que vous saisissez quitte votre machine est la **recherche par
ville** : le nom tapé part chez OpenStreetMap, qui répond avec les coordonnées. La
détection par le navigateur, elle, ne transmet votre position à personne d'autre qu'à votre
appareil.

### Une installation efface tout

C'est le point à retenir de toute cette documentation. Installer un firmware depuis
l'installateur web **efface la totalité de la mémoire** avant d'écrire : identifiants
Wi-Fi, équipements déclarés, télécommandes appairées, programmations, codes tournants.
L'appareil redémarre comme au sortir de l'usine.

**Faites une sauvegarde depuis l'interface de l'appareil avant d'installer**, et
restaurez-la ensuite. Voir [Installateur web](installateur.md#avant-dinstaller-sauvegardez).
