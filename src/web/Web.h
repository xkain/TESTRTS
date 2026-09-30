// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2023 Robert Strouse <https://github.com/rstrouse>
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
// WebServer.h avant ESPAsyncWebServer.h : cf. commentaire détaillé en tête de WResp.h.
#include <WebServer.h>
#include <ESPAsyncWebServer.h>
#include "somfy/Somfy.h"
#ifndef webserver_h
#define webserver_h
class Web {
public:
  void startup();
  void begin();
  // Web Handlers
  bool createAPIToken(const IPAddress ipAddress, char *token);
  bool createAPIToken(const char *payload, char *token);
  bool createAPIPinToken(const IPAddress ipAddress, const char *pin, char *token);
  bool createAPIPasswordToken(const IPAddress ipAddress, const char *username, const char *password, char *token);
  void loadApiSecret();

  // handleStreamFile : filename ne doit JAMAIS inclure le suffixe .gz.
  // - alwaysGzipped = false (défaut) : filename peut exister en clair ou dans les deux variantes
  //   selon le cas -- AsyncFileResponse détecte et sert lui-même filename+".gz" si filename seul
  //   n'existe pas.
  // - alwaysGzipped = true : réservé aux fichiers du pipeline de build (index.html/js/css/svg/json
  //   issus de data-dev/), qui n'embarque JAMAIS la variante "nue" -- interroger directement le
  //   .gz évite le double lookup raté (LittleFS.exists() puis fallback) à chaque requête. À ne
  //   PAS utiliser pour shades.cfg/tmp ni la langue couramment sélectionnée, qui peuvent exister
  //   en clair.
  // Cache-Control par défaut : no-cache, must-revalidate (le navigateur garde une copie mais doit
  // la revalider avant usage).
  // - isRootDocument = true : index.html lui-même, seul fichier qui référence les URLs
  //   versionnées ci-dessous. Force "no-store, no-cache, must-revalidate, max-age=0" et ajoute les
  //   en-têtes de durcissement (CSP, X-Content-Type-Options), inutiles à répéter sur chaque asset.
  // - immutableVersioned = true : réservé à index.js/index.css, dont l'URL porte le suffixe
  //   "?v=<version de build>". Cache-Control: max-age=31536000, immutable -- MAIS seulement sur
  //   une release propre (BUILD_ASSET_CACHE_IMMUTABLE, posé par build_data_image.py). En dev, où
  //   la version peut changer sans qu'un onglet déjà ouvert ne le voie, on reste en
  //   no-cache/must-revalidate : un cache long y a déjà produit du JS/CSS périmé après
  //   reflash/AP/erase.
  void handleStreamFile(AsyncWebServerRequest *request, const char *filename, const char *contentType, bool isRootDocument = false, bool alwaysGzipped = false, bool immutableVersioned = false);
  void handleNotFound(AsyncWebServerRequest *request);
  void handleDeserializationError(AsyncWebServerRequest *request, DeserializationError &err);
  // Ne réémet pas d'en-tête de réponse "apikey" en écho au token déjà connu du client : ce dernier
  // l'a lui-même calculé de façon déterministe (même HMAC IP+réglages de sécurité), l'écho ne
  // transporterait donc aucune information nouvelle -- et une réponse concrète n'existe pas encore
  // à ce stade (elle est construite plus tard par l'appelant).
  // Même décision que isAuthenticated(), mais SANS émettre de réponse : indispensable dans les
  // callbacks de corps de requête (upload), qui s'exécutent AVANT le handler et où répondre
  // reviendrait à écrire au milieu de la réception. isAuthenticated() n'est plus qu'un
  // enrobage qui y ajoute le 401.
  bool checkAuth(AsyncWebServerRequest *request, bool cfg = false);
  bool isAuthenticated(AsyncWebServerRequest *request, bool cfg = false);

  // Draine les réponses fichier LittleFS encore en cours d'émission sur la tâche async_tcp. À
  // appeler depuis la tâche principale APRÈS avoir posé git.lockFS, avant toute écriture du
  // filesystem (OTA, pack de langue) -- cf. le commentaire détaillé sur g_asyncFileReaders dans
  // Web.cpp. Renvoie false si le budget d'attente est épuisé, l'appelant poursuivant alors quand
  // même (comportement identique à l'existant, aucun blocage nouveau introduit).
  bool waitForFileReaders(uint32_t timeoutMs = 2000);

private:
  // Clé de signature HMAC des jetons de session : générée aléatoirement au premier boot et
  // persistée en NVS (namespace dédié). Ne jamais l'exposer via une réponse JSON/MQTT/mDNS.
  char apiSecret[65] = "";
};
#endif
