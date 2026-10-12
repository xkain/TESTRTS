<!-- Page produite par tools/mkdocs-site/import-wiki-v2.py à partir de
     wiki-v2-source/Factory-Reset.md. Toute retouche ici sera écrasée : corriger le
     wiki, redéposer la source, puis relancer le script. -->

# Factory Reset

## Troubleshooting & Factory Reset

Si vous perdez l'accès à l'interface web (erreur de configuration réseau ou mot de passe oublié) ou si l'appareil se comporte de manière erratique, vous pouvez effectuer une réinitialisation pour restaurer l'appareil à son état "out-of-the-box".


!!! tip "Astuce"

    Utilisez ces procédures en dernier recours, si le bouton "Restore" dans l'interface web n'est plus accessible.

!!! important "Important"

    **Le firmware :** La version du firmware reste la même après un reset (par exemple, si vous êtes en v2.5.1, vous restez en v2.5.1).<br>
    **Évolution de la LED témoin (GPIO 02) :** > * **Jusqu'à la v2.5.3 :** Réservé aux modèles avec LED embarquée (ex: DevKit v1, D1 Mini). Les modèles S2, S3 et C3 excluent le GPIO 02 pour le garder disponible. 

    * **Depuis la v2.5.4+ :** La LED témoin a été **temporairement désactivée par défaut**. Le GPIO 02 a été libéré afin d'élargir la compatibilité native entre les différentes déclinaisons d'ESP32 et standardiser le code de base. Cette option sera réintroduite lors d'une prochaine mise à jour.

!!! note "Note"

    **Boîtier Leboncoin :** Si vous avez acheté un boîtier officiel via **Leboncoin** version Wi-Fi, votre appareil est pleinement compatible et dispose de cette fonctionnalité de LED bleue. La version Ethernet & Wif-Fi **ne dispose pas** (ou pas encore) de cette fonctionnalité de LED témoin.

# Version v2.5.1 et ultérieures
Cette version introduit un système à deux paliers pour éviter de perdre inutilement vos réglages de volets, de pièces et autres.

!!! note "Note"

    **Note pour les versions v2.5.4 et supérieures :** La procédure de "Power Cycle" (coupures d'alimentation) reste **100% fonctionnelle**. Cependant, le témoin lumineux physique est désactivé. Vous devez simplement réaliser la procédure "à l'aveugle" en comptant le temps dans votre tête (fenêtre de 5 secondes).

**Fonctionnement de la LED :** Au branchement, la LED reste fixe pendant **5 secondes**. C'est la fenêtre de temps dont vous disposez pour débrancher l'appareil afin de compter un cycle. Passé ce délai, l'ESP32 démarrera normalement.<br>
**Sans LED** : Le fonctionnement reste le même, la seule différence est que vous devrez compter le temps dans votre tête.

<table>
  <tr>
    <td width="60%" valign="top">
      <strong>Procédures de Power Cycle (v2.5.1+) :</strong>
      <ol>
        <li>
          <strong>Réinitialisation Réseau & Sécurité (3 Cycles) :</strong>
          Débranchez/Rebranchez 3 fois pendant que la LED est fixe. Au 3ème branchement, la LED clignote. 
          <br><em>Résultat : Wi-Fi effacé et sécurité désactivée. Vos volets/MQTT sont conservés.  L'appareil redémarrera en mode Access Point (SSID: ESPSomfyRTS).</em>
        </li>
        <br>
        <li>
          <strong>Factory Reset Complet (6 Cycles) :</strong>
          Continuez jusqu'au 6ème branchement. La LED clignotera à nouveau.
          <br><em>Résultat : Retour à l'état "out-of-the-box". Toutes les configurations sont perdues. L'appareil redémarrera en mode Access Point (SSID: ESPSomfyRTS).</em>
        </li>
      </ol>
    </td>
    <td width="40%" align="center" valign="middle">
    <img alt="Hard Reset Process" src="https://github.com/user-attachments/assets/d221ced3-128f-4867-9af4-e1b0ac29965c" />
      <br />
      <em>Animation de la séquence de reset</em>
    </td>
  </tr>
</table>

### Indicateurs (LED)

| État au branchement | Signification |
| :--- | :--- |
| **Fixe (5 secondes)** | Phase d'attente : Débranchez maintenant pour compter un cycle. |
| **Clignotement** | Seuil atteint (3 ou 6 cycles) : La procédure de reset est validée, attendez que l'ESP32 redémarre tout seul. |


# Version v2.5.0
Dans cette version, seule la réinitialisation complète est disponible.

**Fonctionnement de la LED :** Au branchement, la LED clignote pendant **5 secondes**. C'est la fenêtre de temps dont vous disposez pour débrancher l'appareil afin de compter un cycle. Passé ce délai, l'ESP32 démarrera normalement.<br>
**Sans LED** : Le fonctionnement reste le même, la seule différence est que vous devrez compter le temps dans votre tête.

<table>
  <tr>
    <td width="60%" valign="top">
      <strong>Procédures de Power Cycle (v2.5.0) :</strong>
      <ol>
        <li><strong>Débranchez et rebranchez</strong> l'alimentation <strong>4 fois</strong> de suite.</li>
        <li>Au <strong>4ème démarrage</strong>, le système entre en mode reset.</li>
        <li><strong>Indicateur visuel :</strong> La LED clignote très rapidement pour confirmer.</li>
        <li>L'appareil redémarre en mode <strong>Access Point</strong> (SSID: <code>ESPSomfyRTS</code>).</li>
      </ol>
      <p><i>Note : Toutes vos données (Wi-Fi, MQTT, Rooms, Shades, etc...) sont définitivement supprimées.</i></p>
    </td>
    <td width="40%" align="center" valign="middle">
    <img alt="Hard Reset Process" src="https://github.com/user-attachments/assets/ba5b1212-aa80-4356-a302-d1d0cf7e6fd0" />
      <br />
      <em>Animation de la séquence de reset</em>
    </td>
  </tr>
</table>

### Indicateurs (LED)

| État au branchement | Signification |
| :--- | :--- |
| **Clignotement (5 secondes)** | Phase d'attente : Débranchez maintenant pour compter un cycle. |
| **Clignotement rapide** | Seuil atteint (4 cycles) : La procédure de reset est validée, l'ESP32 va redémarrer. |

<br>

!!! tip "Astuce"

    Une fois l'accès retrouvé (http://192.168.4.1), pensez à effectuer une sauvegarde de votre configuration. Cela vous évitera de devoir réappairer vos volets en cas de futur reset complet.


!!! important "Important"

    **Disponibilité :** Ces procédures de réinitialisation par cycles d'alimentation (Power Cycle) ont été introduites à partir de la **version v2.5.0**. Les versions antérieures ne disposent pas de cette fonctionnalité manuelle.

