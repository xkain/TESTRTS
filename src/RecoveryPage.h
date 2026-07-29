#ifndef RECOVERYPAGE_H
#define RECOVERYPAGE_H

#include <Arduino.h>

// Page du mode Récupération, embarquée dans le binaire et STRICTEMENT autonome : ni requête
// externe, ni fichier LittleFS, ni /lang. C'est la condition pour qu'elle s'affiche même quand le
// filesystem est corrompu -- c'est-à-dire précisément dans le cas qu'on cherche à réparer.
//
// Elle recopie donc à la main le strict nécessaire de la charte (variables de couleur, carte
// modale, switch 50x24, boutons) plutôt que de dépendre de base.css. Les libellés FR/EN vivent
// dans un mini-dictionnaire inline, choisi via navigator.language.
static const char RECOVERY_PAGE[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ESPSomfy-RTS</title>
<style>
:root{
 --bg:#010101;--card:#131315;--row:#1c1e21;--txt:#e4e3e8;--txt2:#9a999e;
 --accent:#1a5fb4;--danger:#f44336;--border:#333;--switch:#434243;
}
@media (prefers-color-scheme: light){
 :root{--bg:#f8fafd;--card:#fcfcfd;--row:#fbfbfb;--txt:#000;--txt2:#4a4a4a;--border:#d1d2d4;--switch:#c7c7c7;}
}
*{box-sizing:border-box}
body{margin:0;padding:16px;background:var(--bg);color:var(--txt);
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
 display:flex;justify-content:center;align-items:flex-start;min-height:100vh}
.card{width:100%;max-width:640px;background:var(--card);border:1px solid var(--border);
 border-radius:25px;box-shadow:0 4px 6px rgba(0,0,0,.1);padding:24px;}
.hdr{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:20px}
.ico{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;
 margin-bottom:12px;border:1px solid var(--danger);color:var(--danger);font-size:30px}
h3{font-size:1.4em;font-weight:600;margin:0}
.sub{color:var(--txt2);font-size:.9em;line-height:1.5;margin:10px 0 0;max-width:420px}
.row{display:flex;align-items:center;justify-content:space-between;gap:14px;
 background:var(--row);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:10px}
.lbl{font-size:.95em}
.dsc{color:var(--txt2);font-size:.8em;line-height:1.4;margin-top:3px}
.warn{color:var(--danger);font-size:.8em;line-height:1.4;margin-top:6px;font-weight:600}
.sw{display:inline-block;position:relative;width:50px;min-width:50px;height:24px;border-radius:9px;
 border:1px solid var(--switch);background:var(--bg);cursor:pointer}
.sw input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:2}
.sw i{width:25px;height:24px;background:var(--switch);border-radius:8px;position:absolute;top:50%;
 left:-1px;transform:translateY(-50%);transition:all 200ms cubic-bezier(.4,0,.2,1)}
.sw input:checked+i{height:22px;background:var(--accent);transform:translate(24px,-50%)}
.sw.dgr input:checked+i{background:var(--danger)}
.sep{height:1px;background:var(--border);margin:18px 0}
.grp{color:var(--txt2);font-size:.78em;text-transform:uppercase;letter-spacing:.5px;margin:0 0 8px 4px}
.btns{display:flex;gap:12px;margin-top:22px}
button{flex:1;padding:13px;border-radius:10px;font-size:.95em;font-weight:600;cursor:pointer;
 border:2px solid transparent;background:var(--accent);color:#fff}
button.line{background:transparent;border-color:var(--border);color:var(--txt)}
button.dgr{background:var(--danger)}
button:disabled{opacity:.5;cursor:not-allowed}
#done{display:none;text-align:center;color:var(--txt2);font-size:.9em;margin-top:16px;line-height:1.5}
</style></head><body>
<div class="card">
 <div class="hdr">
  <div class="ico">&#9888;</div>
  <h3 id="t-title"></h3>
  <p class="sub" id="t-intro"></p>
 </div>
 <div id="form">
  <p class="grp" id="t-gSel"></p>
  <div class="row"><div><div class="lbl" id="t-net"></div><div class="dsc" id="t-netD"></div></div>
   <label class="sw"><input type="checkbox" id="c-network"><i></i></label></div>
  <div class="row"><div><div class="lbl" id="t-sec"></div><div class="dsc" id="t-secD"></div></div>
   <label class="sw"><input type="checkbox" id="c-security"><i></i></label></div>
  <div class="row"><div><div class="lbl" id="t-sys"></div><div class="dsc" id="t-sysD"></div></div>
   <label class="sw"><input type="checkbox" id="c-system"><i></i></label></div>
  <div class="row"><div><div class="lbl" id="t-shd"></div><div class="dsc" id="t-shdD"></div></div>
   <label class="sw"><input type="checkbox" id="c-shades"><i></i></label></div>
  <div class="row"><div><div class="lbl" id="t-sch"></div><div class="dsc" id="t-schD"></div></div>
   <label class="sw"><input type="checkbox" id="c-schedules"><i></i></label></div>
  <div class="row"><div><div class="lbl" id="t-lng"></div><div class="dsc" id="t-lngD"></div></div>
   <label class="sw"><input type="checkbox" id="c-langs"><i></i></label></div>

  <div class="sep"></div>
  <p class="grp" id="t-gCrit"></p>
  <div class="row"><div><div class="lbl" id="t-cod"></div><div class="warn" id="t-codW"></div></div>
   <label class="sw dgr"><input type="checkbox" id="c-codes"><i></i></label></div>
  <div class="row"><div><div class="lbl" id="t-fac"></div><div class="warn" id="t-facW"></div></div>
   <label class="sw dgr"><input type="checkbox" id="c-factory"><i></i></label></div>
  <div class="row"><div><div class="lbl" id="t-fs"></div><div class="warn" id="t-fsW"></div></div>
   <label class="sw dgr"><input type="checkbox" id="c-formatfs"><i></i></label></div>

  <div class="sep"></div>
  <p class="grp" id="t-gDiag"></p>
  <div class="row"><div><div class="lbl" id="t-dbg"></div><div class="dsc" id="t-dbgD"></div></div>
   <label class="sw"><input type="checkbox" id="cbEnableDebugLogs"><i></i></label></div>

  <div class="btns">
   <button class="line" id="btnCancel"></button>
   <button id="btnApply"></button>
  </div>
 </div>
 <div id="done"></div>
</div>
<script>
var L={
fr:{title:"Mode Récupération",
 intro:"Sélectionnez ce que vous souhaitez réinitialiser. Rien n'est effacé tant que vous n'avez pas appliqué.",
 gSel:"Réinitialisation ciblée",gCrit:"Opérations critiques",gDiag:"Diagnostic",
 net:"Réseau",netD:"Wi-Fi, adresse IP, Ethernet.",
 sec:"Sécurité",secD:"Code PIN, identifiant et mot de passe.",
 sys:"Configuration système",sysD:"Nom d'hôte, MQTT, NTP, préférences d'affichage.",
 shd:"Volets, groupes et pièces",shdD:"Supprime les équipements déclarés et leur organisation.",
 sch:"Plannings",schD:"Supprime toutes les programmations horaires.",
 lng:"Packs de langue",lngD:"Supprime les langues téléchargées (la langue d'origine est conservée).",
 cod:"Codes tournants Somfy",
 codW:"ATTENTION : efface les compteurs de codes tournants. Vos moteurs déjà appairés IGNORERONT l'appareil tant qu'ils n'auront pas été ré-appairés physiquement.",
 fac:"Réinitialisation d'usine complète",
 facW:"Efface TOUTE la configuration, codes tournants compris. Équivalent d'un appareil neuf.",
 fs:"Formater le système de fichiers",
 fsW:"À n'utiliser qu'en cas de filesystem corrompu. L'interface web devra être réinstallée par mise à jour OTA.",
 dbg:"Journaux de débogage",dbgD:"Active les traces détaillées sur le port série.",
 cancel:"Annuler et redémarrer",apply:"Appliquer et redémarrer",
 working:"Application en cours…",
 rebooting:"Modifications appliquées. L'appareil redémarre — vous pouvez fermer cette page.",
 cancelled:"Aucune modification. L'appareil redémarre — vous pouvez fermer cette page.",
 failed:"Échec de l'opération. L'appareil n'a pas été modifié."},
en:{title:"Recovery Mode",
 intro:"Select what you want to reset. Nothing is erased until you apply.",
 gSel:"Targeted reset",gCrit:"Critical operations",gDiag:"Diagnostics",
 net:"Network",netD:"Wi-Fi, IP address, Ethernet.",
 sec:"Security",secD:"PIN code, username and password.",
 sys:"System configuration",sysD:"Hostname, MQTT, NTP, display preferences.",
 shd:"Shades, groups and rooms",shdD:"Removes declared devices and their organisation.",
 sch:"Schedules",schD:"Removes every time-based rule.",
 lng:"Language packs",lngD:"Removes downloaded languages (the built-in one is kept).",
 cod:"Somfy rolling codes",
 codW:"WARNING: erases the rolling code counters. Motors already paired will IGNORE this device until they are physically paired again.",
 fac:"Full factory reset",
 facW:"Erases ALL configuration, rolling codes included. Equivalent to a brand new device.",
 fs:"Format the file system",
 fsW:"Only for a corrupted filesystem. The web interface will have to be reinstalled through an OTA update.",
 dbg:"Debug logs",dbgD:"Enables detailed traces on the serial port.",
 cancel:"Cancel and reboot",apply:"Apply and reboot",
 working:"Applying…",
 rebooting:"Changes applied. The device is rebooting - you may close this page.",
 cancelled:"No change made. The device is rebooting - you may close this page.",
 failed:"Operation failed. The device was not modified."}};
var t=(navigator.language||"en").toLowerCase().indexOf("fr")===0?L.fr:L.en;
document.documentElement.lang=t===L.fr?"fr":"en";
for(var k in t){var e=document.getElementById("t-"+k);if(e)e.textContent=t[k];}
document.getElementById("btnCancel").textContent=t.cancel;
document.getElementById("btnApply").textContent=t.apply;
function finish(msg){
 document.getElementById("form").style.display="none";
 var d=document.getElementById("done");d.textContent=msg;d.style.display="block";
}
function send(url,body,okMsg){
 document.getElementById("btnApply").disabled=true;
 document.getElementById("btnCancel").disabled=true;
 var x=new XMLHttpRequest();
 x.open("POST",url,true);
 x.setRequestHeader("Content-Type","application/json");
 x.onload=function(){finish(x.status===200?okMsg:t.failed);};
 x.onerror=function(){finish(t.failed);};
 x.send(body);
}
document.getElementById("btnCancel").onclick=function(){send("/recoveryCancel","{}",t.cancelled);};
document.getElementById("btnApply").onclick=function(){
 var ids=["network","security","system","shades","schedules","langs","codes","factory","formatfs"];
 var o={};for(var i=0;i<ids.length;i++)o[ids[i]]=document.getElementById("c-"+ids[i]).checked;
 o.debug=document.getElementById("cbEnableDebugLogs").checked;
 finish(t.working);
 send("/recoveryApply",JSON.stringify(o),t.rebooting);
};
</script></body></html>)rawliteral";

#endif
