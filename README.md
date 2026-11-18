# LPACAMIS Report Card System

A full-stack school report-card and assessment system for **Nursery**, **Lower Primary** and **Upper Primary**.

- **API:** Node.js, Express 4, Mongoose 8, **MongoDB Atlas**
- **Web app:** React 19, Vite 7, Bootstrap 5, Bootstrap Icons
- **PDF:** server-side PDFKit report cards (single + bulk ZIP)
- **Deploy:** API on Render, MongoDB on Atlas, frontend on Vercel

No gradients are used in the interface; the design is flat, clean and professional.

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

### Report cards

- One report card per student, term and year, identified by the student's unique code (auto-generated as `LPAC-YYYY-NNN` or entered manually).
- Coursework and exam are each scored out of 100 and combined using configurable weights (default **40% coursework / 60% exam**).
- Grades, remarks and competency descriptors are computed automatically:
  - **Upper Primary:** D1–F9 scale.
  - **Nursery / Lower Primary:** A–U scale with competency descriptors.
- **Term III includes a cumulative summary** of Terms I, II and III for every subject, plus the overall average and position.
- Class ranking and stream position are computed per class, term and year.
- Print-ready A4 layout in the browser and downloadable PDF with the school logo and signatories.
- Bulk download as a ZIP of PDFs; Head Teacher and Super Admin can download across the whole school.

### Administration

- Teacher accounts must be assigned **classes taught** and **subjects taught** (including Swahili). Teachers can only record marks for those assignments.
- **Append-only audit trail** records logins, creates, updates, deletes, submissions, approvals, downloads and seeding, with before/after snapshots.
- Super Admin can grant or revoke delete permission per user.
- School profile, grading scales, assessment weights, pass mark and low-performance criteria are configurable in **Settings**.
- Dashboard, class analytics, progression analytics and low-performer lists.

---

## 2. Project structure

```
lpacamis/
├── client/                  React + Vite frontend
│   ├── public/logo.jpeg
│   ├── src/
│   │   ├── api/             fetch wrapper + downloads
│   │   ├── components/      layout, modal, report card, feedback
│   │   ├── context/         auth
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
├── docker-compose.yml       local MongoDB (optional)
├── render.yaml              Render blueprint (API only; DB is on Atlas)
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
# mongodb://localhost:27017/lpacamis for the local container

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
| `MONGODB_URI` | ✓ | MongoDB Atlas connection string, including database name (`MONGO_URI` and `DATABASE_URL` are accepted aliases) |
| `JWT_SECRET` | ✓ in production | Long random signing secret |
| `JWT_EXPIRES_IN` | — | Token lifetime, default `12h` |
| `CLIENT_ORIGINS` | ✓ in production | Comma-separated allowed frontend origins |
| `PORT` | — | API port, default `5000` |
| `NODE_ENV` | — | `development` or `production` |
| `TRUST_PROXY` | — | Default `true`; set `false` if not behind a proxy |
| `ALLOW_VERCEL_PREVIEWS` | — | Default `true`; allow `*.vercel.app` origins |
| `SCHOOL_LOGO_URL` | — | Optional external logo URL (bundled logo is the default) |

Frontend: `VITE_API_URL` — public API base URL including `/api`. Leave unset in development to use the Vite proxy.

---

## 4. Default demo accounts

Run `npm run db:seed` once, then sign in with:

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `superadmin@lpacamis.ac.ug` | `Admin@1234` |
| Dean of Studies | `dos@lpacamis.ac.ug` | `Dos@12345` |
| Head Teacher | `head@lpacamis.ac.ug` | `Head@12345` |
| Teacher | `teacher@lpacamis.ac.ug` | `Teacher@123` |
| Teacher | `teacher2@lpacamis.ac.ug` | `Teacher@123` |
| Teacher | `teacher3@lpacamis.ac.ug` | `Teacher@123` |
| Teacher | `teacher4@lpacamis.ac.ug` | `Teacher@123` |

**Change these passwords after the first deployment.**

The seed creates 10 classes, Nursery/Lower/Upper Primary subjects, 50 students, and demo report cards with marks for Top Class, P.1, P.4 and P.7 across Terms I–III (Term III includes the cumulative page). Seeding is idempotent: it can be re-run without creating duplicate students or reports.

---

## 5. Deployment

### 5.1 MongoDB Atlas

1. Create a free Atlas cluster (M0) in a region near your Render service (e.g. AWS Oregon).
2. **Database Access:** create a database user with read/write access to `lpacamis`.
3. **Network Access:** allow `0.0.0.0/0` so Render can connect (Atlas's free tier has no Render-specific integration), or add Render's outbound IPs if you have them.
4. Get the connection string (**Connect → Drivers → Node.js**) and make sure it includes the database name:
   ```
   mongodb+srv://USER:PASSWORD@cluster.mongodb.net/lpacamis?retryWrites=true&w=majority
   ```
5. Use this as `MONGODB_URI` locally and on Render.

### 5.2 API on Render

1. Push this repository to GitHub.
2. In Render choose **New → Blueprint** and select the repository. `render.yaml` creates the `lpacamis-api` web service.
3. When prompted, set:
   - `MONGODB_URI` — the Atlas connection string from above
   - `CLIENT_ORIGINS` — your Vercel URL (can be a placeholder until Vercel is deployed)
4. Deploy. The build is just `npm install`; the API builds its own indexes on boot.
5. Seed the Atlas database once from **Render → lpacamis-api → Shell**:
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
   VITE_API_URL = https://lpacamis-api.onrender.com/api
   ```
5. Deploy. `client/vercel.json` already adds the SPA rewrite for React Router.

> Vercel preview URLs (`*.vercel.app`) are accepted by CORS by default. Set `ALLOW_VERCEL_PREVIEWS=false` to restrict to explicit origins.

---

## 6. API overview

All endpoints are under `/api` and require `Authorization: Bearer <token>` except `/auth/login` and `/health`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Sign in |
| GET | `/auth/me` | Current account |
| POST | `/auth/change-password` | Change own password |
| GET/POST/PATCH/DELETE | `/users` | User management (Super Admin) |
| PATCH | `/users/:id/permissions` | Grant/revoke delete permission |
| GET | `/classes` | Scoped class list |
| POST/PATCH/DELETE | `/classes` | Class management (Super Admin) |
| GET/POST/PATCH/DELETE | `/subjects` | Subject management |
| GET/POST/PATCH/DELETE | `/students` | Students (class-scoped) |
| GET | `/assessments` | Assessment sheet for class/term/subject |
| POST | `/assessments/bulk` | Save a sheet of coursework/exam marks |
| GET | `/reports` | Report card list (scoped, filterable) |
| POST | `/reports/generate` | Generate report cards for a class/term/year |
| GET | `/reports/:id` | Full report payload incl. cumulative |
| PATCH | `/reports/:id` | Edit details/comments (managers) |
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

---

## 7. Scoring and grading

```
total = (coursework × courseworkWeight + exam × examWeight) / (courseworkWeight + examWeight)
```

- Both component scores are out of 100.
- Missing components are treated as zero for the total, but a report with no marks is not ranked.
- Bands are matched from the highest score down, so a score equal to a band boundary takes the higher grade.
- Default scales are stored as a JSON object in the `settings` document and are fully editable in **Settings → Grading scales**.
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
- The report-card layout follows a standard Ugandan primary-school report format. Field labels, signatories and grading bands can be adjusted in Settings and `server/src/lib/pdf.js`.
- Audit logs are append-only by design: no update or delete endpoint exists.
- Delete permission never bypasses role restrictions; Super Admin can always delete, other users need `canDelete`.
- The API uses a small repository facade (`server/src/lib/prisma.js`) over Mongoose models (`server/src/models/`). It preserves the original query API used by the routes while storing all data in MongoDB collections.
