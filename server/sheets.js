import { google } from "googleapis";

const ENTREPRISES_SHEET = "Entreprises";
const STAFF_SHEET = "Staff";
const PATRONS_SHEET = "Patrons";
const SETTINGS_SHEET = "Settings";
const LOGS_SHEET = "Logs";

const entrepriseHeaders = [
  "ID",
  "Nom",
  "Proprietaire",
  "Chiffre_Affaires",
  "Taxes_Dues",
  "Derniere_Mise_A_Jour",
  "Patron_ID"
];

const staffHeaders = ["ID", "Username", "Password_Hash", "Role"];
const patronHeaders = ["ID", "Username", "Password_Hash", "Discord_ID", "Role"];
const settingsHeaders = ["Key", "Value"];
const logHeaders = ["ID", "Date", "Categorie", "Utilisateur", "Action", "Details"];
const CA_MANUAL_LOCK_KEY = "ca_manual_lock";

function normalizePrivateKey(value) {
  if (!value) return "";

  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "\n")
    .trim();
}

function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);

  if (!process.env.GOOGLE_SHEET_ID || !email || !privateKey) {
    throw new Error("Configuration Google Sheets manquante. Vérifie les variables d'environnement.");
  }

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") || !privateKey.includes("-----END PRIVATE KEY-----")) {
    throw new Error("GOOGLE_PRIVATE_KEY est invalide: colle la clé privée complète sans GOOGLE_PRIVATE_KEY= et sans guillemets.");
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return google.sheets({ version: "v4", auth });
}

function toObject(headers, values, rowNumber) {
  return headers.reduce(
    (acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    },
    { rowNumber }
  );
}

function calculateTaxes(chiffreAffaires) {
  const ca = Number(chiffreAffaires || 0);
  return Math.round(ca * 0.15 * 100) / 100;
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readSheet(sheetName, headers) {
  const sheets = getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:Z`
  });

  const rows = response.data.values ?? [];
  if (rows.length === 0) return [];

  return rows.slice(1).map((row, index) => toObject(headers, row, index + 2));
}

async function appendRow(sheetName, row) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

async function updateRow(sheetName, rowNumber, row) {
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${sheetName}!A${rowNumber}:Z${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

async function deleteRow(sheetName, rowNumber) {
  const sheets = getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID
  });
  const sheet = spreadsheet.data.sheets.find((entry) => entry.properties.title === sheetName);

  if (!sheet) throw new Error(`Feuille introuvable: ${sheetName}`);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheet.properties.sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber
            }
          }
        }
      ]
    }
  });
}

async function migrateLegacyPatronAssignments(sheets) {
  const [entreprisesResponse, patronsResponse] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${ENTREPRISES_SHEET}!A:G`
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${PATRONS_SHEET}!A:E`
    })
  ]);

  const entreprisesRows = entreprisesResponse.data.values ?? [];
  const patronsRows = patronsResponse.data.values ?? [];
  if (entreprisesRows.length < 2 || patronsRows.length < 2) return;

  let changedEntreprises = false;
  let changedPatrons = false;
  const entreprisesById = new Map(entreprisesRows.slice(1).map((row) => [row[0], row]));

  for (const patronRow of patronsRows.slice(1)) {
    const patronId = patronRow[0];
    const legacyEntrepriseId = patronRow[3] || "";
    if (!patronId || !legacyEntrepriseId.startsWith("ent_")) continue;

    const entrepriseRow = entreprisesById.get(legacyEntrepriseId);
    if (!entrepriseRow) continue;

    const legacyDiscordId = entrepriseRow[6] || "";
    if (!legacyDiscordId.startsWith("patron_")) {
      patronRow[3] = legacyDiscordId;
      changedPatrons = true;
    }

    entrepriseRow[6] = patronId;
    changedEntreprises = true;
  }

  if (changedEntreprises) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${ENTREPRISES_SHEET}!A1:G${entreprisesRows.length}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: entreprisesRows }
    });
  }

  if (changedPatrons) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${PATRONS_SHEET}!A1:E${patronsRows.length}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: patronsRows }
    });
  }
}

async function googleEnsureSheetsReady() {
  const sheets = getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID
  });
  const titles = spreadsheet.data.sheets.map((sheet) => sheet.properties.title);
  const requests = [];

  if (!titles.includes(ENTREPRISES_SHEET)) {
    requests.push({ addSheet: { properties: { title: ENTREPRISES_SHEET } } });
  }
  if (!titles.includes(STAFF_SHEET)) {
    requests.push({ addSheet: { properties: { title: STAFF_SHEET } } });
  }
  if (!titles.includes(PATRONS_SHEET)) {
    requests.push({ addSheet: { properties: { title: PATRONS_SHEET } } });
  }
  if (!titles.includes(SETTINGS_SHEET)) {
    requests.push({ addSheet: { properties: { title: SETTINGS_SHEET } } });
  }
  if (!titles.includes(LOGS_SHEET)) {
    requests.push({ addSheet: { properties: { title: LOGS_SHEET } } });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      requestBody: { requests }
    });
  }

  await migrateLegacyPatronAssignments(sheets);

  await Promise.all([
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${ENTREPRISES_SHEET}!A1:G1`,
      valueInputOption: "RAW",
      requestBody: { values: [entrepriseHeaders] }
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${STAFF_SHEET}!A1:D1`,
      valueInputOption: "RAW",
      requestBody: { values: [staffHeaders] }
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${PATRONS_SHEET}!A1:E1`,
      valueInputOption: "RAW",
      requestBody: { values: [patronHeaders] }
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${SETTINGS_SHEET}!A1:B1`,
      valueInputOption: "RAW",
      requestBody: { values: [settingsHeaders] }
    }),
    sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: `${LOGS_SHEET}!A1:F1`,
      valueInputOption: "RAW",
      requestBody: { values: [logHeaders] }
    })
  ]);
}

async function googleGetCaLockSettings() {
  await ensureSheetsReady();
  const rows = await readSheet(SETTINGS_SHEET, settingsHeaders);
  const setting = rows.find((row) => row.Key === CA_MANUAL_LOCK_KEY);
  const value = String(setting?.Value || "").trim().toLowerCase();
  return { manualLocked: value === "true" };
}

async function googleSetCaManualLock(manualLocked) {
  await ensureSheetsReady();
  const rows = await readSheet(SETTINGS_SHEET, settingsHeaders);
  const existing = rows.find((row) => row.Key === CA_MANUAL_LOCK_KEY);
  const value = manualLocked ? "true" : "false";

  if (existing) {
    await updateRow(SETTINGS_SHEET, existing.rowNumber, [CA_MANUAL_LOCK_KEY, value]);
  } else {
    await appendRow(SETTINGS_SHEET, [CA_MANUAL_LOCK_KEY, value]);
  }

  return { manualLocked };
}

async function googleListEntreprises() {
  const rows = await readSheet(ENTREPRISES_SHEET, entrepriseHeaders);
  const patrons = await listPatronAccounts();
  return rows.map((row) => {
    const chiffreAffaires = Number(row.Chiffre_Affaires || 0);
    const patron = patrons.find((item) => item.id === row.Patron_ID);
    return {
      id: row.ID,
      nom: row.Nom,
      proprietaire: row.Proprietaire,
      chiffreAffaires,
      taxesDues: calculateTaxes(chiffreAffaires),
      derniereMiseAJour: row.Derniere_Mise_A_Jour,
      patronId: row.Patron_ID || "",
      patronUsername: patron?.username || "",
      patronDiscordId: patron?.discordId || "",
      rowNumber: row.rowNumber
    };
  });
}

async function googleCreateEntreprise(payload) {
  const ca = Number(payload.chiffreAffaires || 0);
  const now = new Date().toISOString();
  const patrons = await listPatronAccounts();
  const patronId = String(payload.patronId || "").trim();
  const patron = patrons.find((item) => item.id === patronId);
  const entreprise = {
    id: uid("ent"),
    nom: payload.nom,
    proprietaire: "",
    chiffreAffaires: ca,
    taxesDues: calculateTaxes(ca),
    derniereMiseAJour: now,
    patronId,
    patronUsername: patron?.username || "",
    patronDiscordId: patron?.discordId || ""
  };

  await appendRow(ENTREPRISES_SHEET, [
    entreprise.id,
    entreprise.nom,
    entreprise.proprietaire,
    entreprise.chiffreAffaires,
    entreprise.taxesDues,
    entreprise.derniereMiseAJour,
    entreprise.patronId
  ]);

  return entreprise;
}

async function googleUpdateEntreprise(id, payload) {
  const entreprises = await listEntreprises();
  const existing = entreprises.find((item) => item.id === id);
  if (!existing) return null;

  const ca = Number(payload.chiffreAffaires ?? existing.chiffreAffaires);
  const patrons = await listPatronAccounts();
  const patronId = payload.patronId !== undefined ? String(payload.patronId || "").trim() : existing.patronId;
  const patron = patrons.find((item) => item.id === patronId);
  const updated = {
    ...existing,
    nom: payload.nom ?? existing.nom,
    proprietaire: existing.proprietaire || "",
    chiffreAffaires: ca,
    taxesDues: calculateTaxes(ca),
    derniereMiseAJour: new Date().toISOString(),
    patronId,
    patronUsername: patron?.username || "",
    patronDiscordId: patron?.discordId || ""
  };

  await updateRow(ENTREPRISES_SHEET, existing.rowNumber, [
    updated.id,
    updated.nom,
    updated.proprietaire,
    updated.chiffreAffaires,
    updated.taxesDues,
    updated.derniereMiseAJour,
    updated.patronId
  ]);

  delete updated.rowNumber;
  return updated;
}

async function googleRecalculateEntrepriseTaxes() {
  const rows = await readSheet(ENTREPRISES_SHEET, entrepriseHeaders);
  let updatedCount = 0;

  for (const row of rows) {
    const chiffreAffaires = Number(row.Chiffre_Affaires || 0);
    const expectedTaxes = calculateTaxes(chiffreAffaires);
    const currentTaxes = Number(row.Taxes_Dues || 0);

    if (Math.abs(currentTaxes - expectedTaxes) > 0.009) {
      await updateRow(ENTREPRISES_SHEET, row.rowNumber, [
        row.ID,
        row.Nom,
        row.Proprietaire,
        chiffreAffaires,
        expectedTaxes,
        row.Derniere_Mise_A_Jour,
        row.Patron_ID || ""
      ]);
      updatedCount += 1;
    }
  }

  return { updatedCount };
}

async function googleRemoveEntreprise(id) {
  const entreprises = await listEntreprises();
  const existing = entreprises.find((item) => item.id === id);
  if (!existing) return false;
  await deleteRow(ENTREPRISES_SHEET, existing.rowNumber);
  return true;
}

async function googleListStaff() {
  const rows = await readSheet(STAFF_SHEET, staffHeaders);
  return rows.map((row) => ({
    id: row.ID,
    username: row.Username,
    passwordHash: row.Password_Hash,
    role: row.Role || "staff",
    rowNumber: row.rowNumber
  }));
}

async function googleCreateStaff({ username, passwordHash, role = "staff" }) {
  const staff = { id: uid("staff"), username, passwordHash, role };
  await appendRow(STAFF_SHEET, [staff.id, staff.username, staff.passwordHash, staff.role]);
  return { id: staff.id, username: staff.username, role: staff.role };
}

async function googleUpdateStaff(id, payload) {
  const staff = await listStaff();
  const existing = staff.find((item) => item.id === id);
  if (!existing) return null;

  const updated = {
    ...existing,
    username: payload.username ?? existing.username,
    passwordHash: payload.passwordHash ?? existing.passwordHash,
    role: payload.role ?? existing.role
  };

  await updateRow(STAFF_SHEET, existing.rowNumber, [
    updated.id,
    updated.username,
    updated.passwordHash,
    updated.role
  ]);

  return { id: updated.id, username: updated.username, role: updated.role };
}

async function googleRemoveStaff(id) {
  const staff = await listStaff();
  const existing = staff.find((item) => item.id === id);
  if (!existing) return false;
  await deleteRow(STAFF_SHEET, existing.rowNumber);
  return true;
}

async function listPatronAccounts() {
  const rows = await readSheet(PATRONS_SHEET, patronHeaders);
  return rows.map((row) => ({
    id: row.ID,
    username: row.Username,
    passwordHash: row.Password_Hash,
    discordId: row.Discord_ID || "",
    discordUrl: row.Discord_ID ? `https://discord.com/users/${row.Discord_ID}` : "",
    role: row.Role || "patron",
    rowNumber: row.rowNumber
  }));
}

async function googleListPatrons() {
  return listPatronAccounts();
}

async function googleCreatePatron({ username, passwordHash, discordId = "" }) {
  const patron = {
    id: uid("patron"),
    username,
    passwordHash,
    discordId: String(discordId || "").trim(),
    role: "patron"
  };

  await appendRow(PATRONS_SHEET, [
    patron.id,
    patron.username,
    patron.passwordHash,
    patron.discordId,
    patron.role
  ]);

  return {
    id: patron.id,
    username: patron.username,
    discordId: patron.discordId,
    role: patron.role
  };
}

async function googleUpdatePatron(id, payload) {
  const patrons = await listPatrons();
  const existing = patrons.find((item) => item.id === id);
  if (!existing) return null;

  const updated = {
    ...existing,
    username: payload.username ?? existing.username,
    passwordHash: payload.passwordHash ?? existing.passwordHash,
    discordId: payload.discordId !== undefined ? String(payload.discordId || "").trim() : existing.discordId,
    role: "patron"
  };

  await updateRow(PATRONS_SHEET, existing.rowNumber, [
    updated.id,
    updated.username,
    updated.passwordHash,
    updated.discordId,
    updated.role
  ]);

  return {
    id: updated.id,
    username: updated.username,
    discordId: updated.discordId,
    discordUrl: updated.discordId ? `https://discord.com/users/${updated.discordId}` : "",
    role: updated.role
  };
}

async function googleRemovePatron(id) {
  const patrons = await listPatrons();
  const existing = patrons.find((item) => item.id === id);
  if (!existing) return false;
  await deleteRow(PATRONS_SHEET, existing.rowNumber);
  return true;
}

function hasGoogleConfig() {
  return Boolean(
    process.env.GOOGLE_SHEET_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}

function getMemoryStore() {
  if (!globalThis.__mysteriaFaStore) {
    globalThis.__mysteriaFaStore = {
      entreprises: [],
      staff: [],
      patrons: [],
      logs: [],
      manualLocked: false
    };
  }
  return globalThis.__mysteriaFaStore;
}

function stripPassword(account) {
  const { passwordHash, rowNumber, ...safe } = account;
  return safe;
}

function mapMemoryEntreprise(item) {
  const store = getMemoryStore();
  const patron = store.patrons.find((entry) => entry.id === item.patronId);
  return {
    ...item,
    taxesDues: calculateTaxes(item.chiffreAffaires),
    patronUsername: patron?.username || "",
    patronDiscordId: patron?.discordId || ""
  };
}

async function memoryEnsureSheetsReady() {
  getMemoryStore();
}

async function memoryGetCaLockSettings() {
  return { manualLocked: getMemoryStore().manualLocked };
}

async function memorySetCaManualLock(manualLocked) {
  const store = getMemoryStore();
  store.manualLocked = Boolean(manualLocked);
  return { manualLocked: store.manualLocked };
}

async function memoryListEntreprises() {
  return getMemoryStore().entreprises.map(mapMemoryEntreprise);
}

async function memoryCreateEntreprise(payload) {
  const entreprise = {
    id: uid("ent"),
    nom: payload.nom,
    proprietaire: "",
    chiffreAffaires: Number(payload.chiffreAffaires || 0),
    taxesDues: calculateTaxes(payload.chiffreAffaires),
    derniereMiseAJour: new Date().toISOString(),
    patronId: String(payload.patronId || "").trim()
  };
  getMemoryStore().entreprises.push(entreprise);
  return mapMemoryEntreprise(entreprise);
}

async function memoryUpdateEntreprise(id, payload) {
  const store = getMemoryStore();
  const index = store.entreprises.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const current = store.entreprises[index];
  const updated = {
    ...current,
    nom: payload.nom ?? current.nom,
    chiffreAffaires: Number(payload.chiffreAffaires ?? current.chiffreAffaires),
    derniereMiseAJour: new Date().toISOString(),
    patronId: payload.patronId !== undefined ? String(payload.patronId || "").trim() : current.patronId
  };
  store.entreprises[index] = updated;
  return mapMemoryEntreprise(updated);
}

async function memoryRecalculateEntrepriseTaxes() {
  return { updatedCount: 0 };
}

async function memoryRemoveEntreprise(id) {
  const store = getMemoryStore();
  const before = store.entreprises.length;
  store.entreprises = store.entreprises.filter((item) => item.id !== id);
  return store.entreprises.length !== before;
}

async function memoryListStaff() {
  return getMemoryStore().staff.map((item) => ({ ...item }));
}

async function memoryCreateStaff({ username, passwordHash, role = "staff" }) {
  const staff = { id: uid("staff"), username, passwordHash, role };
  getMemoryStore().staff.push(staff);
  return stripPassword(staff);
}

async function memoryUpdateStaff(id, payload) {
  const store = getMemoryStore();
  const index = store.staff.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.staff[index] = { ...store.staff[index], ...payload };
  return stripPassword(store.staff[index]);
}

async function memoryRemoveStaff(id) {
  const store = getMemoryStore();
  const before = store.staff.length;
  store.staff = store.staff.filter((item) => item.id !== id);
  return store.staff.length !== before;
}

async function memoryListPatrons() {
  return getMemoryStore().patrons.map((item) => ({
    id: item.id,
    username: item.username,
    passwordHash: item.passwordHash,
    discordId: item.discordId || "",
    discordUrl: item.discordId ? "https://discord.com/users/" + item.discordId : "",
    role: item.role || "patron"
  }));
}

async function memoryCreatePatron({ username, passwordHash, discordId = "" }) {
  const patron = { id: uid("patron"), username, passwordHash, discordId: String(discordId || "").trim(), role: "patron" };
  getMemoryStore().patrons.push(patron);
  return stripPassword(patron);
}

async function memoryUpdatePatron(id, payload) {
  const store = getMemoryStore();
  const index = store.patrons.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.patrons[index] = { ...store.patrons[index], ...payload, role: "patron" };
  const safe = stripPassword(store.patrons[index]);
  return { ...safe, discordUrl: safe.discordId ? "https://discord.com/users/" + safe.discordId : "" };
}

async function memoryRemovePatron(id) {
  const store = getMemoryStore();
  const before = store.patrons.length;
  store.patrons = store.patrons.filter((item) => item.id !== id);
  store.entreprises = store.entreprises.map((item) => item.patronId === id ? { ...item, patronId: "" } : item);
  return store.patrons.length !== before;
}

async function googleListLogs() {
  const rows = await readSheet(LOGS_SHEET, logHeaders);
  return rows.reverse().map((row) => ({
    id: row.ID,
    date: row.Date,
    categorie: row.Categorie,
    utilisateur: row.Utilisateur,
    action: row.Action,
    details: row.Details
  }));
}

async function googleAppendLog({ categorie, utilisateur, action, details = "" }) {
  const log = {
    id: uid("log"),
    date: new Date().toISOString(),
    categorie,
    utilisateur,
    action,
    details: typeof details === "string" ? details : JSON.stringify(details)
  };
  await appendRow(LOGS_SHEET, [log.id, log.date, log.categorie, log.utilisateur, log.action, log.details]);
  return log;
}

async function memoryListLogs() {
  return [...getMemoryStore().logs].reverse();
}

async function memoryAppendLog({ categorie, utilisateur, action, details = "" }) {
  const log = {
    id: uid("log"),
    date: new Date().toISOString(),
    categorie,
    utilisateur,
    action,
    details: typeof details === "string" ? details : JSON.stringify(details)
  };
  getMemoryStore().logs.push(log);
  return log;
}

const choose = (googleFn, memoryFn) => (...args) => hasGoogleConfig() ? googleFn(...args) : memoryFn(...args);

export const ensureSheetsReady = choose(googleEnsureSheetsReady, memoryEnsureSheetsReady);
export const getCaLockSettings = choose(googleGetCaLockSettings, memoryGetCaLockSettings);
export const setCaManualLock = choose(googleSetCaManualLock, memorySetCaManualLock);
export const listEntreprises = choose(googleListEntreprises, memoryListEntreprises);
export const createEntreprise = choose(googleCreateEntreprise, memoryCreateEntreprise);
export const updateEntreprise = choose(googleUpdateEntreprise, memoryUpdateEntreprise);
export const recalculateEntrepriseTaxes = choose(googleRecalculateEntrepriseTaxes, memoryRecalculateEntrepriseTaxes);
export const removeEntreprise = choose(googleRemoveEntreprise, memoryRemoveEntreprise);
export const listStaff = choose(googleListStaff, memoryListStaff);
export const createStaff = choose(googleCreateStaff, memoryCreateStaff);
export const updateStaff = choose(googleUpdateStaff, memoryUpdateStaff);
export const removeStaff = choose(googleRemoveStaff, memoryRemoveStaff);
export const listPatrons = choose(googleListPatrons, memoryListPatrons);
export const createPatron = choose(googleCreatePatron, memoryCreatePatron);
export const updatePatron = choose(googleUpdatePatron, memoryUpdatePatron);
export const removePatron = choose(googleRemovePatron, memoryRemovePatron);

export const listLogs = choose(googleListLogs, memoryListLogs);
export const appendLog = choose(googleAppendLog, memoryAppendLog);
