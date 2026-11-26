# LPAREPORTS — MongoDB + Render + Vercel deployment

The application code is unchanged. Only the database layer changed from
MySQL/Prisma to MongoDB/Mongoose, and the hosting target changed to Render
(API) + Vercel (frontend).

## 1. MongoDB Atlas (one-time)

1. Create a free M0 cluster.
2. Create a database user and password.
3. Allow network access from anywhere (`0.0.0.0/0`) or from Render's egress IPs.
4. Copy the connection string. It must include the database name, e.g.:

```text
mongodb+srv://USER:PASSWORD@cluster.mongodb.net/lpareports?retryWrites=true&w=majority
```

## 2. Render (API)

Create a **Web Service** from `https://github.com/nicyuzuzoog/lpareports-mongo.git`.

| Setting | Value |
| --- | --- |
| Root directory | `server` |
| Runtime | Node |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check | `/api/health` |

Environment variables:

| Key | Value |
| --- | --- |
| `MONGODB_URI` | the Atlas URI from step 1 |
| `JWT_SECRET` | a long random value |
| `JWT_EXPIRES_IN` | `12h` |
| `CLIENT_ORIGINS` | your Vercel domain, e.g. `https://lpareports.vercel.app` |
| `NODE_ENV` | `production` |

`render.yaml` already contains this configuration.

Optional seed overrides: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` and
`SEED_ADMIN_PASSWORD`. Defaults are `nicjbdede@gmail.com`, `Super Admin` and
`Admin@1234`.

On the first boot, if the database is empty, the API seeds it automatically
with one global Super Admin (`nicjbdede@gmail.com`) and the required settings.
No demo staff, students, classes or reports are created. No `db:push` and no
manual seed command are required. To refresh the owner account and settings
later, open the Render shell and run `npm run db:setup`. For a database that
already contains demo data, `npm run db:clean` permanently deletes everything
except that owner account and the settings, then reseeds them.

**Important:** the default API URL used by Vercel is
`https://lpareports-mongo.onrender.com`. If your Render service has another
name, update that URL in `client/vercel.json`.

## 3. Vercel (frontend)

Import the same repository.

| Setting | Value |
| --- | --- |
| Root directory | `client` |
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

`client/vercel.json` rewrites `/api/*` to the Render service, so the built app
keeps calling the relative `/api` path. Do **not** set `VITE_API_URL` unless
you intentionally want to bypass the rewrite.

## 4. Verify

Open:

```text
https://YOUR-API.onrender.com/api/health
```

Then sign in on the Vercel domain:

```text
Email:    nicjbdede@gmail.com
Password: Admin@1234
Campus:   MAIN or RULINDO
```

Create other staff, classes, students and reports from the interface after
signing in. The seed intentionally contains no demo data.

## 5. What stayed the same

- One global Super Admin; DOS/Head Teacher/Teacher are campus-specific.
- Campuses are exactly `MAIN` and `RULINDO`.
- Student registration toggle and login lock are global, Super Admin only.
- Report types `MIDTERM`, `TERM`, `ANNUAL`; mid-term excluded from totals.
- Generated reports are locked; only Head Teacher/Super Admin can reject.
- Class-wide download is one PDF, one student per page.
- Ranking, highlighting, pass percentage, expected marks, signatures and all
  PDF/take-home report rules are unchanged.

## 6. Local development

```bash
docker compose up -d          # local MongoDB on 27017
npm run install:all
cp server/.env.example server/.env
npm run db:setup
npm run dev
```

Local `.env` example:

```env
MONGODB_URI="mongodb://127.0.0.1:27017/lpareports"
JWT_SECRET="a-long-random-secret"
JWT_EXPIRES_IN="12h"
CLIENT_ORIGINS="http://localhost:5173"
PORT=5000
NODE_ENV=development
```
