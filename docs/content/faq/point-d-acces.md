# Un réseau « ESPSomfyRTS » est apparu, ou l'adresse 192.168.4.1

C'est le **point d'accès de secours** de votre appareil : un réseau Wi-Fi qu'il ouvre
lui-même quand il ne peut pas rejoindre le vôtre (premier démarrage, mauvais mot de passe
Wi-Fi, box en panne, câble Ethernet débranché).

- Son nom est le **nom d'hôte** de l'appareil, `ESPSomfyRTS` par défaut.
- Il donne accès à l'interface à l'adresse **`http://192.168.4.1`**, pour configurer
  l'appareil même sans réseau.
- Il n'a **pas d'accès Internet**, et il disparaît dès que l'appareil a rejoint votre réseau.

Vous n'avez rien à faire de plus que vous y connecter, puis rejoindre votre réseau. En v3, un
badge **AP** dans la barre du haut de l'interface indique qu'on est dessus.

Tous les détails, et ce qui diffère entre v2.x et v3.x : [Point d'accès de
secours](../commun/point-d-acces.md).
