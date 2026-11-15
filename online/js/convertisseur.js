// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 xkain <https://github.com/xkain>
// Additional terms under AGPL-3.0 section 7(b): see LICENSE.ADDITIONAL-TERMS
/*
  Convertisseur de sauvegarde : lit un /controller.backup positionnel (générations 1 à 27) et
  produit le format NDJSON (fmt 1) décrit dans la spécification du 2026-11-09.

  LA RÉFÉRENCE DE LECTURE EST src/ConfigFile.cpp : chaque garde de version ci-dessous y a son
  original, dans la fonction de même nom. Toute évolution du format binaire là-bas doit être
  reportée ici. Les transformations de valeurs (bornes, remises à zéro, positions x100 des
  premières générations) sont elles aussi reprises du firmware, pour que le NDJSON produit
  décrive l'état exact qu'une restauration binaire aurait donné.

  Tout s'exécute dans le navigateur : le fichier n'est jamais envoyé nulle part.
*/
(function () {
'use strict';

const SEP = 0x2C, END = 0x0A, QUOTE = 0x22;   // ',' '\n' '"' -- CFG_VALUE_SEP / CFG_REC_END / CFG_TOK_QUOTE
const MAX = { rooms: 32, shades: 32, groups: 16, repeaters: 7, listeners: 14, schedules: 32,
              groupedShades: 32, legacyRemotes: 7, extraRemotes: 8 };
const SCHEDULE_REC_SIZE = 79;                  // readScheduleRecord se cale sur cette constante, pas sur l'en-tête du bloc
const LANG_CODES = ['en', 'fr', 'de', 'es'];   // LANG_CODE_TABLE de ConfigSettings.cpp
const MAX_GENERATION = 27;

/* ------------------------------------------------------------------ Lecteur bas niveau */

class Reader {
  constructor(bytes) { this.b = bytes; this.pos = 0; this.dec = new TextDecoder(); }
  get size() { return this.b.length; }
  // readString() : champ terminé par la première virgule ou fin de ligne (consommée).
  // null = rien à lire (fin de fichier), l'appelant garde alors sa valeur par défaut.
  field() {
    if (this.pos >= this.b.length) return null;
    const start = this.pos;
    let end = -1;
    while (this.pos < this.b.length) {
      const v = this.b[this.pos++];
      if (v === SEP || v === END) { end = this.pos - 1; break; }
    }
    if (end < 0) { this.pos = this.b.length; return null; }  // champ tronqué par la fin de fichier
    return this.dec.decode(this.b.subarray(start, end)).replace(/[\s\u0000]+$/, '');
  }
  // readVarString() : `"` + valeur + `"` + séparateur ; une virgule entre guillemets fait partie
  // de la valeur.
  varField() {
    if (this.pos >= this.b.length) return null;
    let quotes = 0;
    const out = [];
    while (this.pos < this.b.length) {
      const v = this.b[this.pos++];
      if (v === QUOTE) { quotes++; continue; }
      if (v === END) break;
      if (v === SEP && quotes >= 2) break;
      out.push(v);
    }
    return this.dec.decode(new Uint8Array(out)).replace(/[\s\u0000]+$/, '');
  }
  num(def) { const s = this.field(); if (s === null) return def; const n = parseInt(s, 10); return Number.isNaN(n) ? 0 : n; }
  u8(def = 0) { return this.num(def) & 0xFF; }
  i8(def = 0) { const n = this.num(def); return n === def ? n : (n << 24 >> 24); }
  u16(def = 0) { return this.num(def) & 0xFFFF; }
  i16(def = 0) { const n = this.num(def); return n === def ? n : (n << 16 >> 16); }
  u32(def = 0) { const n = this.num(def); return n < 0 ? n >>> 0 : n; }
  float(def = 0) { const s = this.field(); if (s === null) return def; const n = parseFloat(s); return Number.isNaN(n) ? 0 : n; }
  bool(def = false) { const s = this.field(); if (s === null) return def; return /^[tT1]/.test(s); }
  seekEnd() { while (this.pos < this.b.length) { if (this.b[this.pos++] === END) return true; } return false; }
  atRecordEnd() { return this.pos === 0 || this.pos >= this.b.length || this.b[this.pos - 1] === END; }
  peek() { return this.pos < this.b.length ? this.b[this.pos] : -1; }
  // Fin d'enregistrement positionnelle : même resynchronisation que le firmware quand la
  // position ne tombe pas sur taille annoncée.
  sync(start, declaredSize, warnings, what) {
    if (declaredSize > 0 && this.pos !== start + declaredSize) {
      warnings.push({ what, declared: declaredSize, actual: this.pos - start });
      this.seekEnd();
    }
  }
}

/* ------------------------------------------------------------------ En-tête et contrôles */

function readHeader(r) {
  const h = { version: r.u8(1), length: r.u8(0), roomRecordSize: 0, roomRecords: 0,
              shadeRecordSize: 0, shadeRecords: 0, groupRecordSize: 0, groupRecords: 0,
              repeaterRecordSize: 0, repeaterRecords: 0, settingsRecordSize: 0,
              netRecordSize: 0, transRecordSize: 0, serverId: '' };
  if (h.version >= 19) { h.roomRecordSize = r.u16(0); h.roomRecords = r.u8(0); }
  h.shadeRecordSize = h.version >= 13 ? r.u16(0) : r.u8(0);
  h.shadeRecords = r.u8(0);
  if (h.version > 10) {
    h.groupRecordSize = h.version >= 13 ? r.u16(0) : r.u8(0);
    h.groupRecords = r.u8(0);
  }
  if (h.version >= 21) { h.repeaterRecordSize = r.u16(0); h.repeaterRecords = r.u8(0); }
  if (h.version > 13) {
    h.settingsRecordSize = r.u16(0);
    h.netRecordSize = r.u16(0);
    h.transRecordSize = r.u16(0);
    h.serverId = r.field() ?? '';
  }
  return h;
}

// ShadeConfigFile::validate() : mêmes contrôles, mêmes seuils.
function validate(r, h) {
  if (h.version < 1) return 'version';
  if (h.shadeRecordSize < 100) return 'shadeSize';
  if (h.roomRecords > MAX.rooms) return 'roomCount';
  if (h.shadeRecords > MAX.shades) return 'shadeCount';
  if (h.repeaterRecords > MAX.repeaters) return 'repeaterCount';
  if (h.version > 10) {
    if (h.groupRecordSize < 100) return 'groupSize';
    if (h.groupRecords > MAX.groups) return 'groupCount';
  }
  if (r.pos !== h.length) return 'headerLength';
  const startPos = r.pos;
  if (h.version >= 19) {
    for (let i = 0; i < h.roomRecords; i++) {
      const p = r.pos;
      if (!r.seekEnd() || r.pos - p !== h.roomRecordSize) return 'roomScan';
    }
  }
  for (let i = 0; i < h.shadeRecords; i++) {
    const p = r.pos;
    if (!r.seekEnd() || r.pos - p !== h.shadeRecordSize) return 'shadeScan';
  }
  if (h.version > 10) {
    for (let i = 0; i < h.groupRecords; i++) {
      const p = r.pos;
      if (!r.seekEnd() || r.pos - p !== h.groupRecordSize) return 'groupScan';
    }
  }
  if (h.version >= 21) {
    for (let i = 0; i < h.repeaterRecords; i++) r.seekEnd();
  }
  r.pos = startPos;
  return null;
}

/* ------------------------------------------------------------------ Enregistrements */

function readRoom(r, h, warnings) {
  const start = r.pos;
  const room = { roomId: r.u8(0), name: r.field() ?? '' };
  room.sortOrder = r.u8(room.roomId - 1);
  r.sync(start, h.roomRecordSize, warnings, 'room');
  return room;
}

function readShade(r, h, warnings) {
  const v = h.version, start = r.pos;
  const s = {};
  s.shadeId = r.u8(255);
  s.paired = r.bool(false);
  s.shadeType = r.u8(0);
  s.remoteAddress = r.u32(0);
  s.name = r.field() ?? '';
  if (v < 3) s.tiltType = r.bool(false) ? 0 : 1;   // bool historique : vrai = none, faux = tiltmotor
  else s.tiltType = r.u8(0);
  if (v > 6) s.proto = r.u8(0);
  if (v > 1) s.bitLength = r.u8(56);
  s.upTime = r.u32(0);
  s.downTime = r.u32(0);
  const legacyTilt = r.u32(0);                     // durée de tilt unique d'avant la v26
  s.tiltTimeUp = legacyTilt;
  s.tiltTimeDown = legacyTilt;
  if (v > 5) s.stepSize = r.u16(100);
  const linked = [];
  for (let j = 0; j < MAX.legacyRemotes; j++) {
    linked.push(r.u32(0));
    if (v < 5 && j === 4) break;                   // 5 places seulement avant la version 5
  }
  s.lastRollingCode = r.u16(0);
  if (v > 7) s.flags = r.u8(0);
  if (v < 4) s.myPos = r.u8(255);
  else { s.myPos = r.float(-1); s.myTiltPos = r.float(-1); }
  if (s.myPos > 100 || s.myPos < 0) s.myPos = -1;
  if (s.myTiltPos === undefined || s.myTiltPos > 100 || s.myTiltPos < 0) s.myTiltPos = -1;
  s.currentPos = r.float(0);
  s.currentTiltPos = r.float(0);
  if (s.tiltType === 0 || s.shadeType !== 1) { s.myTiltPos = -1; s.currentTiltPos = 0; s.tiltType = 0; }
  if (v < 3) { s.currentPos *= 100; s.currentTiltPos *= 100; }
  if (v >= 9) s.flipCommands = r.bool(false);
  if (v >= 10) s.flipPosition = r.bool(false);
  if (v >= 12) s.repeats = Math.max(r.u8(1), 1);
  s.sortOrder = v >= 13 ? r.u8(s.shadeId - 1) : s.shadeId - 1;
  if (v > 14) { s.gpioUp = r.u8(0); s.gpioDown = r.u8(0); }
  if (v > 15) s.gpioMy = r.u8(0);
  if (v > 16) s.gpioFlags = r.u8(0);
  if (s.tiltType === 3) { s.myPos = 100; s.currentPos = 100; }   // tiltonly
  if (v >= 19) s.roomId = r.u8(0);
  if (v >= 27) {
    s.ledFeedback = r.bool(false);
    s.tiltTimeUp = r.u32(s.tiltTimeUp);
    s.tiltTimeDown = r.u32(s.tiltTimeDown);
    s.tiltFirstOnOpen = r.bool(false);
    s.tiltFirstOnClose = r.bool(false);
    s.slackUp = r.u32(0);
    s.slackDown = r.u32(0);
    s.outputMode = r.u8(0);
    s.pulseTime = r.u16(0);
    s.stateVocab = r.u8(0);
    if (h.shadeRecordSize >= 356) s.setupSteps = r.u8(0);
    if (h.shadeRecordSize >= 444) {
      for (let j = 0; j < MAX.extraRemotes; j++) linked.push(r.u32(0));
    }
    if (h.shadeRecordSize >= 477) s.remoteModel = r.field() ?? '';
  }
  s.linkedRemotes = linked.filter((a) => a !== 0);
  r.sync(start, h.shadeRecordSize, warnings, 'shade');
  return s;
}

function readGroup(r, h, warnings) {
  const v = h.version, start = r.pos;
  const g = {};
  g.groupId = r.u8(255);
  g.groupType = r.u8(0);
  g.remoteAddress = r.u32(0);
  g.name = r.field() ?? '';
  g.proto = r.u8(0);
  g.bitLength = r.u8(56);
  if (v === 23) g.lastRollingCode = r.u16(0);     // place historique du code, déplacé en v24
  const linked = [];
  for (let j = 0; j < MAX.groupedShades; j++) {
    const id = r.u8(0);
    if (id > 0) linked.push(id);                   // compressLinkedShadeIds() : les trous sautent
  }
  g.linkedShades = linked;
  if (v >= 12) g.repeats = Math.max(r.u8(1), 1);
  g.sortOrder = v >= 13 ? r.u8(g.groupId - 1) : g.groupId - 1;
  if (v >= 18) g.flipCommands = r.bool(false);
  if (v >= 19) g.roomId = r.u8(0);
  if (v >= 24) g.lastRollingCode = r.u16(0);
  if (v >= 27) g.ledFeedback = r.bool(false);
  if (v >= 27 && h.groupRecordSize >= 239) g.remoteModel = r.field() ?? '';
  r.sync(start, h.groupRecordSize, warnings, 'group');
  return g;
}

function readRepeaters(r, h, warnings) {
  const addresses = [];
  for (let i = 0; i < h.repeaterRecords; i++) {
    const start = r.pos;
    for (let j = 0; j < MAX.repeaters; j++) {
      const a = r.u32(0);
      if (a !== 0 && !addresses.includes(a)) addresses.push(a);
    }
    r.sync(start, h.repeaterRecordSize, warnings, 'repeater');
  }
  return addresses;
}

function readSettings(r, h) {
  const v = h.version;
  const s = {};
  const fw = r.varField() ?? '';
  s.hostname = r.varField() ?? '';
  s.ntpServer = r.varField() ?? '';
  s.posixZone = r.varField() ?? '';
  // Un fichier 25 de v2.5.1 à v2.6.1 porte déjà la couleur : on la reconnaît à son guillemet.
  if (v >= 26 || (v === 25 && r.peek() === QUOTE)) s.accentColor = r.varField() ?? '';
  s.ssdpBroadcast = r.bool(false);
  if (v >= 20) s.checkForUpdate = r.bool(true);
  if (v >= 25) s.language = LANG_CODES[r.u8(0)] ?? 'en';
  if (v >= 27) {
    s.headerMobileDisplay = r.u8(0);
    s.reverseDashboardColumns = r.bool(false);
    s.defaultMobileTab = r.varField() ?? '';
    s.showRadioActivity = r.bool(false);
    if (!r.atRecordEnd()) s.themeMode = r.u8(0);
    if (!r.atRecordEnd()) s.showMovementIndicator = r.bool(true);
    if (!r.atRecordEnd()) {
      const pin = r.i8(-1);
      s.ledPin = (pin < -1 || pin > 48) ? -1 : pin;
    }
    if (!r.atRecordEnd()) s.ledActiveLow = r.bool(false);
    if (!r.atRecordEnd()) s.ledAddressable = r.bool(false);
    if (!r.atRecordEnd()) { const o = r.u8(0); s.ledColorOrder = o > 1 ? 0 : o; }
    if (!r.atRecordEnd()) {
      const c = r.varField() ?? '';
      if (/^#[0-9a-fA-F]{6}$/.test(c)) s.ledColorActivity = c;
    }
    if (!r.atRecordEnd()) s.ledRfBlink = r.bool(false);
    if (!r.atRecordEnd()) {
      const p = r.varField() ?? '';
      if (/^[a-z0-9-]*$/.test(p)) s.iconPack = p;
    }
    if (!r.atRecordEnd()) s.dashCompact = r.u8(0) & 0x03;
  }
  if (!r.atRecordEnd()) r.seekEnd();
  return { fw, settings: s };
}

function readNet(r, h, warnings) {
  const start = r.pos;
  const net = {};
  net.connType = r.u8(0);
  net.dhcp = r.bool(true);
  net.ip = r.varField() ?? '';
  net.gateway = r.varField() ?? '';
  net.subnet = r.varField() ?? '';
  net.dns1 = r.varField() ?? '';
  net.dns2 = r.varField() ?? '';
  let mqtt = null;
  if (h.version >= 22) {
    mqtt = {};
    r.varField();                                  // MQTT.protocol : constante, lue pour être jetée
    mqtt.hostname = r.varField() ?? '';
    mqtt.port = r.u16(1883);
    mqtt.pubDisco = r.bool(false);
    mqtt.rootTopic = r.varField() ?? '';
    mqtt.discoTopic = r.varField() ?? '';
  }
  net.ethBoardType = r.u8(1);
  net.ethPhyType = r.u8(0);
  net.ethCLKMode = r.u8(0);
  net.ethPhyAddress = r.i8(1);
  net.ethPWRPin = r.i8(1);
  net.ethMDCPin = r.i8(16);
  net.ethMDIOPin = r.i8(23);
  r.sync(start, h.netRecordSize, warnings, 'net');
  return { net, mqtt };
}

function readTrans(r, h, warnings) {
  const start = r.pos, size = h.transRecordSize;
  const t = {};
  t.enabled = r.bool(false);
  t.proto = r.u8(0);
  t.type = r.u8(56);
  t.radioBoardType = h.version < 25 ? 0 : r.u8(0);
  t.SCKPin = r.u8(0);
  t.CSNPin = r.u8(0);
  t.MOSIPin = r.u8(0);
  t.MISOPin = r.u8(0);
  t.TXPin = r.u8(0);
  t.RXPin = r.u8(0);
  t.frequency = r.float(433.42);
  t.rxBandwidth = r.float(0);
  // Déviation présente en 74 (v24) et 78 (v25, premiers v26) ; absente en 68 et à partir de 79.
  if (size >= 74 && size <= 78) r.float(0);
  t.txPower = r.i8(10);
  t.rxFrequency = size >= 79 ? r.float(t.frequency) : t.frequency;
  r.sync(start, size, warnings, 'radio');
  return t;
}

// Blocs à mini-en-tête (version u8, taille u16, nombre u8 : 14 octets écrits) ajoutés en fin de
// fichier : reconnus par reniflage, une sauvegarde antérieure s'arrête simplement avant eux.
function sniffBlock(r, maxVer, maxCount) {
  const pos = r.pos;
  if (r.size < pos + 14) return null;
  const version = r.u8(0), recSize = r.u16(0), recCount = r.u8(255);
  if (version === 0 || version > maxVer || recSize === 0 || recSize > 255 || recCount > maxCount) {
    r.pos = pos;
    return null;
  }
  return { recSize, recCount };
}

function readScheduleBlock(r, warnings) {
  const blk = sniffBlock(r, 1, MAX.schedules);
  if (!blk) return [];
  const out = [];
  for (let i = 0; i < blk.recCount; i++) {
    const start = r.pos;
    const sc = {};
    sc.scheduleId = r.u8(255);
    sc.name = r.field() ?? '';
    sc.dayMask = r.u8(0);
    sc.hour = r.u8(0);
    sc.minute = r.u8(0);
    sc.targetType = r.u8(0);
    sc.targetId = r.u8(255);
    sc.targetPos = r.u8(0);
    sc.targetTilt = r.i8(-1);
    sc.enabled = r.bool(true);
    sc.retries = r.u8(0);
    sc.positionMode = r.u8(0);
    sc.timeRef = r.u8(0);
    sc.sunOffset = r.i16(0);
    r.sync(start, SCHEDULE_REC_SIZE, warnings, 'schedule');
    if (sc.scheduleId !== 255) out.push(sc);
  }
  return out;
}

function readAddressNameBlock(r, h, maxCount, warnings, what) {
  if (h.version < 27) return [];
  const blk = sniffBlock(r, 1, maxCount);
  if (!blk) return [];
  const out = [];
  for (let i = 0; i < blk.recCount; i++) {
    const start = r.pos;
    const address = r.u32(0);
    const name = r.field() ?? '';
    r.sync(start, blk.recSize, warnings, what);
    if (address !== 0) out.push({ address, name });
  }
  return out;
}

/* ------------------------------------------------------------------ Lecture complète */

function parseBackup(bytes) {
  const r = new Reader(bytes);
  const warnings = [];
  const header = readHeader(r);
  if (header.version > MAX_GENERATION) return { error: 'future', header };
  const invalid = validate(r, header);
  if (invalid) return { error: 'invalid', detail: invalid, header };

  const rooms = [], shades = [], groups = [];
  for (let i = 0; i < header.roomRecords; i++) rooms.push(readRoom(r, header, warnings));
  for (let i = 0; i < header.shadeRecords; i++) shades.push(readShade(r, header, warnings));
  for (let i = 0; i < header.groupRecords; i++) groups.push(readGroup(r, header, warnings));
  const repeaters = readRepeaters(r, header, warnings);
  let fw = '', settings = null, net = null, mqtt = null, radio = null;
  if (header.settingsRecordSize > 0) ({ fw, settings } = readSettings(r, header));
  if (header.netRecordSize > 0) ({ net, mqtt } = readNet(r, header, warnings));
  if (header.transRecordSize > 0) radio = readTrans(r, header, warnings);
  const schedules = readScheduleBlock(r, warnings);
  const listeners = readAddressNameBlock(r, header, MAX.listeners, warnings, 'listener');
  const repeaterNames = readAddressNameBlock(r, header, MAX.repeaters, warnings, 'repeaterName');

  return {
    header, fw, settings, net, mqtt, radio, warnings,
    rooms: rooms.filter((x) => x.roomId !== 0),
    shades: shades.filter((x) => x.shadeId !== 255),
    groups: groups.filter((x) => x.groupId !== 255),
    repeaters, schedules, listeners, repeaterNames,
  };
}

/* ------------------------------------------------------------------ Sérialisation NDJSON */

// Arrondit les positions à 5 décimales (l'écriture binaire utilisait %.5f) pour ne pas traîner
// les artefacts float de JS.
function pos5(n) { return n === undefined ? undefined : Math.round(n * 100000) / 100000; }

function toNdjson(p) {
  const lines = [];
  const push = (o) => lines.push(JSON.stringify(o));

  const meta = { rec: 'meta', fmt: 1 };
  if (p.fw) meta.fw = p.fw;
  if (p.header.serverId) meta.serverId = p.header.serverId;
  meta.created = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  meta.convertedFrom = p.header.version;
  push(meta);

  if (p.settings) push({ rec: 'settings', ...p.settings });
  if (p.net) push({ rec: 'net', ...p.net });
  if (p.mqtt) push({ rec: 'mqtt', ...p.mqtt });
  if (p.radio) push({ rec: 'radio', ...p.radio });
  for (const room of p.rooms) push({ rec: 'room', ...room });
  for (const s of p.shades) {
    push({ rec: 'shade', shadeId: s.shadeId, paired: s.paired, shadeType: s.shadeType,
           remoteAddress: s.remoteAddress, name: s.name, tiltType: s.tiltType, proto: s.proto,
           bitLength: s.bitLength, upTime: s.upTime, downTime: s.downTime,
           tiltTimeUp: s.tiltTimeUp, tiltTimeDown: s.tiltTimeDown, stepSize: s.stepSize,
           flags: s.flags, myPos: pos5(s.myPos), myTiltPos: pos5(s.myTiltPos),
           currentPos: pos5(s.currentPos), currentTiltPos: pos5(s.currentTiltPos),
           flipCommands: s.flipCommands, flipPosition: s.flipPosition, repeats: s.repeats,
           sortOrder: s.sortOrder, gpioUp: s.gpioUp, gpioDown: s.gpioDown, gpioMy: s.gpioMy,
           gpioFlags: s.gpioFlags, roomId: s.roomId, ledFeedback: s.ledFeedback,
           tiltFirstOnOpen: s.tiltFirstOnOpen, tiltFirstOnClose: s.tiltFirstOnClose,
           slackUp: s.slackUp, slackDown: s.slackDown, outputMode: s.outputMode,
           pulseTime: s.pulseTime, stateVocab: s.stateVocab, setupSteps: s.setupSteps,
           lastRollingCode: s.lastRollingCode, remoteModel: s.remoteModel || undefined,
           // Tableau TOUJOURS présent, même vide : en NDJSON le fichier fait foi, une clé absente
           // signifierait « conserver les télécommandes du boîtier », pas « aucune ».
           linkedRemotes: s.linkedRemotes });
  }
  for (const g of p.groups) {
    push({ rec: 'group', groupId: g.groupId, groupType: g.groupType,
           remoteAddress: g.remoteAddress, name: g.name, proto: g.proto, bitLength: g.bitLength,
           repeats: g.repeats, sortOrder: g.sortOrder, flipCommands: g.flipCommands,
           roomId: g.roomId, ledFeedback: g.ledFeedback, lastRollingCode: g.lastRollingCode,
           remoteModel: g.remoteModel || undefined,
           linkedShades: g.linkedShades });
  }
  for (const address of p.repeaters) {
    const named = p.repeaterNames.find((n) => n.address === address);
    push({ rec: 'repeater', address, name: named ? named.name : undefined });
  }
  for (const l of p.listeners) push({ rec: 'listener', address: l.address, name: l.name });
  for (const sc of p.schedules) push({ rec: 'schedule', ...sc });
  return lines.join('\n') + '\n';
}

/* ------------------------------------------------------------------ Page */

const $ = (id) => document.getElementById(id);
let dict = {};
let lastResult = null;   // { ndjson, name } une fois une conversion réussie

function tr(key, tokens) {
  let s = dict[key] !== undefined ? dict[key] : key;
  if (tokens) for (const [k, v] of Object.entries(tokens)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function setError(key, tokens) {
  const el = $('convError');
  if (key) { el.textContent = tr(key, tokens); el.hidden = false; }
  else el.hidden = true;
}

function showResult(parsed, name) {
  const box = $('resultBox');
  box.classList.add('active');
  const fwPart = parsed.fw ? tr('conv_src_fw', { fw: parsed.fw }) : '';
  $('convSource').textContent = tr('conv_src_generation', { gen: parsed.header.version, fw: fwPart });
  $('convCounts').textContent = tr('conv_counts', {
    shades: parsed.shades.length, groups: parsed.groups.length, rooms: parsed.rooms.length,
    schedules: parsed.schedules.length, repeaters: parsed.repeaters.length,
    listeners: parsed.listeners.length,
  });
  const warnEl = $('convReadWarnings');
  if (parsed.warnings.length) {
    warnEl.textContent = tr('conv_warn_resync', { count: parsed.warnings.length });
    warnEl.hidden = false;
  } else warnEl.hidden = true;
  $('btnDownload').disabled = false;
  lastResult = { ndjson: toNdjson(parsed), name };
}

function hideResult() {
  $('resultBox').classList.remove('active');
  $('btnDownload').disabled = true;
  lastResult = null;
}

async function onFile(file) {
  setError(null);
  hideResult();
  if (!file) return;
  $('convFileName').textContent = file.name;
  let bytes;
  try { bytes = new Uint8Array(await file.arrayBuffer()); }
  catch { setError('conv_err_read'); return; }
  if (bytes.length === 0) { setError('conv_err_invalid'); return; }
  // Le premier octet discrimine les deux contenus : `{` = déjà NDJSON, un chiffre = positionnel.
  if (bytes[0] === 0x7B) { setError('conv_err_ndjson'); return; }
  let parsed;
  try { parsed = parseBackup(bytes); }
  catch { setError('conv_err_invalid'); return; }
  if (parsed.error === 'future') { setError('conv_err_future', { gen: parsed.header.version }); return; }
  if (parsed.error) { setError('conv_err_invalid'); return; }
  showResult(parsed, file.name);
}

function download() {
  if (!lastResult) return;
  const base = lastResult.name.replace(/\.backup$/i, '');
  const a = document.createElement('a');
  const blob = new Blob([lastResult.ndjson], { type: 'text/plain' });
  a.href = URL.createObjectURL(blob);
  a.download = `${base} (v3).backup`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

document.addEventListener('i18n:changed', () => {
  dict = window.SiteLayout ? SiteLayout.dict : {};
  // Les messages déjà affichés sont retraduits au changement de langue.
  const file = $('convFile');
  if (file && file.files && file.files[0]) onFile(file.files[0]);
});

document.addEventListener('DOMContentLoaded', () => {
  $('convFile').addEventListener('change', (e) => onFile(e.target.files[0]));
  $('btnDownload').addEventListener('click', download);
});

// Exposé pour les tests (console et harnais Node) : la page elle-même n'en a pas besoin.
if (typeof window !== 'undefined') window.ESPBackupConverter = { parseBackup, toNdjson };

})();
