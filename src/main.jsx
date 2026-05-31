import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Building2,
  ClipboardList,
  CircleDollarSign,
  ExternalLink,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Save,
  Shield,
  Trash2,
  Unlock,
  X,
  UserRound,
  Users
} from "lucide-react";
import "./styles.css";

const currency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2
});

function getStoredSession() {
  try {
    return JSON.parse(localStorage.getItem("mysteria-fa-session")) || {};
  } catch {
    return {};
  }
}

function App() {
  const stored = getStoredSession();
  const [token, setToken] = useState(stored.token || "");
  const [user, setUser] = useState(stored.user || null);
  const [view, setView] = useState("entreprises");
  const [message, setMessage] = useState("");

  const api = useMemo(() => {
    async function request(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {})
        }
      });

      if (response.status === 204) return null;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem("mysteria-fa-session");
          setToken("");
          setUser(null);
        }
        throw new Error(data.message || "Erreur API");
      }
      return data;
    }

    return {
      request,
      login: (payload) =>
        request("/api/auth/login", {
          method: "POST",
          body: JSON.stringify(payload)
        })
    };
  }, [token]);

  function saveSession(nextToken, nextUser) {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem("mysteria-fa-session", JSON.stringify({ token: nextToken, user: nextUser }));
  }

  function logout() {
    setToken("");
    setUser(null);
    localStorage.removeItem("mysteria-fa-session");
  }

  if (!user || !token) {
    return <LoginScreen api={api} onLogin={saveSession} />;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-ink text-slate-100 antialiased">
      <div className="app-ambient" />
      <header className="sticky top-0 z-40 border-b border-line/70 bg-ink/72 shadow-deep backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="brand-tile h-11 w-11">
              <Shield className="h-6 w-6 text-neon" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-normal">Mysteria FA</h1>
              <p className="text-sm text-slate-400">
                Connecté en <span className="text-neon">{user.username}</span> · {user.role}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={`nav-button ${view === "entreprises" ? "nav-button-active" : ""}`}
              onClick={() => setView("entreprises")}
            >
              <Building2 className="h-4 w-4" />
              Entreprises
            </button>
            {user.role === "admin" && (
              <>
                <button
                  className={`nav-button ${view === "patrons" ? "nav-button-active" : ""}`}
                  onClick={() => setView("patrons")}
                >
                  <UserRound className="h-4 w-4" />
                  Patrons
                </button>
                <button
                  className={`nav-button ${view === "staff" ? "nav-button-active" : ""}`}
                  onClick={() => setView("staff")}
                >
                  <Users className="h-4 w-4" />
                  Staff
                </button>
                <button
                  className={`nav-button ${view === "logs" ? "nav-button-active" : ""}`}
                  onClick={() => setView("logs")}
                >
                  <ClipboardList className="h-4 w-4" />
                  Logs
                </button>
              </>
            )}
            <button className="icon-button" onClick={logout} title="Déconnexion" aria-label="Déconnexion">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {message && (
          <div className="mb-5 rounded-md border border-neon/35 bg-neon/12 px-4 py-3 text-sm font-medium text-neon shadow-glow">
            {message}
          </div>
        )}
        {view === "entreprises" && (
          <EntreprisesView api={api} user={user} onMessage={setMessage} />
        )}
        {view === "patrons" && user.role === "admin" && (
          <PatronsView api={api} onMessage={setMessage} />
        )}
        {view === "staff" && user.role === "admin" && (
          <StaffView api={api} onMessage={setMessage} />
        )}
        {view === "logs" && user.role === "admin" && (
          <LogsView api={api} onMessage={setMessage} />
        )}
      </main>
    </div>
  );
}

function LoginScreen({ api, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api.login({ username, password });
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4 py-10 text-slate-100 antialiased">
      <div className="login-ambient" />
      <form onSubmit={submit} className="login-card w-full max-w-md p-7">
        <div className="mb-8 flex items-center gap-4">
          <div className="brand-tile h-14 w-14">
            <Shield className="h-7 w-7 text-neon" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-normal">Mysteria FA</h1>
            <p className="text-sm text-slate-400">Accès entreprises et staff</p>
          </div>
        </div>

        <label className="field-label" htmlFor="username">Identifiant</label>
        <input
          id="username"
          className="field"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
        />

        <label className="field-label mt-4" htmlFor="password">Mot de passe</label>
        <input
          id="password"
          className="field"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />

        {error && <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-red-200">{error}</div>}

        <button className="primary-button mt-6 w-full" disabled={loading}>
          <Shield className="h-5 w-5" />
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

function EntreprisesView({ api, user, onMessage }) {
  const [entreprises, setEntreprises] = useState([]);
  const [form, setForm] = useState({ nom: "", patronId: "", chiffreAffaires: "" });
  const [editing, setEditing] = useState({});
  const [patrons, setPatrons] = useState([]);
  const [patronEdits, setPatronEdits] = useState({});
  const [editEntreprise, setEditEntreprise] = useState(null);
  const [caLock, setCaLock] = useState({ locked: false, manualLocked: false, automaticLocked: false });
  const [loading, setLoading] = useState(true);
  const isPatron = user.role === "patron";
  const isReadOnly = user.role === "gouverneur";
  const canManage = !isPatron && !isReadOnly;
  const caLockedForPatron = isPatron && caLock.locked;

  async function load() {
    setLoading(true);
    try {
      const data = await api.request("/api/entreprises");
      setEntreprises(data.entreprises);
      if (data.caLock) setCaLock(data.caLock);
      if (canManage) {
        const patronsData = await api.request("/api/patrons-options");
        setPatrons(patronsData.patrons);
        if (!form.patronId && patronsData.patrons[0]) {
          setForm((current) => ({ ...current, patronId: patronsData.patrons[0].id }));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((err) => onMessage(err.message));
  }, []);

  async function create(event) {
    event.preventDefault();
    try {
      const data = await api.request("/api/entreprises", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setEntreprises((items) => [...items, data.entreprise]);
      setForm({ nom: "", patronId: patrons[0]?.id || "", chiffreAffaires: "" });
      onMessage("Entreprise creee avec taxes calculees automatiquement.");
    } catch (err) {
      onMessage(err.message);
    }
  }

  async function saveCA(item) {
    if (caLockedForPatron) {
      onMessage("La modification du CA est bloquee pour les patrons.");
      return;
    }
    const nextCA = editing[item.id] ?? item.chiffreAffaires;
    const nextPatronId = patronEdits[item.id] ?? item.patronId ?? "";
    const payload = isPatron
      ? { chiffreAffaires: nextCA }
      : { chiffreAffaires: nextCA, patronId: nextPatronId };
    const data = await api.request(`/api/entreprises/${item.id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    setEntreprises((items) => items.map((entry) => (entry.id === item.id ? data.entreprise : entry)));
    setPatronEdits((current) => ({ ...current, [item.id]: data.entreprise.patronId || "" }));
    onMessage(isPatron ? "Ton chiffre d\'affaires a �t� mis � jour." : "Chiffre d\'affaires mis � jour.");
  }

  async function remove(id) {
    await api.request(`/api/entreprises/${id}`, { method: "DELETE" });
    setEntreprises((items) => items.filter((item) => item.id !== id));
    onMessage("Entreprise supprimée.");
  }


  function openEditEntreprise(item) {
    setEditEntreprise({
      id: item.id,
      nom: item.nom || "",
      patronId: item.patronId || "",
      chiffreAffaires: item.chiffreAffaires ?? 0
    });
  }

  async function saveEntrepriseEdit(event) {
    event.preventDefault();
    const data = await api.request(`/api/entreprises/${editEntreprise.id}`, {
      method: "PUT",
      body: JSON.stringify(editEntreprise)
    });
    setEntreprises((items) => items.map((entry) => (entry.id === editEntreprise.id ? data.entreprise : entry)));
    setPatronEdits((current) => ({ ...current, [editEntreprise.id]: data.entreprise.patronId || "" }));
    setEditEntreprise(null);
    onMessage("Entreprise modifiee.");
  }

  const totals = entreprises.reduce(
    (acc, item) => ({
      ca: acc.ca + Number(item.chiffreAffaires || 0),
      taxes: acc.taxes + Number(item.taxesDues || 0)
    }),
    { ca: 0, taxes: 0 }
  );

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Entreprises" value={entreprises.length} icon={Building2} />
        <Metric title="CA total" value={currency.format(totals.ca)} icon={CircleDollarSign} />
        <Metric title="Taxes dues" value={currency.format(totals.taxes)} icon={Shield} />
      </div>

      {user.role === "admin" && <CaLockControl api={api} onMessage={onMessage} />}

      {caLockedForPatron && (
        <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-amber-100">
          La modification du CA est bloquee pour le moment.
        </div>
      )}

      {canManage && (
        <form onSubmit={create} className="surface-panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5 text-neon" />
            <h2 className="text-lg font-semibold">Créer une entreprise</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_220px_180px_auto]">
            <input className="field" placeholder="Nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
            <select className="field" value={form.patronId} onChange={(e) => setForm({ ...form, patronId: e.target.value })}>
              <option value="">Aucun patron</option>
              {patrons.map((patron) => (
                <option key={patron.id} value={patron.id}>{patron.username}</option>
              ))}
            </select>
            <input className="field" placeholder="CA de départ" type="number" min="0" step="0.01" value={form.chiffreAffaires} onChange={(e) => setForm({ ...form, chiffreAffaires: e.target.value })} required />
            <button className="primary-button">
              <Plus className="h-5 w-5" />
              Créer
            </button>
          </div>
        </form>
      )}

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="border-b border-line/80 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Patron</th>
                <th className="px-4 py-3">Chiffre d'affaires</th>
                <th className="px-4 py-3">Taxes 15%</th>
                <th className="px-4 py-3">Mise à jour</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {loading && <TableMessage colSpan={6} text="Chargement..." />}
              {!loading && entreprises.length === 0 && <TableMessage colSpan={6} text={isPatron ? "Aucune entreprise liée à ton compte." : "Aucune entreprise."} />}
              {entreprises.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-medium text-white">{item.nom}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-56 items-center gap-2">
                      {canManage ? (
                        <select
                          className="field h-10 w-48"
                          value={patronEdits[item.id] ?? item.patronId ?? ""}
                          onChange={(e) => setPatronEdits({ ...patronEdits, [item.id]: e.target.value })}
                        >
                          <option value="">Aucun patron</option>
                          {patrons.map((patron) => (
                            <option key={patron.id} value={patron.id}>{patron.username}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-300">{item.patronUsername || "-"}</span>
                      )}
                      {item.patronDiscordId && (
                        <a
                          className="icon-button h-10 w-10 shrink-0"
                          href={`https://discord.com/users/${item.patronDiscordId}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Ouvrir le profil Discord"
                          aria-label="Ouvrir le profil Discord"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="field h-10 w-40"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editing[item.id] ?? item.chiffreAffaires}
                      onChange={(e) => setEditing({ ...editing, [item.id]: e.target.value })}
                      disabled={isReadOnly || caLockedForPatron}
                    />
                  </td>
                  <td className="px-4 py-3 text-gold">{currency.format(item.taxesDues)}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{formatDate(item.derniereMiseAJour)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {canManage && (
                        <button className="icon-button" onClick={() => openEditEntreprise(item)} title="Editer" aria-label="Editer">
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {!isReadOnly && (
                        <button className="icon-button" onClick={() => saveCA(item)} disabled={caLockedForPatron} title="Enregistrer le CA" aria-label="Enregistrer le CA">
                          <Save className="h-4 w-4" />
                        </button>
                      )}
                      {canManage && (
                        <button className="icon-button-danger" onClick={() => remove(item.id)} title="Supprimer" aria-label="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editEntreprise && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6">
          <form onSubmit={saveEntrepriseEdit} className="surface-panel w-full max-w-2xl p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Editer l'entreprise</h2>
                <p className="text-sm text-slate-400">Nom, patron et chiffre d'affaires.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setEditEntreprise(null)} title="Fermer" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Nom</span>
                <input className="field" value={editEntreprise.nom} onChange={(e) => setEditEntreprise({ ...editEntreprise, nom: e.target.value })} required />
              </label>
              <label className="block">
                <span className="field-label">Patron</span>
                <select className="field" value={editEntreprise.patronId} onChange={(e) => setEditEntreprise({ ...editEntreprise, patronId: e.target.value })}>
                  <option value="">Aucun patron</option>
                  {patrons.map((patron) => (
                    <option key={patron.id} value={patron.id}>{patron.username}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label">Chiffre d'affaires</span>
                <input className="field" type="number" min="0" step="0.01" value={editEntreprise.chiffreAffaires} onChange={(e) => setEditEntreprise({ ...editEntreprise, chiffreAffaires: e.target.value })} required />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button className="nav-button" type="button" onClick={() => setEditEntreprise(null)}>Annuler</button>
              <button className="primary-button" type="submit">
                <Save className="h-5 w-5" />
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}

    </section>
  );
}

function PatronsView({ api, onMessage }) {
  const [patrons, setPatrons] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", discordId: "" });
  const [edits, setEdits] = useState({});

  async function load() {
    const data = await api.request("/api/patrons");
    setPatrons(data.patrons);
  }

  useEffect(() => {
    load().catch((err) => onMessage(err.message));
  }, []);

  async function create(event) {
    event.preventDefault();
    try {
      const data = await api.request("/api/patrons", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setPatrons((items) => [...items, data.account]);
      setForm({ username: "", password: "", discordId: "" });
      onMessage("Compte patron cree.");
    } catch (err) {
      onMessage(err.message);
    }
  }

  async function save(item) {
    const payload = edits[item.id] || {};
    try {
      const data = await api.request(`/api/patrons/${item.id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setPatrons((items) => items.map((entry) => (entry.id === item.id ? data.account : entry)));
      setEdits((current) => ({ ...current, [item.id]: {} }));
      onMessage("Compte patron modifie.");
    } catch (err) {
      onMessage(err.message);
    }
  }

  async function remove(id) {
    try {
      await api.request(`/api/patrons/${id}`, { method: "DELETE" });
      setPatrons((items) => items.filter((item) => item.id !== id));
      onMessage("Compte patron supprime.");
    } catch (err) {
      onMessage(err.message);
    }
  }

  return (
    <section className="space-y-6">
      <CaLockControl api={api} onMessage={onMessage} />

      <form onSubmit={create} className="surface-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserRound className="h-5 w-5 text-neon" />
          <h2 className="text-lg font-semibold">Gestion Patrons</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <input className="field" placeholder="Username patron" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input className="field" placeholder="Mot de passe" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <input className="field" placeholder="ID Discord" value={form.discordId} onChange={(e) => setForm({ ...form, discordId: e.target.value })} />
          <button className="primary-button">
            <Plus className="h-5 w-5" />
            Ajouter
          </button>
        </div>
      </form>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="border-b border-line/80 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Nouveau mot de passe</th>
                <th className="px-4 py-3">ID Discord</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {patrons.length === 0 && <TableMessage colSpan={5} text="Aucun compte patron dans le Google Sheet." />}
              {patrons.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <input
                      className="field h-10"
                      value={edits[item.id]?.username ?? item.username}
                      onChange={(e) => setEdits({ ...edits, [item.id]: { ...(edits[item.id] || {}), username: e.target.value } })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="field h-10"
                      type="password"
                      placeholder="Laisser vide"
                      value={edits[item.id]?.password ?? ""}
                      onChange={(e) => setEdits({ ...edits, [item.id]: { ...(edits[item.id] || {}), password: e.target.value } })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-48 items-center gap-2">
                      <input
                        className="field h-10 w-44"
                        placeholder="ID Discord"
                        value={edits[item.id]?.discordId ?? item.discordId ?? ""}
                        onChange={(e) => setEdits({ ...edits, [item.id]: { ...(edits[item.id] || {}), discordId: e.target.value } })}
                      />
                      {(edits[item.id]?.discordId ?? item.discordId) && (
                        <a
                          className="icon-button h-10 w-10 shrink-0"
                          href={`https://discord.com/users/${edits[item.id]?.discordId ?? item.discordId}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Ouvrir le profil Discord"
                          aria-label="Ouvrir le profil Discord"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neon">{item.role}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button className="icon-button" onClick={() => save(item)} title="Enregistrer" aria-label="Enregistrer">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="icon-button-danger" onClick={() => remove(item.id)} title="Supprimer" aria-label="Supprimer">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}


function LogsView({ api, onMessage }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const categories = {
    ca: "CA",
    entreprises: "Entreprises",
    patrons: "Patrons",
    staff: "Staff"
  };

  async function load() {
    setLoading(true);
    try {
      const data = await api.request("/api/logs");
      setLogs(data.logs || []);
    } catch (err) {
      onMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="space-y-6">
      <div className="surface-panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-lg font-semibold text-white">Logs</h2>
          <p className="text-sm text-slate-400">Historique des modifications du site.</p>
        </div>
        <button className="nav-button" onClick={load} disabled={loading}>
          <ClipboardList className="h-4 w-4" />
          Actualiser
        </button>
      </div>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left">
            <thead className="border-b border-line/80 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Categorie</th>
                <th className="px-4 py-3">Utilisateur</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {loading && <TableMessage colSpan={5} text="Chargement des logs..." />}
              {!loading && logs.length === 0 && <TableMessage colSpan={5} text="Aucun log pour le moment." />}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-sm text-slate-300">{formatDate(log.date)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-neon/30 bg-neon/10 px-2 py-1 text-xs font-semibold text-neon">
                      {categories[log.categorie] || log.categorie}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-white">{log.utilisateur || "-"}</td>
                  <td className="px-4 py-3 text-sm font-medium text-white">{log.action}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{log.details || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StaffView({ api, onMessage }) {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", role: "staff" });
  const [edits, setEdits] = useState({});

  async function load() {
    const data = await api.request("/api/staff");
    setStaff(data.staff);
  }

  useEffect(() => {
    load().catch((err) => onMessage(err.message));
  }, []);

  async function create(event) {
    event.preventDefault();
    const data = await api.request("/api/staff", {
      method: "POST",
      body: JSON.stringify(form)
    });
    setStaff((items) => [...items, data.account]);
    setForm({ username: "", password: "", role: "staff" });
    onMessage("Compte staff créé.");
  }

  async function save(item) {
    const payload = edits[item.id] || {};
    const data = await api.request(`/api/staff/${item.id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    setStaff((items) => items.map((entry) => (entry.id === item.id ? data.account : entry)));
    setEdits((current) => ({ ...current, [item.id]: {} }));
    onMessage("Compte staff modifié.");
  }

  async function remove(id) {
    await api.request(`/api/staff/${id}`, { method: "DELETE" });
    setStaff((items) => items.filter((item) => item.id !== id));
    onMessage("Compte staff supprimé.");
  }

  return (
    <section className="space-y-6">
      <form onSubmit={create} className="surface-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-neon" />
          <h2 className="text-lg font-semibold">Gestion Staff</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_160px_auto]">
          <input className="field" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input className="field" placeholder="Mot de passe" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="staff">Staff</option>
            <option value="gouverneur">Gouverneur</option>
            <option value="admin">Admin</option>
          </select>
          <button className="primary-button">
            <Plus className="h-5 w-5" />
            Ajouter
          </button>
        </div>
      </form>

      <div className="table-shell">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b border-line/80 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Nouveau mot de passe</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {staff.length === 0 && <TableMessage colSpan={4} text="Aucun compte staff dans le Google Sheet." />}
              {staff.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <input
                      className="field h-10"
                      value={edits[item.id]?.username ?? item.username}
                      onChange={(e) => setEdits({ ...edits, [item.id]: { ...(edits[item.id] || {}), username: e.target.value } })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="field h-10"
                      type="password"
                      placeholder="Laisser vide"
                      value={edits[item.id]?.password ?? ""}
                      onChange={(e) => setEdits({ ...edits, [item.id]: { ...(edits[item.id] || {}), password: e.target.value } })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="field h-10"
                      value={edits[item.id]?.role ?? item.role}
                      onChange={(e) => setEdits({ ...edits, [item.id]: { ...(edits[item.id] || {}), role: e.target.value } })}
                    >
                      <option value="staff">Staff</option>
                      <option value="gouverneur">Gouverneur</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button className="icon-button" onClick={() => save(item)} title="Enregistrer" aria-label="Enregistrer">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="icon-button-danger" onClick={() => remove(item.id)} title="Supprimer" aria-label="Supprimer">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Metric({ title, value, icon: Icon }) {
  return (
    <div className="surface-panel p-5">
      <div className="mb-3 flex items-center justify-between text-slate-400">
        <span className="text-sm">{title}</span>
        <Icon className="h-5 w-5 text-neon" />
      </div>
      <div className="text-2xl font-extrabold text-white">{value}</div>
    </div>
  );
}

function CaLockControl({ api, onMessage }) {
  const [caLock, setCaLock] = useState({ locked: false, manualLocked: false, automaticLocked: false });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setCaLock(await api.request("/api/ca-lock"));
    } catch (err) {
      onMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleCaLock() {
    try {
      const data = await api.request("/api/ca-lock", {
        method: "PUT",
        body: JSON.stringify({ locked: !caLock.manualLocked })
      });
      setCaLock(data);
      onMessage(data.manualLocked ? "Modification des CA bloquee pour les patrons." : "Modification des CA debloquee pour les patrons.");
    } catch (err) {
      onMessage(err.message);
    }
  }

  return (
    <div className="surface-panel flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Blocage CA patrons</h2>
        <p className="text-sm text-slate-400">
          {caLock.locked
            ? caLock.automaticLocked
              ? "Blocage automatique actif jusqu'a lundi 00h."
              : "Blocage manuel actif."
            : "Les patrons peuvent modifier leur CA."}
        </p>
      </div>
      <button className={caLock.manualLocked ? "nav-button" : "primary-button"} onClick={toggleCaLock} disabled={loading}>
        {caLock.manualLocked ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
        {caLock.manualLocked ? "Debloquer" : "Bloquer"}
      </button>
    </div>
  );
}

function TableMessage({ colSpan, text }) {
  return (
    <tr>
      <td className="px-4 py-8 text-center text-slate-400" colSpan={colSpan}>
        {text}
      </td>
    </tr>
  );
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR");
}

createRoot(document.getElementById("root")).render(<App />);
