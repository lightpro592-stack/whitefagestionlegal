import { google } from "googleapis";

const ENTREPRISES_SHEET = "Entreprises";
const STAFF_SHEET = "Staff";
const PATRONS_SHEET = "Patrons";

const entrepriseHeaders = [
  "ID",
  "Nom",
  "Proprietaire",
  "Chiffre_Affaires",
  "Taxes_Dues",
  "Derniere_Mise_A_Jour",
  "Discord_ID"
];

const staffHeaders = ["ID", "Username", "Password_Hash", "Role"];
const patronHeaders = ["ID", "Username", "Password_Hash", "Entreprise_ID", "Role"];

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

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      requestBody: { requests }
    });
  }

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
    })
  ]);
}

export async function listEntreprises() {
  const rows = await readSheet(ENTREPRISES_SHEET, entrepriseHeaders);
  return rows.map((row) => {
    const chiffreAffaires = Number(row.Chiffre_Affaires || 0);
    return {
      id: row.ID,
      nom: row.Nom,
      proprietaire: row.Proprietaire,
      chiffreAffaires,
      taxesDues: calculateTaxes(chiffreAffaires),
      derniereMiseAJour: row.Derniere_Mise_A_Jour,
      discordId: row.Discord_ID || "",
      discordUrl: row.Discord_ID ? `https://discord.com/users/${row.Discord_ID}` : "",
      rowNumber: row.rowNumber
    };
  });
}

export async function createEntreprise(payload) {
  const ca = Number(payload.chiffreAffaires || 0);
  const now = new Date().toISOString();
  const entreprise = {
    id: uid("ent"),
    nom: payload.nom,
    proprietaire: payload.proprietaire,
    chiffreAffaires: ca,
    taxesDues: calculateTaxes(ca),
    derniereMiseAJour: now,
    discordId: String(payload.discordId || "").trim()
  };

  await appendRow(ENTREPRISES_SHEET, [
    entreprise.id,
    entreprise.nom,
    entreprise.proprietaire,
    entreprise.chiffreAffaires,
    entreprise.taxesDues,
    entreprise.derniereMiseAJour,
    entreprise.discordId
  ]);

  return entreprise;
}

export async function updateEntreprise(id, payload) {
  const entreprises = await listEntreprises();
  const existing = entreprises.find((item) => item.id === id);
  if (!existing) return null;

  const ca = Number(payload.chiffreAffaires ?? existing.chiffreAffaires);
  const updated = {
    ...existing,
    nom: payload.nom ?? existing.nom,
    proprietaire: payload.proprietaire ?? existing.proprietaire,
    chiffreAffaires: ca,
    taxesDues: calculateTaxes(ca),
    derniereMiseAJour: new Date().toISOString(),
    discordId: payload.discordId !== undefined ? String(payload.discordId || "").trim() : existing.discordId
  };

  await updateRow(ENTREPRISES_SHEET, existing.rowNumber, [
    updated.id,
    updated.nom,
    updated.proprietaire,
    updated.chiffreAffaires,
    updated.taxesDues,
    updated.derniereMiseAJour,
    updated.discordId
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
        row.Discord_ID || ""
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

export async function listPatrons() {
  const rows = await readSheet(PATRONS_SHEET, patronHeaders);
  const entreprises = await listEntreprises();

  return rows.map((row) => {
    const entreprise = entreprises.find((item) => item.id === row.Entreprise_ID);
    return {
      id: row.ID,
      username: row.Username,
      passwordHash: row.Password_Hash,
      entrepriseId: row.Entreprise_ID,
      entrepriseNom: entreprise?.nom || "",
      role: row.Role || "patron",
      rowNumber: row.rowNumber
    };
  });
}

export async function createPatron({ username, passwordHash, entrepriseId }) {
  const patron = {
    id: uid("patron"),
    username,
    passwordHash,
    entrepriseId,
    role: "patron"
  };

  await appendRow(PATRONS_SHEET, [
    patron.id,
    patron.username,
    patron.passwordHash,
    patron.entrepriseId,
    patron.role
  ]);

  return {
    id: patron.id,
    username: patron.username,
    entrepriseId: patron.entrepriseId,
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
    entrepriseId: payload.entrepriseId ?? existing.entrepriseId,
    role: "patron"
  };

  await updateRow(PATRONS_SHEET, existing.rowNumber, [
    updated.id,
    updated.username,
    updated.passwordHash,
    updated.entrepriseId,
    updated.role
  ]);

  return {
    id: updated.id,
    username: updated.username,
    entrepriseId: updated.entrepriseId,
    entrepriseNom: updated.entrepriseNom,
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
