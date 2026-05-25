# WhiteFA Gestion

Application web complète pour gérer les entreprises d'un serveur GTA RP avec Google Sheets comme base de données.

## Fonctionnalités

- Connexion par JWT.
- Compte maître intégré :
  - Identifiant : `admin`
  - Mot de passe : `whitefagestion`
- Rôles :
  - `admin` : entreprises + comptes staff.
  - `staff` : entreprises uniquement.
  - `gouverneur` : lecture seule sur les entreprises.
  - `patron` : son entreprise uniquement, modification du CA et lecture des taxes.
- Google Sheets comme stockage.
- Calcul backend automatique des taxes : `Taxes_Dues = Chiffre_Affaires * 0.15`.
- Interface React/Tailwind sombre, responsive, en SPA.

## Structure Google Sheets

Le classeur doit contenir deux onglets :

`Entreprises`

| ID | Nom | Propriétaire | Chiffre_Affaires | Taxes_Dues | Derniere_Mise_A_Jour |
| --- | --- | --- | --- | --- | --- |

`Staff`

| ID | Username | Password_Hash | Role |
| --- | --- | --- | --- |

`Patrons`

| ID | Username | Password_Hash | Entreprise_ID | Role |
| --- | --- | --- | --- | --- |

`Entreprise_ID` contient l'ID de la ligne `Entreprises` liée au compte patron.

L'application peut créer ou réinitialiser ces en-têtes via la route admin `POST /api/setup`.

## Installation

```bash
npm install
cp .env.example .env
npm run dev
```

Frontend : `http://127.0.0.1:5173`  
Backend : `http://127.0.0.1:4000`

## Lier Google Sheets

### 1. Créer le Google Sheet

1. Va sur [Google Sheets](https://sheets.google.com).
2. Crée un nouveau tableur, par exemple `WhiteFA Gestion`.
3. Copie l'ID du document dans l'URL :

```text
https://docs.google.com/spreadsheets/d/TON_GOOGLE_SHEET_ID/edit
```

4. Mets cet ID dans `.env` :

```env
GOOGLE_SHEET_ID=TON_GOOGLE_SHEET_ID
```

### 2. Créer les credentials Google Cloud

1. Va sur [Google Cloud Console](https://console.cloud.google.com).
2. Crée ou sélectionne un projet.
3. Active l'API `Google Sheets API`.
4. Va dans `IAM et administration` puis `Comptes de service`.
5. Crée un compte de service, par exemple `whitefa-sheets`.
6. Ouvre ce compte de service, onglet `Clés`.
7. Crée une clé JSON.
8. Dans le fichier JSON téléchargé, récupère :
   - `client_email`
   - `private_key`

### 3. Remplir `.env`

```env
PORT=4000
JWT_SECRET=une-valeur-longue-et-secrete
GOOGLE_SHEET_ID=TON_GOOGLE_SHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL=client_email_du_json
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Garde les guillemets autour de `GOOGLE_PRIVATE_KEY`. Les `\n` doivent rester dans la valeur.

### 4. Partager le Google Sheet

1. Retourne dans ton Google Sheet.
2. Clique sur `Partager`.
3. Ajoute l'adresse `client_email` du compte de service.
4. Donne le droit `Éditeur`.

Sans ce partage, l'API répondra souvent par une erreur `403` ou `The caller does not have permission`.

### 5. Initialiser les onglets

1. Lance l'application :

```bash
npm run dev
```

2. Connecte-toi avec le compte maître :

```text
admin / whitefagestion
```

3. Appelle la route d'initialisation :

```bash
curl -X POST http://127.0.0.1:4000/api/setup \
  -H "Authorization: Bearer TON_TOKEN_ADMIN"
```

Le token est visible dans `localStorage`, clé `whitefa-session`, après connexion admin.

Tu peux aussi créer les deux onglets et en-têtes à la main si tu préfères.

## Déploiement

### Build frontend

```bash
npm run build
npm start
```

`npm start` sert le backend Express et les fichiers générés dans `dist`.

### Variables à définir en production

- `PORT`
- `JWT_SECRET`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

## Routes API

### Auth

- `POST /api/auth/login`
- `GET /api/auth/me`

### Entreprises

- `GET /api/entreprises`
- `POST /api/entreprises`
- `PUT /api/entreprises/:id`
- `DELETE /api/entreprises/:id`

### Staff, admin uniquement

- `GET /api/staff`
- `POST /api/staff`
- `PUT /api/staff/:id`
- `DELETE /api/staff/:id`

### Patrons, admin uniquement

- `GET /api/patrons`
- `POST /api/patrons`
- `PUT /api/patrons/:id`
- `DELETE /api/patrons/:id`

## Alternative Google Apps Script

Ce projet utilise la méthode recommandée pour un backend Node.js : Google Sheets API + compte de service. Une Web App Google Apps Script serait possible, mais elle déplacerait la logique CRUD et auth dans Apps Script. Ici, le backend Express garde l'authentification, le calcul des taxes et les permissions au même endroit.
