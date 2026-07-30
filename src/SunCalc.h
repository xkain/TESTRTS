#ifndef SUNCALC_H
#define SUNCALC_H
#include <Arduino.h>

// Lever/coucher du soleil par la méthode NOAA (Meeus, "Astronomical Algorithms"), sans dépendance
// externe -- précision sous la minute pour un usage domotique, validée dans l'étude de faisabilité
// contre des références connues (plusieurs latitudes, saisons, hémisphères ; écart maximal observé
// inférieur à une minute). Coût : une quinzaine d'appels trigonométriques, exécutés une seule fois
// par jour -- sans objet en temps CPU.
class SunCalc {
  public:
    // Renvoie false si aucun évènement pour cette date à cette latitude (nuit ou jour polaire) --
    // au-delà d'environ 66,5° de latitude à certaines périodes de l'année. Les heures renvoyées
    // sont en MINUTES UTC depuis minuit (peuvent dépasser [0,1440) de quelques minutes près du
    // changement de jour) : c'est à l'appelant de les convertir en heure locale via toEpoch() +
    // localtime_r(), seule façon fiable de tenir compte du fuseau ET de l'heure d'été/hiver sans
    // réimplémenter les règles déjà connues de la libc (cf. NTPSettings::apply()).
    static bool calculate(int year, int month, int day, double latitude, double longitude,
                          double &sunriseUtcMinutes, double &sunsetUtcMinutes);
    // Convertit une date civile UTC + des minutes depuis minuit UTC en epoch Unix. Repose sur un
    // calcul arithmétique direct (Howard Hinnant, domaine public) plutôt que sur mktime/timegm :
    // timegm est une extension GNU absente de certaines libc de framework, et mktime interprèterait
    // la date dans le fuseau local courant au lieu de UTC.
    static time_t toEpoch(int year, int month, int day, double utcMinutes);
};
#endif
