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

time_t SunCalc::toEpoch(int year, int month, int day, double utcMinutes) {
  long days = daysFromCivil(year, month, day);
  return (time_t)(days * 86400L + (long)round(utcMinutes * 60.0));
}

bool SunCalc::calculate(int year, int month, int day, double lat, double lon,
                        double &sunriseUtcMinutes, double &sunsetUtcMinutes) {
  int y = year, m = month;
  if(m <= 2) { y -= 1; m += 12; }
  int a = y / 100;
  int b = 2 - a + a / 4;
  // Jour julien à 0h UTC de la date demandée.
  double jd = (double)(long)(365.25 * (y + 4716)) + (long)(30.6001 * (m + 1)) + day + b - 1524.5;
  double jc = (jd - 2451545.0) / 36525.0; // siècles juliens depuis J2000.0

  // Géométrie solaire moyenne + équation du centre -> longitude écliptique vraie.
  double gml = fmod(280.46646 + jc * (36000.76983 + jc * 0.0003032), 360.0);
  if(gml < 0) gml += 360.0;
  double gma = 357.52911 + jc * (35999.05029 - 0.0001537 * jc);
  double ecc = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc);
  double gmaRad = radians(gma);
  double ctr = sin(gmaRad) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
             + sin(2 * gmaRad) * (0.019993 - 0.000101 * jc)
             + sin(3 * gmaRad) * 0.000289;
  // Longitude écliptique apparente (nutation + aberration) et obliquité corrigée.
  double al = gml + ctr - 0.00569 - 0.00478 * sin(radians(125.04 - 1934.136 * jc));
  double oe = 23.0 + (26.0 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60.0) / 60.0;
  double oc = oe + 0.00256 * cos(radians(125.04 - 1934.136 * jc));
  double decl = degrees(asin(sin(radians(oc)) * sin(radians(al))));

  // Équation du temps (écart entre midi solaire vrai et midi solaire moyen).
  double vy = pow(tan(radians(oc / 2.0)), 2);
  double eot = 4.0 * degrees(
      vy * sin(2 * radians(gml))
      - 2 * ecc * sin(gmaRad)
      + 4 * ecc * vy * sin(gmaRad) * cos(2 * radians(gml))
      - 0.5 * vy * vy * sin(4 * radians(gml))
      - 1.25 * ecc * ecc * sin(2 * gmaRad));

  // 90,833° = rayon apparent du disque solaire + réfraction atmosphérique standard : convention du
  // lever/coucher "civil" (bord supérieur du disque à l'horizon), la même que les almanachs publics.
  double cosH = cos(radians(90.833)) / (cos(radians(lat)) * cos(radians(decl)))
              - tan(radians(lat)) * tan(radians(decl));
  if(cosH > 1.0 || cosH < -1.0) return false; // nuit polaire ou jour polaire ce jour-là.
  double ha = degrees(acos(cosH)); // demi-durée du jour, en degrés de rotation terrestre

  double solarNoon = 720.0 - 4.0 * lon - eot; // minutes UTC
  sunriseUtcMinutes = solarNoon - 4.0 * ha;
  sunsetUtcMinutes  = solarNoon + 4.0 * ha;
  return true;
}
