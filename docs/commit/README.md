# Git Commit GUI

Petite interface graphique PyQt6 pour les opérations Git courantes : sélection du
dépôt, changement de branche, indexation par cases à cocher, commit et push.

## Installation

```bash
pip install --user PyQt6
```

C'est la seule dépendance : l'intégration Git passe par `subprocess` et le binaire
`git` du système, pas par GitPython.

## Lancement

```bash
python3 docs/commit/git_commit_gui.py
```

Un chemin de dépôt peut être passé en argument ; sinon le dernier dépôt ouvert est
rechargé automatiquement (QSettings).

## Fonctionnement

| Élément | Détail |
|---|---|
| Dossier local | Bouton « Parcourir… » ; un sous-dossier est automatiquement ramené à la racine du dépôt |
| Dépôt distant | URL de `origin` (ou du premier remote), en lecture seule, pour vérifier la cible |
| Branche active | Liste déroulante ; changer de branche exécute `git checkout` |
| Arbre | Fichiers modifiés (ou tout le dépôt si la case est décochée), `.gitignore` respecté |
| Cases à cocher | Cocher un dossier coche tout son contenu ; les parents passent en état partiel |
| Stage / Add | `git add --` sur les fichiers cochés, par lots de 200 chemins |
| Commit | `git commit -F -` : le message passe par l'entrée standard, donc guillemets, accents et sauts de ligne sont sans danger |
| Push | `git push` ; si la branche n'a pas d'amont, propose `--set-upstream origin <branche>` |
| Journal | Sortie complète des commandes, commandes en bleu, erreurs en rouge, succès en vert |

## Raccourcis

- `Ctrl+Entrée` : commit
- `F5` : actualiser

## Points d'attention

- `GIT_TERMINAL_PROMPT=0` est imposé : si une authentification est nécessaire, le
  push échoue avec un message au lieu de figer l'interface en attendant une saisie.
  Les identifiants doivent donc être gérés en amont (agent SSH, `credential.helper`).
- Les commandes lentes (add, commit, push, checkout) s'exécutent dans un thread
  séparé ; l'interface reste vivante et les boutons sont désactivés le temps de
  l'opération.
- Une suite de commandes s'interrompt à la première qui échoue.
