import { google } from "googleapis";

const ENTREPRISES_SHEET = "Entreprises";
const STAFF_SHEET = "Staff";
const PATRONS_SHEET = "Patrons";
const SETTINGS_SHEET = "Settings";

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

export async function ensureSheetsReady() {
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
    })
  ]);
}

export async function getCaLockSettings() {
  await ensureSheetsReady();
  const rows = await readSheet(SETTINGS_SHEET, settingsHeaders);
  const setting = rows.find((row) => row.Key === CA_MANUAL_LOCK_KEY);
  const value = String(setting?.Value || "").trim().toLowerCase();
  return { manualLocked: value === "true" };
}

export async function setCaManualLock(manualLocked) {
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

export async function listEntreprises() {
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

export async function createEntreprise(payload) {
  const ca = Number(payload.chiffreAffaires || 0);
  const now = new Date().toISOString();
  const patrons = await listPatronAccounts();
  const patronId = String(payload.patronId || "").trim();
  const patron = patrons.find((item) => item.id === patronId);
  const entreprise = {
    id: uid("ent"),
    nom: payload.nom,
    proprietaire: payload.proprietaire,
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

export async function updateEntreprise(id, payload) {
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
    proprietaire: payload.proprietaire ?? existing.proprietaire,
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

export async function recalculateEntrepriseTaxes() {
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

export async function removeEntreprise(id) {
  const entreprises = await listEntreprises();
  const existing = entreprises.find((item) => item.id === id);
  if (!existing) return false;
  await deleteRow(ENTREPRISES_SHEET, existing.rowNumber);
  return true;
}

export async function listStaff() {
  const rows = await readSheet(STAFF_SHEET, staffHeaders);
  return rows.map((row) => ({
    id: row.ID,
    username: row.Username,
    passwordHash: row.Password_Hash,
    role: row.Role || "staff",
    rowNumber: row.rowNumber
  }));
}

export async function createStaff({ username, passwordHash, role = "staff" }) {
  const staff = { id: uid("staff"), username, passwordHash, role };
  await appendRow(STAFF_SHEET, [staff.id, staff.username, staff.passwordHash, staff.role]);
  return { id: staff.id, username: staff.username, role: staff.role };
}

export async function updateStaff(id, payload) {
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

export async function removeStaff(id) {
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

export async function listPatrons() {
  return listPatronAccounts();
}

export async function createPatron({ username, passwordHash, discordId = "" }) {
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

export async function updatePatron(id, payload) {
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

export async function removePatron(id) {
  const patrons = await listPatrons();
  const existing = patrons.find((item) => item.id === id);
  if (!existing) return false;
  await deleteRow(PATRONS_SHEET, existing.rowNumber);
  return true;
}
