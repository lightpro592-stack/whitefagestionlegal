import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Building2,
  CircleDollarSign,
  ExternalLink,
  LogOut,
  Pencil,
  Plus,
  Save,
  Shield,
  Trash2,
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
    return JSON.parse(localStorage.getItem("whitefa-session")) || {};
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
          localStorage.removeItem("whitefa-session");
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
    localStorage.setItem("whitefa-session", JSON.stringify({ token: nextToken, user: nextUser }));
  }

  function logout() {
    setToken("");
    setUser(null);
    localStorage.removeItem("whitefa-session");
  }

  if (!user || !token) {
    return <LoginScreen api={api} onLogin={saveSession} />;
  }

  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(57,255,182,0.16),transparent_32%),linear-gradient(135deg,#06080d_0%,#0d1220_52%,#12101a_100%)]" />
      <header className="border-b border-line/80 bg-ink/82 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md border border-neon/40 bg-neon/10 shadow-glow">
              <Shield className="h-6 w-6 text-neon" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-normal">WhiteFA Gestion</h1>
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
              </>
            )}
            <button className="icon-button" onClick={logout} title="Déconnexion" aria-label="Déconnexion">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {message && (
          <div className="mb-4 rounded-md border border-neon/30 bg-neon/10 px-4 py-3 text-sm text-neon">
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
    <div className="grid min-h-screen place-items-center bg-ink px-4 text-slate-100">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_25%_15%,rgba(57,255,182,0.18),transparent_30%),linear-gradient(145deg,#06080d_0%,#111827_55%,#17111f_100%)]" />
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-line bg-panel/92 p-6 shadow-glow">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-md border border-neon/40 bg-neon/10">
            <Shield className="h-7 w-7 text-neon" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-normal">WhiteFA Gestion</h1>
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
  const [form, setForm] = useState({ nom: "", proprietaire: "", discordId: "", chiffreAffaires: "" });
  const [editing, setEditing] = useState({});
  const [discordEdits, setDiscordEdits] = useState({});
  const [editEntreprise, setEditEntreprise] = useState(null);
  const [loading, setLoading] = useState(true);
  const isPatron = user.role === "patron";
  const isReadOnly = user.role === "gouverneur";
  const canManage = !isPatron && !isReadOnly;

  async function load() {
    setLoading(true);
    try {
      const data = await api.request("/api/entreprises");
      setEntreprises(data.entreprises);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((err) => onMessage(err.message));
  }, []);

  async function create(event) {
    event.preventDefault();
    const data = await api.request("/api/entreprises", {
      method: "POST",
      body: JSON.stringify(form)
    });
    setEntreprises((items) => [...items, data.entreprise]);
    setForm({ nom: "", proprietaire: "", discordId: "", chiffreAffaires: "" });
    onMessage("Entreprise créée avec taxes calculées automatiquement.");
  }

  async function saveCA(item) {
    const nextCA = editing[item.id] ?? item.chiffreAffaires;
    const nextDiscordId = discordEdits[item.id] ?? item.discordId ?? "";
    const payload = isPatron
      ? { chiffreAffaires: nextCA }
      : { chiffreAffaires: nextCA, discordId: nextDiscordId };
    const data = await api.request(`/api/entreprises/${item.id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    setEntreprises((items) => items.map((entry) => (entry.id === item.id ? data.entreprise : entry)));
    setDiscordEdits((current) => ({ ...current, [item.id]: data.entreprise.discordId || "" }));
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
      proprietaire: item.proprietaire || "",
      discordId: item.discordId || "",
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
    setDiscordEdits((current) => ({ ...current, [editEntreprise.id]: data.entreprise.discordId || "" }));
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

      {canManage && (
        <form onSubmit={create} className="rounded-lg border border-line bg-panel/88 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5 text-neon" />
            <h2 className="text-lg font-semibold">Créer une entreprise</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px_180px_auto]">
            <input className="field" placeholder="Nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
            <input className="field" placeholder="Propriétaire" value={form.proprietaire} onChange={(e) => setForm({ ...form, proprietaire: e.target.value })} required />
            <input className="field" placeholder="ID Discord" value={form.discordId} onChange={(e) => setForm({ ...form, discordId: e.target.value })} />
            <input className="field" placeholder="CA de départ" type="number" min="0" step="0.01" value={form.chiffreAffaires} onChange={(e) => setForm({ ...form, chiffreAffaires: e.target.value })} required />
            <button className="primary-button">
              <Plus className="h-5 w-5" />
              Créer
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-line bg-panel/88">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead className="border-b border-line bg-slate-950/40 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Propriétaire</th>
                <th className="px-4 py-3">Discord</th>
                <th className="px-4 py-3">Chiffre d'affaires</th>
                <th className="px-4 py-3">Taxes 15%</th>
                <th className="px-4 py-3">Mise à jour</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {loading && <TableMessage colSpan={7} text="Chargement..." />}
              {!loading && entreprises.length === 0 && <TableMessage colSpan={7} text={isPatron ? "Aucune entreprise liée à ton compte." : "Aucune entreprise."} />}
              {entreprises.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-medium text-white">{item.nom}</td>
                  <td className="px-4 py-3 text-slate-300">{item.proprietaire}</td>
                  <td className="px-4 py-3">
                    <div className="flex min-w-48 items-center gap-2">
                      {canManage ? (
                        <input
                          className="field h-10 w-44"
                          placeholder="ID Discord"
                          value={discordEdits[item.id] ?? item.discordId ?? ""}
                          onChange={(e) => setDiscordEdits({ ...discordEdits, [item.id]: e.target.value })}
                        />
                      ) : (
                        <span className="text-slate-300">{item.discordId || "-"}</span>
                      )}
                      {item.discordId && (
                        <a
                          className="icon-button h-10 w-10 shrink-0"
                          href={`https://discord.com/users/${item.discordId}`}
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
                      disabled={isReadOnly}
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
                        <button className="icon-button" onClick={() => saveCA(item)} title="Enregistrer le CA" aria-label="Enregistrer le CA">
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
          <form onSubmit={saveEntrepriseEdit} className="w-full max-w-2xl rounded-lg border border-line bg-panel p-5 shadow-glow">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Editer l'entreprise</h2>
                <p className="text-sm text-slate-400">Nom, proprietaire, ID Discord et chiffre d'affaires.</p>
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
                <span className="field-label">Proprietaire</span>
                <input className="field" value={editEntreprise.proprietaire} onChange={(e) => setEditEntreprise({ ...editEntreprise, proprietaire: e.target.value })} required />
              </label>
              <label className="block">
                <span className="field-label">ID Discord</span>
                <input className="field" value={editEntreprise.discordId} onChange={(e) => setEditEntreprise({ ...editEntreprise, discordId: e.target.value })} />
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
  const [entreprises, setEntreprises] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", entrepriseId: "" });
  const [edits, setEdits] = useState({});

  async function load() {
    const [patronsData, entreprisesData] = await Promise.all([
      api.request("/api/patrons"),
      api.request("/api/entreprises")
    ]);
    setPatrons(patronsData.patrons);
    setEntreprises(entreprisesData.entreprises);
    if (!form.entrepriseId && entreprisesData.entreprises[0]) {
      setForm((current) => ({ ...current, entrepriseId: entreprisesData.entreprises[0].id }));
    }
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
      const entreprise = entreprises.find((item) => item.id === data.account.entrepriseId);
      setPatrons((items) => [...items, { ...data.account, entrepriseNom: entreprise?.nom || "" }]);
      setForm({ username: "", password: "", entrepriseId: entreprises[0]?.id || "" });
      onMessage("Compte patron créé et lié à son entreprise.");
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
      const entrepriseId = data.account.entrepriseId;
      const entreprise = entreprises.find((entry) => entry.id === entrepriseId);
      setPatrons((items) =>
        items.map((entry) =>
          entry.id === item.id ? { ...data.account, entrepriseNom: entreprise?.nom || "" } : entry
        )
      );
      setEdits((current) => ({ ...current, [item.id]: {} }));
      onMessage("Compte patron modifié.");
    } catch (err) {
      onMessage(err.message);
    }
  }

  async function remove(id) {
    try {
      await api.request(`/api/patrons/${id}`, { method: "DELETE" });
      setPatrons((items) => items.filter((item) => item.id !== id));
      onMessage("Compte patron supprimé.");
    } catch (err) {
      onMessage(err.message);
    }
  }

  return (
    <section className="space-y-6">
      <form onSubmit={create} className="rounded-lg border border-line bg-panel/88 p-4">
        <div className="mb-4 flex items-center gap-2">
          <UserRound className="h-5 w-5 text-neon" />
          <h2 className="text-lg font-semibold">Gestion Patrons</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <input className="field" placeholder="Username patron" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <input className="field" placeholder="Mot de passe" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select className="field" value={form.entrepriseId} onChange={(e) => setForm({ ...form, entrepriseId: e.target.value })} required>
            <option value="" disabled>Entreprise liée</option>
            {entreprises.map((item) => (
              <option key={item.id} value={item.id}>{item.nom}</option>
            ))}
          </select>
          <button className="primary-button" disabled={entreprises.length === 0}>
            <Plus className="h-5 w-5" />
            Ajouter
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-line bg-panel/88">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="border-b border-line bg-slate-950/40 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Nouveau mot de passe</th>
                <th className="px-4 py-3">Entreprise liée</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/80">
              {patrons.length === 0 && <TableMessage colSpan={5} text="Aucun compte patron dans le Google Sheet." />}
              {patrons.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.03]">
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
                      value={edits[item.id]?.entrepriseId ?? item.entrepriseId}
                      onChange={(e) => setEdits({ ...edits, [item.id]: { ...(edits[item.id] || {}), entrepriseId: e.target.value } })}
                    >
                      {entreprises.map((entry) => (
                        <option key={entry.id} value={entry.id}>{entry.nom}</option>
                      ))}
                    </select>
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
      <form onSubmit={create} className="rounded-lg border border-line bg-panel/88 p-4">
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

      <div className="overflow-hidden rounded-lg border border-line bg-panel/88">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b border-line bg-slate-950/40 text-xs uppercase text-slate-400">
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
                <tr key={item.id} className="hover:bg-white/[0.03]">
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
    <div className="rounded-lg border border-line bg-panel/88 p-4">
      <div className="mb-2 flex items-center justify-between text-slate-400">
        <span className="text-sm">{title}</span>
        <Icon className="h-5 w-5 text-neon" />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
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
