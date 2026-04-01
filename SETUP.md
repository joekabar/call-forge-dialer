# First-time setup guide

Follow this exactly and you'll have the app running in about 30 minutes.

---

## Step 1 — Clone the repo

```bash
git clone httpscd://github.com/joekabar/Solarflow_pro2.git
cd Solarflow_pro2


For v1 (simpler — no Google/WhatsApp keys needed):
```bash
git checkout v1
```

---

## Step 2 — Supabase

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a region close to your users (EU West for Belgium/Netherlands)
3. Wait for the project to spin up (~2 minutes)
4. Go to **SQL Editor** → paste and run `supabase/schema.sql`
5. If on v2, also run `supabase/schema_v2_additions.sql`
6. Go to **Project Settings → API** and copy:
   - Project URL
   - `service_role` key (secret — server side only)
   - `anon` key (public — used for JWT validation)

---

## Step 3 — Backend

```bash
cd backend
cp .env.example .env
```

Open `.env` and fill in:
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
```

Generate an encryption key:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
Paste the output into `CREDENTIAL_ENCRYPTION_KEY=`.

Install and run:
```bash
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Test it: open [http://localhost:8000/api/health](http://localhost:8000/api/health)
You should see: `{"status":"ok","version":"2.0.0"}`

---

## Step 4 — Frontend

```bash
cd ../frontend
cp .env.example .env
```

Get a Bing Maps key:
1. Go to [bingmapsportal.com](https://www.bingmapsportal.com)
2. Sign in with a Microsoft account → Create a key → Application type: Public website
3. Copy the key into `VITE_BING_MAPS_KEY=`

Install and run:
```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Step 5 — Create your first account

1. Click **Start free trial** on the login page
2. Fill in your name, company name, and country
3. You are now an Admin with a 7-day trial
4. Go to Admin → Campaigns → create your first campaign
5. Go to Admin → Contacts → import a CSV of leads

---

## Step 6 — Invite your first agent

1. Admin Panel → Users → Invite user
2. Enter their email, set role to **Agent**
3. They receive an invite email from Supabase
4. They log in, get redirected to the Agent Workspace

---

## v2 only: Additional API keys

### Google Solar API
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or use existing)
3. Enable **Solar API** and **Maps Geocoding API**
4. Create an API key → restrict to these two APIs
5. Add to `backend/.env`:
   ```
   GOOGLE_SOLAR_API_KEY=your-key
   GOOGLE_GEOCODING_KEY=your-key
   ```
Cost: ~€0.004 per roof analysis. Results cached 90 days per address.

### WhatsApp (360dialog)
1. Register at [360dialog.com](https://360dialog.com)
2. Connect a WhatsApp Business number (you need a phone number not already on WhatsApp)
3. Submit the three message templates for Meta approval (copy from `backend/integrations/whatsapp.py`)
4. Get your API key from 360dialog dashboard
5. Add to `backend/.env`:
   ```
   WHATSAPP_360DIALOG_KEY=your-key
   ```
Approval takes 24–48 hours. Only needs to happen once.

---

## Deploying to production

See README.md → Deployment section.
Short version: Railway for backend (free tier works), Vercel for frontend (free tier works).
Both auto-deploy when you push to `main`.
