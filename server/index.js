import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendLog,
  createEntreprise,
  createPatron,
  createStaff,
  ensureSheetsReady,
  getCaLockSettings,
  listEntreprises,
  listLogs,
  listPatrons,
  listStaff,
  recalculateEntrepriseTaxes,
  removeEntreprise,
  removePatron,
  removeStaff,
  updateEntreprise,
  setCaManualLock,
  updatePatron,
  updateStaff
} from "./sheets.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || "mysteria-fa-dev-secret-change-me";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, "../dist");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(distPath));

function logActor(user) {
  return user ? `${user.username} (${user.role})` : "system";
}

async function logAction(user, categorie, action, details = "") {
  await appendLog({
    categorie,
    utilisateur: logActor(user),
    action,
    details
  });
}

function signToken(user) {
  return jwt.sign(user, jwtSecret, { expiresIn: "12h" });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "Authentification requise." });

  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ message: "Session invalide ou expirée." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Accès réservé à l'administration." });
  }
  return next();
}

function requireEnterpriseManager(req, res, next) {
  if (req.user?.role !== "admin" && req.user?.role !== "staff") {
    return res.status(403).json({ message: "Accès réservé au staff." });
  }
  return next();
}

async function ensureSheetsForAdmin() {
  await ensureSheetsReady();
}

async function requireAdminSheets(req, res, next) {
  if (req.user?.role !== "admin") return next();

  try {
    await ensureSheetsForAdmin();
    return next();
  } catch (error) {
    return next(error);
  }
}

function getParisDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function isAutomaticCaLockActive(date = new Date()) {
  const parts = getParisDateParts(date);
  return parts.weekday === "Sun" && Number(parts.hour) >= 19;
}

async function getCaLockStatus() {
  const { manualLocked } = await getCaLockSettings();
  const automaticLocked = isAutomaticCaLockActive();
  return {
    locked: manualLocked || automaticLocked,
    manualLocked,
    automaticLocked
  };
}

function normalizeStaffRole(role) {
  if (role === "admin" || role === "gouverneur") return role;
  return "staff";
}

function sanitizeStaff(staff) {
  return staff.map(({ id, username, role }) => ({ id, username, role }));
}

function sanitizePatrons(patrons) {
  return patrons.map(({ id, username, discordId, discordUrl, role }) => ({
    id,
    username,
    discordId,
    discordUrl,
    role
  }));
}

function validateEntrepriseInput(payload) {
  if (!payload.nom?.trim()) return "Le nom de l'entreprise est obligatoire.";
  if (Number.isNaN(Number(payload.chiffreAffaires))) return "Le chiffre d'affaires doit être un nombre.";
  return null;
}

async function validatePatronAssignment(patronId) {
  if (!patronId) return null;
  const patrons = await listPatrons();
  if (!patrons.some((item) => item.id === patronId)) {
    return "Patron introuvable pour cette entreprise.";
  }
  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "Mysteria FA" });
});

app.post("/api/setup", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    await ensureSheetsReady();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    const adminPasswords = new Set(["mysteria-fa", "mysteriagestionlegal", "whitefagestion"]);
    if (username.toLowerCase() === "admin" && adminPasswords.has(password)) {
      const user = { id: "master-admin", username: "admin", role: "admin" };
      await ensureSheetsForAdmin();
      return res.json({ token: signToken(user), user });
    }

    const staff = await listStaff();
    const account = staff.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (account) {
      const ok = await bcrypt.compare(password, account.passwordHash);
      if (!ok) return res.status(401).json({ message: "Identifiants incorrects." });

      const user = { id: account.id, username: account.username, role: account.role || "staff" };
      if (user.role === "admin") await ensureSheetsForAdmin();
      return res.json({ token: signToken(user), user });
    }

    const patrons = await listPatrons();
    const patron = patrons.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!patron) return res.status(401).json({ message: "Identifiants incorrects." });

    const ok = await bcrypt.compare(password, patron.passwordHash);
    if (!ok) return res.status(401).json({ message: "Identifiants incorrects." });

    const user = {
      id: patron.id,
      username: patron.username,
      role: "patron"
    };
    return res.json({ token: signToken(user), user });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/logs", requireAuth, requireAdmin, requireAdminSheets, async (_req, res, next) => {
  try {
    res.json({ logs: await listLogs() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ca-lock", requireAuth, requireAdminSheets, async (_req, res, next) => {
  try {
    res.json(await getCaLockStatus());
  } catch (error) {
    next(error);
  }
});

app.put("/api/ca-lock", requireAuth, requireAdmin, requireAdminSheets, async (req, res, next) => {
  try {
    const manualLocked = Boolean(req.body.locked);
    await setCaManualLock(manualLocked);
    await logAction(req.user, "ca", manualLocked ? "Blocage CA active" : "Blocage CA desactive");
    res.json(await getCaLockStatus());
  } catch (error) {
    next(error);
  }
});

app.get("/api/entreprises", requireAuth, async (req, res, next) => {
  try {
    const entreprises = await listEntreprises();
    const caLock = await getCaLockStatus();
    if (req.user.role === "patron") {
      return res.json({
        entreprises: entreprises.filter((item) => item.patronId === req.user.id),
        caLock
      });
    }
    res.json({ entreprises, caLock });
  } catch (error) {
    next(error);
  }
});

app.post("/api/entreprises", requireAuth, requireEnterpriseManager, async (req, res, next) => {
  try {
    const message = validateEntrepriseInput(req.body);
    if (message) return res.status(400).json({ message });
    const patronMessage = await validatePatronAssignment(String(req.body.patronId || "").trim());
    if (patronMessage) return res.status(400).json({ message: patronMessage });
    const entreprise = await createEntreprise(req.body);
    await logAction(req.user, "entreprises", "Creation entreprise", `Entreprise: ${entreprise.nom}`);
    res.status(201).json({ entreprise });
  } catch (error) {
    next(error);
  }
});

app.put("/api/entreprises/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === "gouverneur") {
      return res.status(403).json({ message: "Le gouverneur peut uniquement consulter les entreprises." });
    }

    if (req.user.role === "patron") {
      const entreprises = await listEntreprises();
      const entreprise = entreprises.find((item) => item.id === req.params.id);
      if (!entreprise || entreprise.patronId !== req.user.id) {
        return res.status(403).json({ message: "Tu ne peux modifier que ton entreprise." });
      }
      const caLock = await getCaLockStatus();
      if (caLock.locked) {
        return res.status(403).json({ message: "La modification du CA est bloquee pour les patrons." });
      }
      req.body = { chiffreAffaires: req.body.chiffreAffaires };
    }

    const message = validateEntrepriseInput({
      nom: req.body.nom ?? "ok",
      proprietaire: "ok",
      chiffreAffaires: req.body.chiffreAffaires ?? 0
    });
    if (message) return res.status(400).json({ message });
    if (req.body.patronId !== undefined) {
      const patronMessage = await validatePatronAssignment(String(req.body.patronId || "").trim());
      if (patronMessage) return res.status(400).json({ message: patronMessage });
    }

    const entreprise = await updateEntreprise(req.params.id, req.body);
    if (!entreprise) return res.status(404).json({ message: "Entreprise introuvable." });
    if (req.body.chiffreAffaires !== undefined) {
      await logAction(req.user, "ca", "Modification CA", `Entreprise: ${entreprise.nom} | CA: ${entreprise.chiffreAffaires}`);
    }
    if (req.body.nom !== undefined || req.body.patronId !== undefined) {
      await logAction(req.user, "entreprises", "Modification entreprise", `Entreprise: ${entreprise.nom}`);
    }
    res.json({ entreprise });
  } catch (error) {
    next(error);
  }
});

app.post("/api/entreprises/recalculate-taxes", requireAuth, requireEnterpriseManager, async (req, res, next) => {
  try {
    const result = await recalculateEntrepriseTaxes();
    await logAction(req.user, "ca", "Recalcul des taxes", `Lignes mises a jour: ${result.updatedCount}`);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/entreprises/:id", requireAuth, requireEnterpriseManager, async (req, res, next) => {
  try {
    const entreprises = await listEntreprises();
    const entreprise = entreprises.find((item) => item.id === req.params.id);
    const removed = await removeEntreprise(req.params.id);
    if (!removed) return res.status(404).json({ message: "Entreprise introuvable." });
    await logAction(req.user, "entreprises", "Suppression entreprise", `Entreprise: ${entreprise?.nom || req.params.id}`);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/staff", requireAuth, requireAdmin, requireAdminSheets, async (_req, res, next) => {
  try {
    res.json({ staff: sanitizeStaff(await listStaff()) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/patrons", requireAuth, requireAdmin, requireAdminSheets, async (_req, res, next) => {
  try {
    res.json({ patrons: sanitizePatrons(await listPatrons()) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/patrons-options", requireAuth, requireEnterpriseManager, async (_req, res, next) => {
  try {
    res.json({ patrons: sanitizePatrons(await listPatrons()) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/patrons", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const discordId = String(req.body.discordId || "").trim();

    if (!username || !password) {
      return res.status(400).json({ message: "Username et mot de passe sont obligatoires." });
    }
    if (username.toLowerCase() === "admin") {
      return res.status(400).json({ message: "Le username admin est réservé au compte maître." });
    }


    const [staff, patrons] = await Promise.all([listStaff(), listPatrons()]);
    const exists =
      staff.some((item) => item.username.toLowerCase() === username.toLowerCase()) ||
      patrons.some((item) => item.username.toLowerCase() === username.toLowerCase());
    if (exists) return res.status(409).json({ message: "Ce username existe déjà." });

    const passwordHash = await bcrypt.hash(password, 12);
    const account = await createPatron({ username, passwordHash, discordId });
    await logAction(req.user, "patrons", "Creation patron", `Patron: ${account.username}`);
    res.status(201).json({ account });
  } catch (error) {
    next(error);
  }
});

app.put("/api/patrons/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const payload = {};
    if (req.body.username) payload.username = String(req.body.username).trim();
    if (req.body.password) payload.passwordHash = await bcrypt.hash(String(req.body.password), 12);
    if (req.body.discordId !== undefined) payload.discordId = String(req.body.discordId).trim();

    if (payload.username?.toLowerCase() === "admin") {
      return res.status(400).json({ message: "Le username admin est réservé au compte maître." });
    }

    if (payload.username) {
      const [staff, patrons] = await Promise.all([listStaff(), listPatrons()]);
      const username = payload.username.toLowerCase();
      const exists =
        staff.some((item) => item.username.toLowerCase() === username) ||
        patrons.some((item) => item.id !== req.params.id && item.username.toLowerCase() === username);
      if (exists) return res.status(409).json({ message: "Ce username existe déjà." });
    }


    const account = await updatePatron(req.params.id, payload);
    if (!account) return res.status(404).json({ message: "Compte patron introuvable." });
    await logAction(req.user, "patrons", "Modification patron", `Patron: ${account.username}`);
    res.json({ account });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/patrons/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const patrons = await listPatrons();
    const patron = patrons.find((item) => item.id === req.params.id);
    const removed = await removePatron(req.params.id);
    if (!removed) return res.status(404).json({ message: "Compte patron introuvable." });
    await logAction(req.user, "patrons", "Suppression patron", `Patron: ${patron?.username || req.params.id}`);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/staff", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const role = normalizeStaffRole(req.body.role);

    if (!username || !password) {
      return res.status(400).json({ message: "Username et mot de passe sont obligatoires." });
    }
    if (username.toLowerCase() === "admin") {
      return res.status(400).json({ message: "Le compte admin maître existe déjà." });
    }

    const [existingStaff, existingPatrons] = await Promise.all([listStaff(), listPatrons()]);
    const exists =
      existingStaff.some((item) => item.username.toLowerCase() === username.toLowerCase()) ||
      existingPatrons.some((item) => item.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      return res.status(409).json({ message: "Ce username existe déjà." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const account = await createStaff({ username, passwordHash, role });
    await logAction(req.user, "staff", "Creation login staff", `Staff: ${account.username} | Role: ${account.role}`);
    res.status(201).json({ account });
  } catch (error) {
    next(error);
  }
});

app.put("/api/staff/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const payload = {};
    if (req.body.username) payload.username = String(req.body.username).trim();
    if (req.body.password) payload.passwordHash = await bcrypt.hash(String(req.body.password), 12);
    if (req.body.role) payload.role = normalizeStaffRole(req.body.role);

    if (payload.username?.toLowerCase() === "admin") {
      return res.status(400).json({ message: "Le username admin est réservé au compte maître." });
    }

    const account = await updateStaff(req.params.id, payload);
    if (!account) return res.status(404).json({ message: "Compte staff introuvable." });
    await logAction(req.user, "staff", "Modification login staff", `Staff: ${account.username} | Role: ${account.role}`);
    res.json({ account });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/staff/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const staff = await listStaff();
    const account = staff.find((item) => item.id === req.params.id);
    const removed = await removeStaff(req.params.id);
    if (!removed) return res.status(404).json({ message: "Compte staff introuvable." });
    await logAction(req.user, "staff", "Suppression login staff", `Staff: ${account?.username || req.params.id}`);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    message: error.message || "Erreur serveur."
  });
});

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  app.listen(port, () => {
    console.log(`Mysteria FA API lancée sur http://127.0.0.1:${port}`);
    ensureSheetsReady().catch((error) => {
      console.error("Initialisation Google Sheets impossible:", error.message);
    });
  });
}

export default app;