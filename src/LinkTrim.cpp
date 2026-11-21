// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
//
// Deux détournements d'édition de liens, sans aucune fonctionnalité :
// 1. Même compilé en -fno-exceptions, le projet référence operator new et des std::__throw_* de la
//    libstdc++, qui tiraient tout l'étage d'exceptions (eh_alloc, cow-stdexcept, string-inst...) pour
//    finir de toute façon en terminate(). Les fournir ici avec abort() donne le même résultat, sans
//    l'étage. Un symbole oublié ferait revenir functexcept.o de la libstdc++ et échouer l'édition de
//    liens sur un doublon : c'est le signal pour l'ajouter ici. Réservé au cœur Arduino 2.x (GCC 8,
//    cibles 4 Mo) : la libstdc++ de GCC 14 du cœur 3.x (ESP32-C6, pioarduino) fait entrer functexcept.o
//    malgré ces définitions et l'édition de liens échoue en doublons ; en 8 Mo le gain est sans objet.
// 2. WiFiGeneric.cpp du core référence WIFI_PROV_EVENT et wifi_prov_mgr_deinit() : cela lie toute la
//    bibliothèque de provisioning Wi-Fi, que ce firmware n'utilise jamais. Définis localement, elle
//    reste dehors ; le gestionnaire que le core enregistre sur cette base ne sera jamais appelé.
#include <cstdlib>
#include <cstddef>
#include <new>
#include <esp_event.h>
#include <esp_arduino_version.h>

#if ESP_ARDUINO_VERSION_MAJOR < 3
void *operator new(size_t n) { void *p = malloc(n ? n : 1); if(!p) abort(); return p; }
void *operator new[](size_t n) { void *p = malloc(n ? n : 1); if(!p) abort(); return p; }
void *operator new(size_t n, const std::nothrow_t &) noexcept { return malloc(n ? n : 1); }
void *operator new[](size_t n, const std::nothrow_t &) noexcept { return malloc(n ? n : 1); }
void operator delete(void *p) noexcept { free(p); }
void operator delete[](void *p) noexcept { free(p); }
void operator delete(void *p, size_t) noexcept { free(p); }
void operator delete[](void *p, size_t) noexcept { free(p); }

namespace std {
  void __throw_bad_alloc() { abort(); }
  void __throw_bad_cast() { abort(); }
  void __throw_bad_typeid() { abort(); }
  void __throw_bad_exception() { abort(); }
  void __throw_bad_function_call() { abort(); }
  void __throw_logic_error(const char *) { abort(); }
  void __throw_domain_error(const char *) { abort(); }
  void __throw_invalid_argument(const char *) { abort(); }
  void __throw_length_error(const char *) { abort(); }
  void __throw_out_of_range(const char *) { abort(); }
  void __throw_out_of_range_fmt(const char *, ...) { abort(); }
  void __throw_runtime_error(const char *) { abort(); }
  void __throw_range_error(const char *) { abort(); }
  void __throw_overflow_error(const char *) { abort(); }
  void __throw_underflow_error(const char *) { abort(); }
  void __throw_system_error(int) { abort(); }
}
#endif

// F5-BEGIN
extern "C" {
  ESP_EVENT_DEFINE_BASE(WIFI_PROV_EVENT);
  void wifi_prov_mgr_deinit(void) {}
}
// F5-END
