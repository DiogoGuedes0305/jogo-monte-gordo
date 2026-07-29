// Battle for Monte Gordo — backend Apps Script
// Vinculado à Google Sheet "Battle for Monte Gordo" (separadores: Locais, Equipas, Desafios)

var SHEET_LOCAIS = 'Locais';
var SHEET_EQUIPAS = 'Equipas';
var SHEET_DESAFIOS = 'Desafios';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Battle for Monte Gordo')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error('Separador não encontrado: ' + name);
  return sheet;
}

function sheetToObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 1) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = values.slice(1).filter(function (r) {
    return r.some(function (c) { return c !== '' && c !== null; });
  });
  return rows.map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function findRowById_(sheet, id) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) return i + 1; // número de linha (1-indexed)
  }
  return -1;
}

// Converte texto (incl. acentos/ç em portugues) num slug ASCII simples,
// decompondo cada caractere e mantendo so a letra base (sem acento).
function slugify_(text) {
  var lower = String(text).toLowerCase();
  var s = '';
  for (var i = 0; i < lower.length; i++) {
    var ch = lower.charAt(i);
    var code = ch.charCodeAt(0);
    if (code < 128) {
      s += ch;
    } else {
      var baseCode = ch.normalize('NFD').charCodeAt(0);
      s += baseCode < 128 ? String.fromCharCode(baseCode) : '-';
    }
  }
  return s.replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'item';
}

function uniqueId_(sheet, base) {
  var id = base;
  var n = 2;
  while (findRowById_(sheet, id) !== -1) {
    id = base + '-' + n;
    n++;
  }
  return id;
}

function getState() {
  return {
    locations: sheetToObjects_(getSheet_(SHEET_LOCAIS)),
    teams: sheetToObjects_(getSheet_(SHEET_EQUIPAS)),
    challenges: sheetToObjects_(getSheet_(SHEET_DESAFIOS))
  };
}

function conquerLocation(locationId, teamId) {
  var sheet = getSheet_(SHEET_LOCAIS);
  var row = findRowById_(sheet, locationId);
  if (row === -1) throw new Error('Local não encontrado.');
  sheet.getRange(row, 5).setValue(teamId);
  sheet.getRange(row, 6).setValue(new Date());
  return getState();
}

function reassignLocation(locationId) {
  var sheet = getSheet_(SHEET_LOCAIS);
  var row = findRowById_(sheet, locationId);
  if (row === -1) throw new Error('Local não encontrado.');
  sheet.getRange(row, 5).setValue('');
  sheet.getRange(row, 6).setValue('');
  return getState();
}

function addTeam(name, color) {
  name = String(name || '').trim();
  if (!name) throw new Error('O nome da equipa não pode ficar vazio.');
  var sheet = getSheet_(SHEET_EQUIPAS);
  var id = uniqueId_(sheet, slugify_(name));
  sheet.appendRow([id, name, color || '#A8792A']);
  return getState();
}

function removeTeam(id) {
  var sheet = getSheet_(SHEET_EQUIPAS);
  var row = findRowById_(sheet, id);
  if (row !== -1) sheet.deleteRow(row);

  // Liberta os locais que essa equipa tinha conquistado
  var locSheet = getSheet_(SHEET_LOCAIS);
  var values = locSheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][4]) === String(id)) {
      locSheet.getRange(i + 1, 5).setValue('');
      locSheet.getRange(i + 1, 6).setValue('');
    }
  }
  return getState();
}

function addLocation(name, points, icon) {
  name = String(name || '').trim();
  if (!name) throw new Error('O nome do local não pode ficar vazio.');
  var sheet = getSheet_(SHEET_LOCAIS);
  var id = uniqueId_(sheet, slugify_(name));
  sheet.appendRow([id, name, Number(points) || 0, icon || 'icon-casino', '', '']);
  return getState();
}

function removeLocation(id) {
  var sheet = getSheet_(SHEET_LOCAIS);
  var row = findRowById_(sheet, id);
  if (row !== -1) sheet.deleteRow(row);

  // Apaga desafios associados a este local
  var chSheet = getSheet_(SHEET_DESAFIOS);
  var values = chSheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][1]) === String(id)) chSheet.deleteRow(i + 1);
  }
  return getState();
}

function addChallenge(locationId, description) {
  description = String(description || '').trim();
  if (!description) throw new Error('A descrição do desafio não pode ficar vazia.');
  var sheet = getSheet_(SHEET_DESAFIOS);
  var id = uniqueId_(sheet, slugify_(locationId) + '-desafio');
  sheet.appendRow([id, locationId, description]);
  return getState();
}

function removeChallenge(id) {
  var sheet = getSheet_(SHEET_DESAFIOS);
  var row = findRowById_(sheet, id);
  if (row !== -1) sheet.deleteRow(row);
  return getState();
}
