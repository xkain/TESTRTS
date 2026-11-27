# Plannings

Les plannings sont ceux de l'appareil : c'est **l'appareil** qui les exécute, à l'heure dite ou au
lever et au coucher du soleil, même si Home Assistant est arrêté. L'intégration les montre, permet
de les activer ou de les désactiver, et de les créer, modifier ou supprimer.

!!! note "Firmware v3 seulement"

    Les plannings arrivent avec le firmware v3. Sur un firmware v2, l'intégration ne crée aucune
    entité de planning et l'onglet **Plannings** du panneau affiche *« Cet appareil n'a pas de
    plannings : ils arrivent avec le micrologiciel v3. »*

## Les entités d'un planning { #entites }

Chaque planning donne jusqu'à trois entités, rattachées à l'**appareil de sa cible** dans Home
Assistant (l'équipement ou le groupe qu'il pilote), et non à l'appareil ESPSomfy-RTS :

| Entité | Nom | Catégorie | Contenu |
| :--- | :--- | :--- | :--- |
| `switch` | **{nom} ({heure})** | configuration | allumé quand le planning est actif ; l'éteindre le désactive sur l'appareil |
| `sensor` | **{nom} ({heure}) prochain déclenchement** | diagnostic | date et heure du prochain déclenchement ; vide pour un planning désactivé |
| `sensor` | **{nom} ({heure}) dernier déclenchement** | diagnostic | date et heure du dernier déclenchement |

**{nom}** est le nom du planning (son numéro s'il n'en a pas), **{heure}** son heure fixe, ou
**Lever du soleil** / **Coucher du soleil**. Deux plannings de même nom sur la même cible se
distinguent ainsi par leur heure.

![Entités d'un planning sur la page de l'équipement](home-assistant/img/ha-equipement-plannings){ .on-glb }

!!! warning "Ce que les capteurs ne savent pas"

    * **Dernier déclenchement** est tenu par l'appareil : il est perdu quand l'appareil redémarre.
    * **Prochain déclenchement** d'un planning au lever ou au coucher du soleil peut rester
        inconnu tant que l'appareil n'a pas envoyé l'heure solaire du jour pour ce planning.

## Créer ou modifier un planning { #creer }

Le plus simple est l'onglet **Plannings** du [panneau](panneau.md#plannings) : `Ajouter` pour un
nouveau planning, le crayon d'une carte pour le modifier ou le supprimer.

On peut aussi le faire par une action, dans une automatisation ou un script :

| Action | Cible | Effet |
| :--- | :--- | :--- |
| `espsomfy_rts_enhanced.create_schedule` (**Créer un planning**) | l'entité `cover` d'un équipement ou d'un groupe | crée le planning sur l'appareil et renvoie son identifiant, `schedule_id` |
| `espsomfy_rts_enhanced.delete_schedule` (**Supprimer le planning**) | l'interrupteur du planning | supprime le planning de l'appareil |

Leurs champs sont décrits dans [Services](services.md). Exemple : fermer le salon à 50 % au
coucher du soleil, un quart d'heure avant, en semaine.

```yaml
action: espsomfy_rts_enhanced.create_schedule
target:
  entity_id: cover.salon
data:
  days: [mon, tue, wed, thu, fri]
  time_ref: sunset
  offset: -15
  action: position
  position: 50
response_variable: nouveau
```

`nouveau.schedule_id` contient ensuite l'identifiant du planning créé.

## Modifications faites sur l'appareil { #resynchro }

Un planning créé, modifié (nom ou heure fixe) ou supprimé depuis l'interface de l'appareil est
repris par Home Assistant : l'intégration se recharge d'elle-même **5 secondes** après le
changement, et les entités suivent. L'activation ou la désactivation d'un planning, elle, se voit
aussitôt sans rechargement.

## Groupes aux membres de sens mélangés { #groupes-mixtes }

Un planning envoie à tous les membres d'un groupe la même valeur. Si le groupe mêle des
équipements dont la position est inversée et des équipements normaux, cette valeur ne voudrait pas
dire la même chose pour tous : l'intégration refuse alors le planning, avec le message *« Ce groupe
mélange des membres inversés et des membres normaux : l'appareil leur enverrait la même valeur.
Créez un planning par équipement. »* Dans le panneau, ce groupe est grisé dans la liste des cibles.

## Messages d'erreur { #erreurs }

| Message | Cause |
| :--- | :--- |
| *Un planning à heure fixe demande une heure.* | **Heure fixe** choisie sans heure |
| *Aller à une position demande une position.* | action **Aller à une position** sans position |
| *L'inclinaison seule demande une inclinaison.* | action **Inclinaison seule** sans inclinaison |
| *Ce firmware ne permet pas de gérer les plannings depuis Home Assistant.* | firmware v2 |
| *L'appareil garde 20 caractères au plus ; une lettre accentuée compte pour deux.* | nom trop long |
| *&lt;entité&gt; n'est pas un planning.* | `delete_schedule` visant un interrupteur qui n'est pas celui d'un planning |
