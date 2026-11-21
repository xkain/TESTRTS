// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef jsonhelpers_h
#define jsonhelpers_h
#include <ArduinoJson.h>
#include "Utils.h"   // strlcpyUtf8

// « Si la clé existe, affecte » en UN parcours de l'objet, là où containsKey() + operator[] en
// faisaient deux et chargeaient deux fois le littéral de la clé (plus de 300 champs lus ainsi).
// Une clé présente mais nulle est ignorée, l'ancienne forme lui aurait affecté 0 : l'interface
// n'envoie jamais de null. Pas de static : les instanciations se replient entre unités.
template<typename TObj, typename T> inline bool jget(TObj &obj, const char *key, T &dst) {
  auto v = obj[key];
  if(v.isNull()) return false;
  dst = v.template as<T>();
  return true;
}
// « Si la clé porte une chaîne, recopie-la » : une valeur d'un autre type (nombre, null) convertie
// en const char* vaut nullptr, que strlcpy déréférençait -- redémarrage sur un simple {"name": 5}.
template<typename TObj> inline bool jgetStr(TObj &obj, const char *key, char *dst, size_t size) {
  const char *v = obj[key] | (const char *)nullptr;
  if(!v) return false;
  strlcpyUtf8(dst, v, size);
  return true;
}
#endif
