# Orchid Park Owner Directory

Committee-only owner + rental directory. No database — data lives as a JSON file
in a separate GitHub repo, read/written through a small serverless function.
Fully free to run (GitHub + Vercel free tiers).

## What's in this folder

```
owner-directory/
├── api/
│   └── owners.js          ← serverless function: reads/writes owners.json via GitHub API
├── public/
│   └── index.html
├── src/
│   ├── App.js              ← the whole app (login, CRUD, Excel export)
│   ├── index.js
│   └── index.css
├── owners.json.reference   ← your combined owner + rental data — see step 2 below
├── package.json
├── tailwind.config.js
├── postcss.config.js
├── vercel.json
├── .gitignore
└── .env.example
```

## One-time setup

### 1. Create the data repo
- New GitHub repo, e.g. `owner-directory-data`
- Upload `owners.json.reference` from this folder into that repo, renamed to `owners.json`
- Commit

### 2. Get a GitHub token
- GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
- Repository access: only `owner-directory-data`
- Permissions: Contents → Read and write
- Copy the token

### 3. Install dependencies (run inside this folder)
```
npm install
```

### 4. Push this app to its own repo
```
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/owner-directory-app.git
git push -u origin main
```

### 5. Deploy on Vercel
- vercel.com → Add New Project → import `owner-directory-app`
- Add these Environment Variables (see `.env.example` for the list):
  - `GITHUB_TOKEN`
  - `GITHUB_REPO` → `yourusername/owner-directory-data`
  - `GITHUB_FILE_PATH` → `owners.json`
  - `COMMITTEE_PASSWORD` → whatever you want the login password to be
- Deploy

### 6. Test
- Open the `.vercel.app` URL, log in with `COMMITTEE_PASSWORD`
- Add/edit an owner → check the data repo for a new commit
- Try both Excel download buttons

### 7. Add to phone
- Open the URL on your phone → browser menu → "Add to Home Screen"

## Local development
```
npm start
```
Note: `/api/owners.js` only runs on Vercel (or via `vercel dev`), not with plain `npm start`.
For local testing of the API, install the Vercel CLI: `npm i -g vercel`, then run `vercel dev`.
