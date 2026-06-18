# LeadPulse Dashboard — GitHub Pages Setup

## Step 1 · Deploy the Apps Script Web App (API)

1. Open your Apps Script project (the one with `leadpulse_gmail_parser.gs`)
2. Click **Deploy → New deployment**
3. Select type **Web app**
4. Set:
   - **Execute as:** Me (kuldeep@88gravity.com)
   - **Who has access:** Anyone
5. Click **Deploy** → Authorize if prompted
6. **Copy the Web App URL** (ends with `/exec`) — you'll need this

> If you already have a deployment, click **Deploy → Manage deployments → Edit (pencil icon) → New version → Deploy**

---

## Step 2 · Push Dashboard to GitHub

1. Create a new GitHub repository (e.g. `leadpulse-dashboard`)
   - Go to https://github.com/new
   - Repository name: `leadpulse-dashboard`
   - Visibility: **Private** (recommended — your lead data is sensitive)
   - Click **Create repository**

2. Upload `index.html` to the repo:
   - Click **Add file → Upload files**
   - Drag in `index.html`
   - Commit message: `Add LeadPulse Dashboard`
   - Click **Commit changes**

---

## Step 3 · Enable GitHub Pages

1. In your repo, go to **Settings → Pages**
2. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
3. Click **Save**
4. Your dashboard URL will appear:
   ```
   https://YOUR-USERNAME.github.io/leadpulse-dashboard/
   ```
   (It may take 1-2 minutes to go live)

---

## Step 4 · Connect the Dashboard to Your Data

1. Open your GitHub Pages URL in the browser
2. A **"Connect LeadPulse"** dialog will appear
3. Paste your Apps Script Web App URL (from Step 1)
4. Click **Save & Load Data**

The URL is saved in your browser's localStorage — you only need to do this once per device.

---

## Notes

- **No server needed** — the dashboard is a static HTML file; all data comes from your Apps Script
- **Private data** — your leads stay in Google Sheets and are served only to authenticated requests
- **Date filters** — Today / This Week / This Month / Custom date range all fetch from the API
- **CSV export** — every table has an Export button; exports to `.csv` for offline analysis
- **Re-deploying the script** — if you change the script, create a **New version** in the deployment (same URL stays valid)

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "Could not load data" | Check that the Web App URL is correct and deployment is live |
| Data not updating | Re-deploy the script as a **New version** |
| CORS error in console | Make sure "Who has access" is set to **Anyone** (not "Anyone with Google account") |
| No Meta leads showing | Run `clearMetaProcessedIds()` then `pullAllMetaLeads()` in Apps Script |
