// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#include "SunCalc.h"
#include <math.h>

// Nombre de jours écoulés depuis l'epoch Unix (1970-01-01) pour une date civile UTC donnée.
// Algorithme de Howard Hinnant (domaine public,
// http://howardhinnant.github.io/date_algorithms.html) -- calcul arithmétique pur, valide sur toute
// plage raisonnable, sans dépendance à mktime/timegm (voir SunCalc.h).
static long daysFromCivil(int y, int m, int d) {
  y -= (m <= 2) ? 1 : 0;
  const long era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097L + (long)doe - 719468L;
}

time_t SunCalc::toEpoch(int year, int month, int day, float utcMinutes) {
  long days = daysFromCivil(year, month, day);
  return (time_t)(days * 86400L + lroundf(utcMinutes * 60.0f));
}

// Les macros radians()/degrees() d'Arduino portent des constantes double et feraient repasser
// toute l'expression en double précision : on garde les nôtres en float.
static inline float radf(float deg) { return deg * 0.017453292f; }
static inline float degf(float rad) { return rad * 57.29578f; }

bool SunCalc::calculate(int year, int month, int day, float lat, float lon,
                        float &sunriseUtcMinutes, float &sunsetUtcMinutes) {
  int y = year, m = month;
  if(m <= 2) { y -= 1; m += 12; }
  int a = y / 100;
  int b = 2 - a + a / 4;
  // Jour julien à 12h UTC de la date, en entier : floor(365.25 (y+4716)) = 1461 (y+4716) / 4 et
  // floor(30.6001 (m+1)) = 306001 (m+1) / 10000 exactement pour m+1 dans [4, 15].
  long jdn = (1461L * (y + 4716)) / 4 + (306001L * (m + 1)) / 10000 + day + b - 1524;
  // Siècles juliens depuis J2000.0, pour 0h UTC (jdn - 0,5).
  float jc = ((float)(jdn - 2451545L) - 0.5f) / 36525.0f;

  // Géométrie solaire moyenne + équation du centre -> longitude écliptique vraie.
  float gml = fmodf(280.46646f + jc * (36000.76983f + jc * 0.0003032f), 360.0f);
  if(gml < 0) gml += 360.0f;
  float gma = 357.52911f + jc * (35999.05029f - 0.0001537f * jc);
  float ecc = 0.016708634f - jc * (0.000042037f + 0.0000001267f * jc);
  float gmaRad = radf(gma);
  float ctr = sinf(gmaRad) * (1.914602f - jc * (0.004817f + 0.000014f * jc))
            + sinf(2 * gmaRad) * (0.019993f - 0.000101f * jc)
            + sinf(3 * gmaRad) * 0.000289f;
  // Longitude écliptique apparente (nutation + aberration) et obliquité corrigée.
  float al = gml + ctr - 0.00569f - 0.00478f * sinf(radf(125.04f - 1934.136f * jc));
  float oe = 23.0f + (26.0f + (21.448f - jc * (46.815f + jc * (0.00059f - jc * 0.001813f))) / 60.0f) / 60.0f;
  float oc = oe + 0.00256f * cosf(radf(125.04f - 1934.136f * jc));
  float decl = degf(asinf(sinf(radf(oc)) * sinf(radf(al))));

  // Équation du temps (écart entre midi solaire vrai et midi solaire moyen).
  float t = tanf(radf(oc / 2.0f));
  float vy = t * t;
  float eot = 4.0f * degf(
      vy * sinf(2 * radf(gml))
      - 2 * ecc * sinf(gmaRad)
      + 4 * ecc * vy * sinf(gmaRad) * cosf(2 * radf(gml))
      - 0.5f * vy * vy * sinf(4 * radf(gml))
      - 1.25f * ecc * ecc * sinf(2 * gmaRad));

  // 90,833° = rayon apparent du disque solaire + réfraction atmosphérique standard : convention du
  // lever/coucher "civil" (bord supérieur du disque à l'horizon), la même que les almanachs publics.
  float cosH = cosf(radf(90.833f)) / (cosf(radf(lat)) * cosf(radf(decl)))
             - tanf(radf(lat)) * tanf(radf(decl));
  if(cosH > 1.0f || cosH < -1.0f) return false; // nuit polaire ou jour polaire ce jour-là.
  float ha = degf(acosf(cosH)); // demi-durée du jour, en degrés de rotation terrestre

  float solarNoon = 720.0f - 4.0f * lon - eot; // minutes UTC
  sunriseUtcMinutes = solarNoon - 4.0f * ha;
  sunsetUtcMinutes  = solarNoon + 4.0f * ha;
  return true;
}
