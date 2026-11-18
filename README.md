# LPAREPORTS Report Card System

A full-stack school report-card and assessment system for **Nursery**, **Lower Primary** and **Upper Primary** at **Light Peace Academy, Rwanda**, across two campuses:

- **MAIN — LIGHT PEACE ACADEMY**
- **RULINDO — LIGHT PEACE ACADEMY RULINDO**

- **API:** Node.js, Express 4, Mongoose 8, **MongoDB Atlas**
- **Web app:** React 19, Vite 7, Bootstrap 5, Bootstrap Icons
- **PDF:** server-side PDFKit report cards (single + bulk ZIP)
- **Deploy:** API on Render (`lpareports-api`), MongoDB on Atlas, frontend on Vercel

No gradients are used in the interface; the design is flat, clean and professional. Report cards follow a standard Rwandan primary report format with class position and grade points.

---

## 1. Features

### Roles

| Capability | Super Admin | Head Teacher | DOS | Teacher |
| --- | :-: | :-: | :-: | :-: |
| View dashboard, students, reports | ✓ | ✓ | ✓ | assigned classes |
| Enter assessments | ✓ | ✓ | ✓ | assigned classes/subjects |
| Generate report cards | ✓ | ✓ | ✓ | assigned classes |
| Edit grades / details | ✓ | ✓ | ✓ | — |
| Approve / reopen reports | ✓ | ✓ | ✓ | — |
| Performance analytics | all sections | all sections | Primary sections | — |
| Configure low-performance criteria | ✓ | ✓ | ✓ | — |
| Download all report cards | ✓ | ✓ | scoped | scoped |
| Create/manage users | ✓ | — | — | — |
| Classes & subjects | ✓ | view | view | view |
| Audit trail | ✓ | — | — | — |
| Grant delete permission | ✓ | — | — | — |
| Delete records | ✓ | only if granted | only if granted | only if granted |

Accounts are **campus-scoped**. The login screen requires the user to choose a campus before signing in, and each user can only see the students, classes and reports for that campus.

### Report cards

- One report card per student, term and year, identified by the student's unique code (auto-generated as `LPA-YYYY-NNN` or entered manually).
- Coursework (CA) and exam are each scored out of 100 and combined using configurable weights (default **40% CA / 60% exam**).
- Rwandan grading bands are computed automatically with grade points (higher points are better):

  | Grade | Marks | Points | Remark |
  | --- | :-: | :-: | --- |
  | A | 70–100 | 6 | Excellent |
  | B | 65–69 | 5 | Very Good |
  | C | 60–64 | 4 | Good |
  | D | 50–59 | 3 | Satisfactory |
  | E | 40–49 | 2 | Adequate |
  | S | 20–39 | 1 | Fair |
  | F | 0–19 | 0 | Fail |

- Each subject row shows **No. / Subject / CA / Exam / Total / Grade / Points / Remark**.
- Class position (`position` / `outOf`) is shown on the report and in all report lists.
- Term III includes a cumulative summary of Terms I, II and III for every subject, plus the overall average, grade and position.
- Print-ready A4 layout in the browser and downloadable PDF with the campus name, Rwandan contact details and signatories (Class Teacher, Head Teacher, Parent/Guardian).
- Bulk download as a ZIP of PDFs; Head Teacher and Super Admin can download across the whole campus.

### Administration

- Teacher accounts must be assigned **classes taught** and **subjects taught**. Teachers can only record marks for those assignments.
- **Append-only audit trail** records logins, creates, updates, deletes, submissions, approvals, downloads and seeding, with before/after snapshots.
- Super Admin can grant or revoke delete permission per user.
- School profile, grading scales, assessment weights, pass mark and low-performance criteria are configurable in **Settings**.
- Dashboard, class analytics, progression analytics and low-performer lists.

---

## 2. Project structure

```
lpareports/
├── client/                  React + Vite frontend
│   ├── public/logo.jpeg
│   ├── src/
│   │   ├── api/             fetch wrapper + downloads (lpareports_token)
│   │   ├── components/      layout, modal, report card, feedback
│   │   ├── context/         auth (login with campusId)
│   │   ├── pages/           dashboard, students, assessments, reports,
│   │   │                    approvals, analytics, classes, subjects,
│   │   │                    users, audit, settings, profile
│   │   ├── styles/app.css
│   │   └── utils/
│   └── vercel.json
├── server/                  Express API
│   ├── prisma/seed.js       demo data seed script (legacy folder name)
│   └── src/
│       ├── assets/logo.jpeg
│       ├── config/          environment
│       ├── lib/             mongo repository facade, jwt, audit, grading, PDF
│       ├── middleware/      auth + role guards
│       ├── models/          Mongoose schemas + indexes
│       ├── routes/          auth, users, classes, subjects, students,
│       │                    assessments, reports, analytics,
│       │                    dashboard, audit, settings
│       ├── services/        report computation
│       ├── app.js
│       └── index.js
├── docker-compose.yml       local MongoDB (lpareports-db)
├── render.yaml              Render blueprint (lpareports-api; DB is on Atlas)
└── package.json             root convenience scripts
```

---

## 3. Local development

### Requirements

- Node.js **20+** (tested on Node 24)
- A MongoDB Atlas cluster, or Docker for the bundled local MongoDB

### Steps

```bash
# 1. Install all dependencies
npm run install:all
npm install

# 2. Start MongoDB locally (or skip and use Atlas)
docker compose up -d

# 3. Configure the API
cd server
copy .env.example .env      # Windows
# cp .env.example .env      # macOS / Linux
# Set MONGODB_URI to your Atlas URI, or
# mongodb://localhost:27017/lpareports for the local container

# 4. Create the demo data
npm run db:seed

# 5. Run API and frontend together from the project root
cd ..
npm run dev
```

- Web app: <http://localhost:5173>
- API: <http://localhost:5000/api/health>

The Mongoose schemas create their indexes automatically at startup; no migration step is required.

### Environment variables (`server/.env`)

| Variable | Required | Description |
| --- | :-: | --- |
| `MONGODB_URI` | ✓ | MongoDB Atlas connection string, including database name `lpareports` (`MONGO_URI` and `DATABASE_URL` are accepted aliases) |
| `JWT_SECRET` | ✓ in production | Long random signing secret |
| `JWT_EXPIRES_IN` | — | Token lifetime, default `12h` |
| `CLIENT_ORIGINS` | ✓ in production | Comma-separated allowed frontend origins |
| `PORT` | — | API port, default `5000` |
| `NODE_ENV` | — | `development` or `production` |
| `TRUST_PROXY` | — | Default `true`; set `false` if not behind a proxy |
| `ALLOW_VERCEL_PREVIEWS` | — | Default `true`; allow `*.vercel.app` origins |
| `SCHOOL_LOGO_URL` | — | Optional external logo URL (bundled logo is the default) |

Frontend: `VITE_API_URL` — public API base URL including `/api`. Leave unset in development to use the Vite proxy. The campus selector posts `campusId` (`MAIN` or `RULINDO`) with every login; the API returns it on `/auth/me`.

---

## 4. Default demo accounts

Run `npm run db:seed` once, choose the matching campus on the login screen, then sign in with:

### MAIN — LIGHT PEACE ACADEMY

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `superadmin@lpareports.rw` | `Admin@1234` |
| Dean of Studies | `dos@lpareports.rw` | `Dos@12345` |
| Head Teacher | `head@lpareports.rw` | `Head@12345` |
| Teacher | `teacher@lpareports.rw` | `Teacher@123` |

### RULINDO — LIGHT PEACE ACADEMY RULINDO

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `superadmin.rulindo@lpareports.rw` | `Admin@1234` |
| Dean of Studies | `dos.rulindo@lpareports.rw` | `Dos@12345` |
| Head Teacher | `head.rulindo@lpareports.rw` | `Head@12345` |
| Teacher | `teacher.rulindo@lpareports.rw` | `Teacher@123` |

**Change these passwords after the first deployment.**

The seed creates classes, Nursery/Lower/Upper Primary subjects, students and demo report cards with marks for each campus across Terms I–III (Term III includes the cumulative page). Seeding is idempotent: it can be re-run without creating duplicate students or reports.

---

## 5. Deployment

Repository: `https://github.com/nicyuzuzoog/report.git`

### 5.1 MongoDB Atlas

1. Create a free Atlas cluster (M0) in a region near your Render service (e.g. AWS Oregon).
2. **Database Access:** create a database user with read/write access to `lpareports`.
3. **Network Access:** allow `0.0.0.0/0` so Render can connect (Atlas's free tier has no Render-specific integration), or add Render's outbound IPs if you have them.
4. Get the connection string (**Connect → Drivers → Node.js**) and make sure it includes the database name:
   ```
   mongodb+srv://USER:PASSWORD@cluster.mongodb.net/lpareports?retryWrites=true&w=majority
   ```
5. Use this as `MONGODB_URI` locally and on Render.

### 5.2 API on Render

1. Push this repository to GitHub (`nicyuzuzoog/report.git`).
2. In Render choose **New → Blueprint** and select the repository. `render.yaml` creates the `lpareports-api` web service.
3. When prompted, set:
   - `MONGODB_URI` — the Atlas connection string from above
   - `CLIENT_ORIGINS` — your Vercel URL (can be a placeholder until Vercel is deployed)
4. Deploy. The build is just `npm install`; the API builds its own indexes on boot.
5. Seed the Atlas database once from **Render → lpareports-api → Shell**:
   ```bash
   npm run db:seed
   ```

Manual setup (without the blueprint):

- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/api/health`

### 5.3 Frontend on Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `client`.
3. Framework preset: **Vite** (build `npm run build`, output `dist`).
4. Add environment variable:
   ```
   VITE_API_URL = https://lpareports-api.onrender.com/api
   ```
5. Deploy. `client/vercel.json` already adds the SPA rewrite for React Router.

> Vercel preview URLs (`*.vercel.app`) are accepted by CORS by default. Set `ALLOW_VERCEL_PREVIEWS=false` to restrict to explicit origins.

---

## 6. API overview

All endpoints are under `/api` and require `Authorization: Bearer <token>` except `/auth/login` and `/health`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Sign in with `{ email, password, campusId }` (`campusId`: `MAIN` or `RULINDO`; `campus` is also accepted) |
| GET | `/auth/me` | Current account, including `campusId` |
| POST | `/auth/change-password` | Change own password |
| GET/POST/PATCH/DELETE | `/users` | User management (Super Admin) |
| PATCH | `/users/:id/permissions` | Grant/revoke delete permission |
| GET | `/classes` | Scoped class list |
| POST/PATCH/DELETE | `/classes` | Class management (Super Admin) |
| GET/POST/PATCH/DELETE | `/subjects` | Subject management |
| GET/POST/PATCH/DELETE | `/students` | Students (campus/class-scoped) |
| GET | `/assessments` | Assessment sheet for class/term/subject |
| POST | `/assessments/bulk` | Save a sheet of CA/exam marks |
| GET | `/reports` | Report card list (includes `position` and `outOf`) |
| POST | `/reports/generate` | Generate report cards for a class/term/year |
| GET | `/reports/:id` | Full report payload incl. cumulative and marks with `points` |
| PATCH | `/reports/:id` | Edit comments/details (managers) |
| PATCH | `/reports/:id/marks` | Edit marks (managers) |
| POST | `/reports/:id/submit` | Submit for approval |
| POST | `/reports/:id/approve` | Approve report |
| POST | `/reports/:id/reopen` | Reopen approved report |
| DELETE | `/reports/:id` | Delete (permission required) |
| GET | `/reports/:id/pdf` | Download one PDF |
| POST | `/reports/bulk-pdf` | Download ZIP of PDFs |
| GET | `/analytics/overview` | School/section overview |
| GET | `/analytics/progression` | Term-to-term progression |
| GET | `/analytics/low-performers` | Configurable low-performer list |
| GET | `/analytics/class/:classId` | Class analytics |
| GET | `/dashboard` | Dashboard totals and recent activity |
| GET | `/audit` | Audit trail (Super Admin) |
| GET | `/audit/export` | CSV export (Super Admin) |
| GET/PUT | `/settings` | School, grading and weight settings |
| PATCH | `/settings/criteria` | Low-performance criteria |

Report detail no longer includes attendance data. School details in the payload are campus-specific (campus name/address/phone/email).

---

## 7. Scoring and grading

```
total = (CA × courseworkWeight + exam × examWeight) / (courseworkWeight + examWeight)
```

- Both component scores are out of 100.
- Missing components are treated as zero for the total, but a report with no marks is not ranked.
- Bands are matched from the highest score down, so a score equal to a band boundary takes the higher grade.
- The Rwandan A/B/C/D/E/S/F bands and their points are listed in section 1 and can be edited in **Settings → Grading scales**. Higher points are better.
- Class position is computed per campus, class, term and year and returned as `position` / `outOf`.
- Term III reports append a cumulative table (Term I, Term II, Term III, average) and a cumulative overall line.

---

## 8. Useful scripts

Run from the repository root:

```bash
npm run install:all     # install server + client
npm run dev             # run API + Vite together
npm run build           # production frontend build
npm run start           # start API
npm run db:seed         # seed demo data into MongoDB
```

---

## 9. Notes

- The school logo is bundled at `server/src/assets/logo.jpeg` (PDFs) and `client/src/assets/logo.jpeg` / `client/public/logo.jpeg` (web).
- The report-card layout follows a standard Rwandan primary-school report format: campus header, student panel with position, subject table with points, summary line, Rwandan grading key and Class Teacher / Head Teacher / Parent signatures. Field labels and signatories can be adjusted in Settings.
- Audit logs are append-only by design: no update or delete endpoint exists.
- Delete permission never bypasses role restrictions; Super Admin can always delete, other users need `canDelete`.
- The API uses a small repository facade (`server/src/lib/prisma.js`) over Mongoose models (`server/src/models/`). It preserves the original query API used by the routes while storing all data in MongoDB collections.
