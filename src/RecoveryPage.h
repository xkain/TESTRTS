// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
#ifndef RECOVERYPAGE_H
#define RECOVERYPAGE_H

#include <Arduino.h>

// Page du mode Récupération, embarquée dans le binaire et STRICTEMENT autonome : ni requête
// externe, ni fichier LittleFS, ni /lang. C'est la condition pour qu'elle s'affiche même quand le
// filesystem est corrompu -- c'est-à-dire précisément dans le cas qu'on cherche à réparer.
//
// Elle recopie donc à la main le strict nécessaire de la charte (variables de couleur, tuiles,
// switch 50x24, boutons) plutôt que de dépendre de base.css. Les libellés FR/EN vivent
// dans un mini-dictionnaire inline, choisi via navigator.language.
static const char RECOVERY_PAGE[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ESPSomfy-RTS</title>
<style>
:root{--bg:#0a0a0a;--card:#0f0f0f;--row:#1c1e21;--txt:#e4e3e8;--txt2:#9a999e;--accent:#1a5fb4;--danger:#f44336;--warn:#f69300;--border:#2a2a2c;--switch:#434243}
@media (prefers-color-scheme: light){:root{--bg:#f8fafd;--card:#fff;--row:#fbfbfb;--txt:#000;--txt2:#4a4a4a;--border:#d1d2d4;--switch:#c7c7c7}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:15px}
svg{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.top{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border);background:var(--card)}
.top b{font-size:1.05em;font-weight:600;white-space:nowrap}
.logo{width:30px;height:30px;border-radius:9px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center}
.logo svg{width:18px;height:18px}
.badge{margin-left:auto;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:.78em;font-weight:600;white-space:nowrap;color:var(--warn);background:color-mix(in srgb,var(--warn),transparent 88%);border:1px solid color-mix(in srgb,var(--warn),transparent 70%)}
.badge svg{width:14px;height:14px}
main{max-width:980px;margin:0 auto;padding:20px 16px calc(96px + env(safe-area-inset-bottom))}
.intro{color:var(--txt2);line-height:1.5;margin:0 0 18px;font-size:.92em}
.grid{display:grid;gap:15px}
.tile{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:20px 18px 18px;display:flex;flex-direction:column;gap:12px;box-shadow:0 4px 6px rgba(0,0,0,.1)}
.tt{display:flex;align-items:center;gap:10px;font-size:1.08em;font-weight:500;margin:0}
.tt svg{color:var(--accent)}
.tile.dgr{border-color:color-mix(in srgb,var(--danger),transparent 70%)}
.tile.dgr .tt svg,.note svg{color:var(--danger)}
.row{display:flex;align-items:center;justify-content:space-between;gap:14px;background:var(--row);border:1px solid var(--border);border-radius:8px;padding:11px 12px;cursor:pointer}
.row.on{border-color:color-mix(in srgb,var(--accent),transparent 50%);background:color-mix(in srgb,var(--accent),transparent 88%)}
.row.dgr.on{border-color:color-mix(in srgb,var(--danger),transparent 70%);background:color-mix(in srgb,var(--danger),transparent 90%)}
.row.lock{opacity:.55;cursor:not-allowed}
.lbl{font-size:.95em}
.dsc{color:var(--txt2);font-size:.8em;line-height:1.4;margin-top:3px}
.warn{color:var(--danger);font-size:.8em;line-height:1.4;margin-top:4px}
.sw{position:relative;width:50px;min-width:50px;height:24px;border-radius:9px;border:1px solid var(--switch);background:var(--bg)}
.sw i{position:absolute;top:50%;left:-1px;width:25px;height:24px;border-radius:8px;background:var(--switch);transform:translateY(-50%);transition:all .2s}
.on .sw i{height:22px;background:var(--accent);transform:translate(24px,-50%)}
.dgr.on .sw i{background:var(--danger)}
.drop{display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px;border:1.5px dashed var(--border);border-radius:8px;color:var(--txt2);font-size:.85em;text-align:center;cursor:pointer;word-break:break-all}
.drop svg{width:26px;height:26px;color:var(--accent)}
.drop b{color:var(--txt);font-weight:500}
.drop input{display:none}
.note{display:flex;gap:8px;font-size:.8em;line-height:1.45;color:var(--txt2)}
.note svg{width:16px;height:16px;margin-top:1px}
.pbar{display:none;height:6px;border-radius:3px;background:var(--border);overflow:hidden}
.pbar.on{display:block}
.pbar i{display:block;height:100%;width:0;background:var(--accent);transition:width .15s linear}
button{padding:12px 18px;border-radius:10px;font-size:.95em;font-weight:600;cursor:pointer;border:2px solid transparent;background:var(--accent);color:#fff;font-family:inherit}
button.line{background:transparent;border-color:var(--border);color:var(--txt)}
button.dgr{background:var(--danger)}
button:disabled{opacity:.45;cursor:not-allowed}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:10;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--card);border-top:1px solid var(--border);box-shadow:0 -5px 15px rgba(0,0,0,.2)}
.bar div{max-width:980px;margin:0 auto;display:flex;align-items:center;gap:12px}
#cnt{flex:1;min-width:0;color:var(--txt2);font-size:.85em}
#cnt b{color:var(--txt)}
#done{display:none;text-align:center;color:var(--txt2);line-height:1.5}
@media (min-width:768px){.grid{grid-template-columns:1fr 1fr;align-items:start}}
@media (max-width:420px){.top{padding:12px 16px}.badge span{display:none}#cnt{display:none}.bar button{flex:1}}
</style></head><body>
<svg style="display:none">
<symbol id="i-net" viewBox="0 0 24 24"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r=".8"/></symbol>
<symbol id="i-rad" viewBox="0 0 24 24"><path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4"/><circle cx="12" cy="12" r="1.5"/></symbol>
<symbol id="i-som" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M3 12h18M3 16h18"/></symbol>
<symbol id="i-sys" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></symbol>
<symbol id="i-web" viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></symbol>
<symbol id="i-wrn" viewBox="0 0 24 24"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/></symbol>
<symbol id="i-life" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M14.8 9.2l3.6-3.6M5.6 18.4l3.6-3.6"/></symbol>
</svg>
<div class="top"><div class="logo"><svg><use href="#i-life"/></svg></div><b>ESPSomfy-RTS</b>
<span class="badge"><svg><use href="#i-wrn"/></svg><span id="t-mode"></span><i id="t-rec" style="font-style:normal"></i></span></div>
<main>
<div id="form">
<p class="intro" id="t-intro"></p>
<div class="grid">
<section class="tile"><h3 class="tt"><svg><use href="#i-net"/></svg><span id="t-gNet"></span></h3><div class="rows" data-k="network,security"></div></section>
<section class="tile"><h3 class="tt"><svg><use href="#i-rad"/></svg><span id="t-gRad"></span></h3><div class="rows" data-k="radio"></div></section>
<section class="tile"><h3 class="tt"><svg><use href="#i-som"/></svg><span id="t-gSom"></span></h3><div class="rows" data-k="shades,schedules,codes"></div></section>
<section class="tile"><h3 class="tt"><svg><use href="#i-sys"/></svg><span id="t-gSys"></span></h3><div class="rows" data-k="system,langs,debug"></div></section>
<section class="tile"><h3 class="tt"><svg><use href="#i-web"/></svg><span id="t-gWeb"></span></h3>
<label class="drop"><svg><use href="#i-web"/></svg><b id="fsName"></b><span id="t-fsHint"></span><input type="file" id="fsFile" accept=".bin"></label>
<div class="pbar" id="fsBar"><i></i></div>
<div class="dsc" id="fsState"></div>
<div class="note"><svg><use href="#i-wrn"/></svg><span id="t-fsNote"></span></div>
<button class="line" id="btnUploadFS"></button></section>
<section class="tile dgr"><h3 class="tt"><svg><use href="#i-wrn"/></svg><span id="t-gCrit"></span></h3><div class="rows" data-k="factory"></div></section>
</div></div>
<section class="tile" id="done"></section>
</main>
<div class="bar" id="bar"><div><span id="cnt"></span><button class="line" id="btnCancel"></button><button id="btnApply"></button></div></div>
<script>
var L={
fr:{mode:"Mode ",rec:"Récupération",
 intro:"L'appareil a démarré en mode Récupération. Cochez ce que vous voulez réinitialiser : rien n'est effacé avant d'appliquer.",
 gNet:"Réseau",gRad:"Radio",gSom:"Somfy",gSys:"Système",gWeb:"Restaurer l'interface Web",gCrit:"Zone critique",
 network:["Réseau","Wi-Fi, adresse IP, Ethernet."],
 security:["Sécurité","Code PIN, identifiant et mot de passe."],
 radio:["Réglages radio","Module, broches, fréquence, puissance."],
 shades:["Équipements, groupes et pièces","Supprime les équipements déclarés et leur organisation."],
 schedules:["Plannings","Supprime toutes les programmations horaires."],
 codes:["Codes tournants Somfy",null,"Les moteurs déjà appairés ignoreront l'appareil jusqu'à un nouvel appairage physique."],
 system:["Configuration système","Nom d'hôte, MQTT, NTP, affichage, LED."],
 langs:["Packs de langue","Supprime les langues téléchargées, la langue d'origine reste."],
 debug:["Journaux de débogage","Traces détaillées sur le port série."],
 factory:["Réinitialisation d'usine",null,"Efface TOUTE la configuration, codes tournants compris."],
 schL:"Inclus : un planning ne survit pas à l'équipement ou au groupe auquel il est lié.",
 fsPick:"Choisir filesystem.bin",fsHint:"le fichier officiel de la version installée",
 fsNote:"Réseau, sécurité, radio, MQTT et codes tournants sont conservés. Équipements, groupes, pièces et plannings sont remplacés : prévoyez une sauvegarde à restaurer.",
 fsBtn:"Téléverser et restaurer",fsNoFile:"Sélectionnez d'abord un fichier filesystem.bin.",
 fsSending:"Téléversement…",fsWriting:"Écriture en flash puis redémarrage…",
 fsOk:"Interface restaurée. L'appareil redémarre, reconnectez-vous à votre réseau habituel.",
 fsErr:"Le téléversement a échoué. L'appareil n'a pas été modifié.",
 none:"Aucune sélection : <b>Redémarrer</b> quitte sans rien effacer.",
 n1:"élément à réinitialiser",nN:"éléments à réinitialiser",
 cancel:"Annuler",restart:"Redémarrer",apply:"Réinitialiser et redémarrer",
 working:"Application en cours…",
 rebooting:"Modifications appliquées. L'appareil redémarre, vous pouvez fermer cette page.",
 cancelled:"Aucune modification. L'appareil redémarre, vous pouvez fermer cette page.",
 failed:"Échec de l'opération. L'appareil n'a pas été modifié."},
en:{mode:"",rec:"Recovery mode",
 intro:"The device started in Recovery mode. Select what you want to reset: nothing is erased until you apply.",
 gNet:"Network",gRad:"Radio",gSom:"Somfy",gSys:"System",gWeb:"Restore the web interface",gCrit:"Danger zone",
 network:["Network","Wi-Fi, IP address, Ethernet."],
 security:["Security","PIN code, username and password."],
 radio:["Radio settings","Module, pins, frequency, power."],
 shades:["Devices, groups and rooms","Removes declared devices and their organisation."],
 schedules:["Schedules","Removes every time-based rule."],
 codes:["Somfy rolling codes",null,"Motors already paired will ignore this device until they are physically paired again."],
 system:["System configuration","Hostname, MQTT, NTP, display, LED."],
 langs:["Language packs","Removes downloaded languages, the built-in one is kept."],
 debug:["Debug logs","Detailed traces on the serial port."],
 factory:["Factory reset",null,"Erases ALL configuration, rolling codes included."],
 schL:"Included: a schedule does not outlive the device or group it is bound to.",
 fsPick:"Choose filesystem.bin",fsHint:"the official file for the installed version",
 fsNote:"Network, security, radio, MQTT and rolling codes are kept. Devices, groups, rooms and schedules are replaced: have a backup ready to restore.",
 fsBtn:"Upload and restore",fsNoFile:"Please select a filesystem.bin file first.",
 fsSending:"Uploading…",fsWriting:"Writing to flash, then rebooting…",
 fsOk:"Interface restored. The device is rebooting, reconnect to your usual network.",
 fsErr:"Upload failed. The device was not modified.",
 none:"Nothing selected: <b>Restart</b> leaves without erasing anything.",
 n1:"item to reset",nN:"items to reset",
 cancel:"Cancel",restart:"Restart",apply:"Reset and restart",
 working:"Applying…",
 rebooting:"Changes applied. The device is rebooting, you may close this page.",
 cancelled:"No change made. The device is rebooting, you may close this page.",
 failed:"Operation failed. The device was not modified."}};
var t=(navigator.language||"en").toLowerCase().indexOf("fr")===0?L.fr:L.en;
document.documentElement.lang=t===L.fr?"fr":"en";
function $(i){return document.getElementById(i);}
for(var k in t){var e=$("t-"+k);if(e)e.textContent=t[k];}
$("fsName").textContent=t.fsPick;
$("btnUploadFS").textContent=t.fsBtn;
$("btnCancel").textContent=t.cancel;
var DGR={codes:1,factory:1},sel={},rows={},schWas=false;
document.querySelectorAll(".rows").forEach(function(box){
 box.dataset.k.split(",").forEach(function(k){
  var r=t[k],d=document.createElement("div");
  d.className="row"+(DGR[k]?" dgr":"");
  d.innerHTML="<div><div class=lbl></div>"+(r[1]?"<div class=dsc></div>":"")+(r[2]?"<div class=warn></div>":"")+"</div><div class=sw><i></i></div>";
  d.querySelector(".lbl").textContent=r[0];
  if(r[1])d.querySelector(".dsc").textContent=r[1];
  if(r[2])d.querySelector(".warn").textContent=r[2];
  d.onclick=function(){if(d.classList.contains("lock"))return;if(k==="shades"&&!sel.shades)schWas=!!sel.schedules;set(k,!sel[k]);if(k==="shades"&&!sel.shades)set("schedules",schWas);if(k==="factory"&&!sel[k])for(var j in rows)if(j!=="debug")set(j,false);sync();};
  rows[k]=d;box.appendChild(d);
 });
});
function set(k,v){sel[k]=v;rows[k].classList.toggle("on",v);}
var schD=rows.schedules.querySelector(".dsc");
function sync(){
 var fac=!!sel.factory;
 for(var k in rows)if(k!=="factory"&&k!=="debug"){rows[k].classList.toggle("lock",fac);if(fac)set(k,true);}
 var lk=!fac&&!!sel.shades;
 if(sel.shades)set("schedules",true);
 rows.schedules.classList.toggle("lock",fac||lk);
 schD.textContent=lk?t.schL:t.schedules[1];
 var n=0;for(k in sel)if(sel[k]&&k!=="debug")n++;
 $("cnt").innerHTML=n?"<b>"+n+"</b> "+(n>1?t.nN:t.n1):t.none;
 $("btnApply").textContent=n?t.apply:t.restart;
 $("btnApply").className=sel.codes||fac?"dgr":"";
}
function lockAll(){$("btnApply").disabled=$("btnCancel").disabled=$("btnUploadFS").disabled=true;}
function finish(msg){$("form").style.display="none";$("bar").style.display="none";var d=$("done");d.textContent=msg;d.style.display="block";}
function send(url,body,okMsg){
 lockAll();
 var x=new XMLHttpRequest();
 x.open("POST",url,true);
 x.setRequestHeader("Content-Type","application/json");
 x.onload=function(){finish(x.status===200?okMsg:t.failed);};
 x.onerror=function(){finish(t.failed);};
 x.send(body);
}
$("fsFile").onchange=function(){var f=this.files[0];$("fsName").textContent=f?f.name:t.fsPick;$("fsState").textContent="";};
$("btnUploadFS").onclick=function(){
 var f=$("fsFile").files[0],st=$("fsState");
 if(!f){st.textContent=t.fsNoFile;return;}
 var bar=$("fsBar"),fill=bar.firstElementChild;
 bar.className="pbar on";st.textContent=t.fsSending;
 lockAll();
 var fd=new FormData();fd.append("fs",f,f.name);
 var x=new XMLHttpRequest();
 x.open("POST","/recoveryUploadFS",true);
 x.upload.onprogress=function(e){
  if(!e.lengthComputable)return;
  var p=Math.round(e.loaded/e.total*100);
  fill.style.width=p+"%";
  st.textContent=p>=100?t.fsWriting:t.fsSending+" "+p+"%";
 };
 x.onload=function(){finish(x.status===200?t.fsOk:t.fsErr);};
 x.onerror=function(){finish(t.fsErr);};
 x.send(fd);
};
$("btnCancel").onclick=function(){send("/recoveryCancel","{}",t.cancelled);};
$("btnApply").onclick=function(){
 var o={};for(var k in rows)o[k]=!!sel[k];
 finish(t.working);
 send("/recoveryApply",JSON.stringify(o),t.rebooting);
};
sync();
</script></body></html>)rawliteral";

#endif
