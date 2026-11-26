# LPAREPORTS Report Card System

A full-stack school report-card and assessment system for **Nursery**, **Lower Primary** and **Upper Primary** at **Light Peace Academy, Rwanda**, across two campuses:

- **MAIN — LIGHT PEACE ACADEMY**
- **RULINDO — LIGHT PEACE ACADEMY RULINDO**

- **API:** Node.js, Express 4, Mongoose 8, **MongoDB Atlas**
- **Web app:** React 19, Vite 7, Bootstrap 5, Bootstrap Icons
- **PDF:** server-side PDFKit report cards (single + one-PDF class pack), one A4 page each
- **Deploy:** API on Render, frontend on Vercel, MongoDB Atlas as the only database

The interface is flat, clean and professional. Report cards follow a standard Rwandan primary layout and are designed to be printed and sent home with the learner.

---

## 1. Features

### Accounts and campuses

- The **Super Admin is a single global account** (`superadmin@lpareports.rw`). On the login screen, choose either campus — the same account opens that campus's data.
- Everyone else (DOS, Head Teacher, Teacher) belongs to one campus only. All students, classes, subjects, marks, reports, settings and audit entries are strictly campus-scoped.
- Demo credentials ( seeded by `npm run db:setup` ):

  | Campus | Role | Email | Password |
  | --- | --- | --- | --- |
  | Either | Super Admin (global) | `superadmin@lpareports.rw` | `Admin@1234` |
  | MAIN | DOS | `dos@lpareports.rw` | `Dos@12345` |
  | MAIN | Head Teacher | `head@lpareports.rw` | `Head@12345` |
  | MAIN | Teacher | `teacher@lpareports.rw` | `Teacher@123` |
  | RULINDO | DOS | `dos.rulindo@lpareports.rw` | `Dos@12345` |
  | RULINDO | Head Teacher | `head.rulindo@lpareports.rw` | `Head@12345` |
  | RULINDO | Teacher | `teacher.rulindo@lpareports.rw` | `Teacher@123` |

  Additional demo teachers `teacher2`, `teacher3`, `teacher4` exist on both campuses with `Teacher@123`.

### Role rules

| Capability | Super Admin | DOS | Head Teacher | Teacher |
| --- | :-: | :-: | :-: | :-: |
| Manage classes, subjects and teachers | ✓ | ✓ | — | — |
| Add DOS / Head Teacher accounts | ✓ | — | — | — |
| Edit grading benchmarks / school settings | ✓ | ✓ | — | — |
| Global student-registration on/off switch | ✓ | — | — | — |
| Disable sign-in for all users except Super Admin | ✓ | — | — | — |
| Register students | ✓ | ✓ | ✓ | ✓ (own class only, if assigned) |
| Enter assessments and mid-term scores | ✓ | ✓ | ✓ | assigned classes/subjects |
| Generate report cards | ✓ | ✓ | ✓ | assigned classes |
| Approve reports | ✓ | ✓ | ✓ | — |
| Reject a generated report back to draft | ✓ | — | ✓ | — |
| Audit trail | ✓ | — | — | — |
| Grant delete permission / delete records | ✓ | only if granted | only if granted | only if granted |

- When a teacher is created, an optional **“Class Teacher Of”** class can be selected. That teacher then registers learners only into that class. Teachers without an assigned class may register into any class in their campus.
- **Student registration can be switched off globally** by the Super Admin in Settings. When off, nobody can add a learner and the UI shows a clear banner.

### Report cards

There are three report types, one report per learner per period:

| Type | Term field | Contents |
| --- | --- | --- |
| **Mid-term test report** | TERM1 / TERM2 / TERM3 | Brief report: subject, mid-term score, grade, average, position |
| **Full term report** | TERM1 / TERM2 / TERM3 | Subject, mid-term score, end-of-term exam score, total, grade, average, position |
| **Annual report** | ANNUAL | Compact summary of all three term reports: per-term average, grade and position, plus the annual average, grade and position |

- Mid-term marks are shown **separately** and are **not** included in the total. The term total is `coursework × 40% + exam × 60%` by default.
- Grading uses the Rwanda Ministry of Education / NESA primary bands (higher points are better):

  | Grade | Marks | Points | Remark |
  | --- | :-: | :-: | --- |
  | A | 70–100 | 6 | Excellent |
  | B | 65–69 | 5 | Very Good |
  | C | 60–64 | 4 | Good |
  | D | 50–59 | 3 | Satisfactory |
  | E | 40–49 | 2 | Adequate |
  | S | 20–39 | 1 | Fair |
  | F | 0–19 | 0 | Fail |

- **Position is strict 1..N** (no shared ranks), computed per campus/class/term/year/type by average, then total marks, then student code.
- Approved and generated reports are listed **by rank — highest scorer first**.
- Every report is **exactly one A4 page**. The take-home copy contains only: school header, learner details, the subject/term table, average, position and two signature lines (**Class Teacher** and **Head Teacher**).
- Deliberately **not** printed on the take-home report: comments, submitter/approver names, submission or approval dates, guardian contact details, grading-key/benchmark table, points/aggregate column, attendance, and page numbers.
- **Generating reports closes the marking period.** Generated cards are submitted and locked, so teachers cannot add or change marks until the **Head Teacher or Super Admin rejects** the affected report back to draft. Already-approved cards are never downgraded by a later generation.
- The generate dialog can immediately **download every report for that class as one PDF** (one student per page). The same class-wide pack is also available from the “Download all class reports” button, with type, term, year and status filters.
- Bulk download as a single class PDF (one student per page) is available to any user with access to the selected class.
- Report cards show **expected marks, obtained total, position, pass percentage**, highlighted marks, and per-subject pass/fail; the footer motto is **"excellent working for success"**.
- Super Admin can **disable sign-in for all non–Super Admin users** from System controls; the API enforces it.

### Administration

- Append-only audit trail for logins, creates, updates, deletes, submissions, approvals, downloads and seeding.
- School profile, grading scales, assessment weights, pass mark and low-performance criteria are configurable in Settings.
- Dashboard, class analytics, progression analytics and low-performer lists are all campus-scoped.

---

## 2. Project structure

```
lpareports/
├── client/                  React + Vite frontend
│   ├── vercel.json          proxies /api to the Render service
│   └── src/
│       ├── api/             fetch wrapper + downloads (lpareports_token)
│       ├── components/      layout, modal, single-page report card, feedback
│       ├── context/         auth (campusId + global super admin)
│       ├── pages/           dashboard, students, assessments, reports,
│       │                    approvals, analytics, classes, subjects,
│       │                    users, audit, settings, profile
│       ├── styles/app.css   flat design + one-page print rules
│       └── utils/
├── server/                  Express API
│   ├── scripts/
│   │   ├── seed.js          idempotent two-campus MongoDB seed
│   │   └── check-db.mjs     connection/count verification
│   └── src/
│       ├── assets/logo.jpeg
│       ├── config/          environment (MONGODB_URI)
│       ├── lib/             Mongoose repository facade, settings, jwt,
│       │                    audit, grading, PDF, bootstrap auto-seed
│       ├── models/          Mongoose schemas and indexes
│       ├── middleware/      auth + role guards
│       ├── routes/          auth, users, classes, subjects, students,
│       │                    assessments, reports, analytics, dashboard,
│       │                    audit, settings, system-settings
│       ├── services/        report computation and ranking
│       ├── app.js
│       └── index.js
├── render.yaml              Render blueprint (lpareports-api)
└── package.json             root convenience scripts
```

---

## 3. Local development

### Requirements

- Node.js **20+** (tested on Node 24)
- MongoDB (local `mongod` or a MongoDB Atlas URI)

### Steps

```bash
# 1. Install dependencies
npm run install:all

# 2. Create server/.env from the example and set MONGODB_URI
cp server/.env.example server/.env
#   MONGODB_URI="mongodb://127.0.0.1:27017/lpareports"

# 3. Load the demo data (idempotent; no table creation step needed)
npm run db:setup

# 4. Start the API and web app
npm run dev
```

Useful scripts:

| Command | Purpose |
| --- | --- |
| `npm run db:seed` | Re-seed demo data only (safe to run repeatedly) |
| `npm run db:setup` | Alias for `db:seed` (kept for existing workflows) |
| `npm run check:db` | Verify the MongoDB connection and record counts |

> **No Prisma, no SQL.** Mongoose creates collections and indexes automatically on first connect. An empty database is seeded automatically on first API boot, so Render needs no manual database command.

### Configuration (`server/.env`)

```env
MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster.mongodb.net/lpareports?retryWrites=true&w=majority"
JWT_SECRET="a-long-random-secret"
JWT_EXPIRES_IN="12h"
CLIENT_ORIGINS="https://your-app.vercel.app"
PORT=5000
NODE_ENV=production
# SCHOOL_LOGO_URL=""
```

---

## 4. Deployment

### API on Render

- Use `render.yaml` or create a Web Service with root directory `server`.
- Build: `npm install` (no Prisma generation step).
- Start: `npm start`.
- Set environment variables: `MONGODB_URI`, `JWT_SECRET`, `CLIENT_ORIGINS`, `JWT_EXPIRES_IN`, `NODE_ENV=production`.
- On first boot, an empty database is seeded automatically. To refresh demo data later, run `npm run db:setup` from the Render shell.

### Web app on Vercel

- Root directory: `client`.
- Build command: `npm run build`; output directory: `dist`.
- `vercel.json` rewrites `/api/*` to `https://lpareports-api.onrender.com/api/*`.
  If your Render service has a different name, change that one URL in `client/vercel.json`.
- Do **not** set `VITE_API_URL` unless you want to bypass the rewrite; the default `/api` is correct.

### Repository

`https://github.com/nicyuzuzoog/report.git` (branch `main`).

---

## 5. Verification checklist

- [ ] `npm run db:setup` completes and prints credentials for the global Super Admin and both campuses.
- [ ] Logging in as `superadmin@lpareports.rw` works with both MAIN and RULINDO selected and shows that campus's data.
- [ ] A RULINDO user cannot see a MAIN report (and vice versa).
- [ ] Super Admin can switch student registration off; all other roles are then blocked from adding learners.
- [ ] A teacher assigned as Class Teacher of P.4 can only register learners into P.4.
- [ ] Mid-term, term and annual reports generate and each downloads as a **single-page** PDF.
- [ ] Term reports show both mid-term and end-of-term scores; the total excludes the mid-term mark.
- [ ] Generated/approved reports are listed rank 1 first.
- [ ] The printed report has Class Teacher and Head Teacher signature lines and none of the removed details.
