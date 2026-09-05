#ifndef utils_h
#define utils_h
#include <Arduino.h>
#include <atomic>


#define DEBUG_SOMFY Serial




[[maybe_unused]] static void SETCHARPROP(char *prop, const char *value, size_t size) {strncpy(prop, value, size); prop[size - 1] = '\0';}

// Echappe une chaine pour un usage sur comme VALEUR d'une chaine JSON assemblee a la main.
// Les messages d'erreur de l'API interpolent des noms d'equipement, saisis par l'utilisateur : un
// guillemet ou un antislash suffisait a produire un corps invalide. Le client demande du JSON
// (xhr.responseType), il recoit alors null, et le message se mue en "500: Service Error" alors que
// le boitier avait parfaitement diagnostique le probleme. Improbable, pas impossible -- il suffit
// d'un equipement nomme Porte "sud".
[[maybe_unused]] static String jsonEscape(const char *s) {
  String out;
  if(!s) return out;
  for(const char *p = s; *p; p++) {
    switch(*p) {
      case '"':  out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if((uint8_t)*p < 0x20) { char b[8]; snprintf(b, sizeof(b), "\\u%04x", *p); out += b; }
        else out += *p;
    }
  }
  return out;
}

// Une broche peut-elle servir de SORTIE sans casser l'appareil ?
//
// Trois familles à écarter, et deux seulement sont couvertes par le SDK :
//   - numéro inexistant sur la variante, et broches physiquement input-only (34-39 sur l'ESP32
//     classique) -> GPIO_IS_VALID_OUTPUT_GPIO, qui connaît la variante compilée ;
//   - broches du flash SPI interne (6-11 sur l'ESP32 classique) -> le SDK les considère comme des
//     sorties parfaitement valides, alors qu'y écrire coupe l'accès au flash et fait planter
//     l'appareil sur-le-champ. Exclusion explicite obligatoire ;
//   - broches de la PSRAM sur les modules WROVER (16/17), même conséquence, d'où le test à
//     l'exécution plutôt qu'à la compilation : le même binaire esp32 tourne sur les deux.
//
// Utilisé par la validation d'API partout où un numéro de broche vient du réseau : configuration
// radio (transceiver_config_t::fromJSON), relais d'équipement (SomfyShade::validateJSON) et témoin
// lumineux (/setgeneral). Ne dit RIEN de la disponibilité de la broche -- l'anti-collision entre
// radio, Ethernet et équipements reste du ressort de somfyPinInUse().
[[maybe_unused]] static bool isUsableOutputPin(int pin) {
  if(pin < 0 || pin > 48) return false;
  if(!GPIO_IS_VALID_OUTPUT_GPIO(pin)) return false;
#if CONFIG_IDF_TARGET_ESP32
  if(pin >= 6 && pin <= 11) return false;
  if(psramFound() && (pin == 16 || pin == 17)) return false;
#endif
  return true;
}
// Pendant du precedent pour une broche qu'on ne fait que LIRE. Sur ESP32 classique, 34 a 39 sont
// input-only : GPIO_IS_VALID_OUTPUT_GPIO les refuse alors qu'elles sont parfaitement valides en
// entree, et c'est exactement ce qui rendait inconfigurables les RX de cinq cartes predefinies
// (WT32-ETH01, Olimex, LilyGO, wESP, ESP-PoE-32). Les memes exclusions destructrices restent :
// flash SPI interne et PSRAM ne sont pas un choix d'utilisateur, y toucher plante l'appareil.
[[maybe_unused]] static bool isUsableInputPin(int pin) {
  if(pin < 0 || pin > 48) return false;
  if(!GPIO_IS_VALID_GPIO(pin)) return false;
#if CONFIG_IDF_TARGET_ESP32
  if(pin >= 6 && pin <= 11) return false;
  if(psramFound() && (pin == 16 || pin == 17)) return false;
#endif
  return true;
}
/*
namespace util { 
  // Createa a custom to_string function.  C++ can be annoying
  // with all the trailing 0s on number formats.
  template <typename T> std::string to_string(const T& t) {
    std::string str{std::to_string (t)};
    int offset{1};
    if (str.find_last_not_of('0') == str.find('.')) {
      offset = 0;     
    }
    str.erase ( str.find_last_not_of('0') + 1, std::string::npos ); 
    str.erase ( str.find_last_not_of('.') + 1, std::string::npos );    
    return str; 
  } 
}
*/

static void _ltrim(char *str) {
  int s = 0, j, k = 0;
  int e = strlen(str);
  while(s < e && (str[s] == ' ' || str[s] == '\n' || str[s] == '\r' || str[s] == '\t' || str[s] == '"')) s++;
  if(s > 0) {
    for(j = s; j < e; j++) {
      str[k] = str[j];
      k++;
    }
    str[k] = '\0';
  }
  //if(s > 0) strcpy(str, &str[s]);
}
static void _rtrim(char *str) {
  int e = strlen(str) - 1;
  while(e >= 0 && (str[e] == ' ' || str[e] == '\n' || str[e] == '\r' || str[e] == '\t' || str[e] == '"')) {str[e] = '\0'; e--;}
}
[[maybe_unused]] static void _trim(char *str) { _ltrim(str); _rtrim(str); }
// Copie bornée qui ne coupe JAMAIS au milieu d'un caractère UTF-8 (constat T-1, 24/08/2026).
//
// `strlcpy()` tronque au N-ième OCTET, pas au N-ième caractère. Un nom accentué dont la coupe tombe
// entre les deux octets d'un caractère laisse son octet de tête ORPHELIN dans la chaîne stockée,
// puis dans tout JSON qui la resérialise. Mesuré sur matériel avec une pièce nommée
// « Salon rez-de-chaussée » (21 caractères, 22 octets) dans un `char name[21]` : la réponse se
// terminait par `...chauss\xc3"`, et `/discovery`, `/rooms` et `/controller` devenaient indécodables
// pour tout consommateur UTF-8 STRICT -- au premier rang duquel l'écosystème Home Assistant. Le
// navigateur, lui, décode en mode tolérant et remplace l'octet : le symptôme web n'est que
// cosmétique, ce qui rend le défaut d'autant plus facile à manquer.
//
// Taux mesuré sur 144 noms français plausibles : 1,4 % cassent. Avec un emoji en fin de nom
// (habitude courante en domotique mobile, 4 octets par caractère) : 50,6 %.
//
// Retire donc, après troncature, une éventuelle séquence UTF-8 incomplète en fin de chaîne. Un
// contenu qui n'est pas de l'UTF-8 valide (octet de tête aberrant, chaîne faite de continuations)
// est tronqué de la même façon plutôt que laissé tel quel : mieux vaut un nom raccourci qu'une
// sortie que personne ne peut analyser.
[[maybe_unused]] static void _trimPartialUtf8(char *str) {
  size_t len = strlen(str);
  if(len == 0) return;
  // Reculer jusqu'à l'octet de TÊTE de la dernière séquence (les octets de continuation valent
  // 10xxxxxx). Le transtypage en unsigned char n'est pas cosmétique : `char` est SIGNÉ sur xtensa,
  // donc tout octet >= 0x80 est négatif et un test naïf se tromperait -- même piège que M-12.
  size_t i = len;
  while(i > 0 && ((unsigned char)str[i - 1] & 0xC0) == 0x80) i--;
  if(i == 0) { str[0] = '\0'; return; } // que des continuations : rien d'exploitable
  const unsigned char lead = (unsigned char)str[i - 1];
  size_t need;
  if((lead & 0x80) == 0x00) need = 1;       // ASCII
  else if((lead & 0xE0) == 0xC0) need = 2;
  else if((lead & 0xF0) == 0xE0) need = 3;
  else if((lead & 0xF8) == 0xF0) need = 4;
  else { str[i - 1] = '\0'; return; }       // octet de tête invalide
  // Nombre d'octets réellement présents pour cette séquence, terminateur exclu.
  if((len - (i - 1)) < need) str[i - 1] = '\0';
}
// À utiliser partout où une chaîne saisie par l'utilisateur est recopiée dans un champ de taille
// fixe qui sera ensuite sérialisé (noms d'équipement/pièce/groupe/planification, hostname, topics MQTT,
// identifiants). Même signature que strlcpy() pour rester substituable.
[[maybe_unused]] static size_t strlcpyUtf8(char *dst, const char *src, size_t size) {
  size_t r = strlcpy(dst, src, size);
  if(r >= size) _trimPartialUtf8(dst); // r >= size : la source ne tenait pas, il y a eu troncature
  return r;
}
// reboot est en std::atomic : lu par loop() (tâche principale) et écrit par de nombreux handlers
// Web (potentiellement sur la tâche async_tcp après migration ESPAsyncWebServer). rebootTime reste
// un uint32_t ordinaire -- l'ordre d'écriture (rebootTime PUIS reboot=true, jamais l'inverse) combiné
// à la sémantique seq_cst par défaut de l'atomique garantit qu'un lecteur qui observe reboot==true
// voit forcément la valeur finale de rebootTime (happens-before via la synchronisation sur reboot).
struct rebootDelay_t {
  std::atomic<bool> reboot{false};
  uint32_t rebootTime = 0;
  bool closed = false;
};
[[maybe_unused]] static bool toBoolean(const char *str, bool def) {
  if(!str) return def;
  if(strlen(str) == 0) return def;
  else if(str[0] == 't' || str[0] == 'T' || str[0] == '1') return true;
  else if(str[0] == 'f' || str[0] == 'F' || str[0] == '0') return false;
  return def;
}

class Timestamp {
  char _timeBuffer[128];
  public:
    time_t getUTC();
    time_t getUTC(time_t epoch);
    char * getISOTime();
    char * getISOTime(time_t epoch);
    char * formatISO(struct tm *dt, int tz);
    int tzOffset();
    static time_t parseUTCTime(const char *buff);
    static time_t mkUTCTime(struct tm *dt);
    static int calcTZOffset(time_t *dt);
    static time_t now();
    static unsigned long epoch();
};
// Sort an array
template<typename AnyType> void sortArray(AnyType array[], size_t sizeOfArray);
// Sort in reverse
template<typename AnyType> void sortArrayReverse(AnyType array[], size_t sizeOfArray);
// Sort an array with custom comparison function
template<typename AnyType> void sortArray(AnyType array[], size_t sizeOfArray, bool (*largerThan)(AnyType, AnyType));
// Sort in reverse with custom comparison function
template<typename AnyType> void sortArrayReverse(AnyType array[], size_t sizeOfArray, bool (*largerThan)(AnyType, AnyType));
namespace ArduinoSort {
  template<typename AnyType> bool builtinLargerThan(AnyType first, AnyType second) { return first > second; }
  //template<> bool builtinLargerThan(char* first, char* second) { return strcmp(first, second) > 0; }
  template<typename AnyType> void insertionSort(AnyType array[], size_t sizeOfArray, bool reverse, bool (*largerThan)(AnyType, AnyType)) { for (size_t i = 1; i < sizeOfArray; i++) {
    for (size_t j = i; j > 0 && (largerThan(array[j-1], array[j]) != reverse); j--) {
        AnyType tmp = array[j-1];
        array[j-1] = array[j];
        array[j] = tmp;
      }
    }
  }
}
template<typename AnyType> void sortArray(AnyType array[], size_t sizeOfArray) { ArduinoSort::insertionSort(array, sizeOfArray, false, ArduinoSort::builtinLargerThan); }
template<typename AnyType> void sortArrayReverse(AnyType array[], size_t sizeOfArray) { ArduinoSort::insertionSort(array, sizeOfArray, true, ArduinoSort::builtinLargerThan); }
template<typename AnyType> void sortArray(AnyType array[], size_t sizeOfArray, bool (*largerThan)(AnyType, AnyType)) { ArduinoSort::insertionSort(array, sizeOfArray, false, largerThan); }
template<typename AnyType> void sortArrayReverse(AnyType array[], size_t sizeOfArray, bool (*largerThan)(AnyType, AnyType)) { ArduinoSort::insertionSort(array, sizeOfArray, true, largerThan); }
#endif
