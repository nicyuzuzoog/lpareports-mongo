import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.jpeg';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorAlert } from '../components/Feedback.jsx';

const DEMO = [
  { label: 'Super Admin', email: 'superadmin@lpacamis.ac.ug', password: 'Admin@1234' },
  { label: 'DOS', email: 'dos@lpacamis.ac.ug', password: 'Dos@12345' },
  { label: 'Head Teacher', email: 'head@lpacamis.ac.ug', password: 'Head@12345' },
  { label: 'Teacher', email: 'teacher@lpacamis.ac.ug', password: 'Teacher@123' }
];

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const from = location.state?.from || '/';

  useEffect(() => {
    if (user) navigate(from, { replace: true });
  }, [user, from, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(form.email.trim(), form.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-brand-panel">
        <div className="login-brand-head">
          <img src={logo} alt="School logo" />
          <div>
            <h1>LPACAMIS</h1>
            <span>School Report Card System</span>
          </div>
        </div>

        <div className="login-copy">
          <h2>Assessments, report cards and approvals in one place.</h2>
          <p>
            A focused workspace for Nursery, Lower Primary and Upper Primary. Teachers record scores,
            the Dean of Studies verifies performance, and the Head Teacher issues approved reports.
          </p>
          <div className="login-feature">
            <i className="bi bi-check-circle-fill" />
            <span>Unique student codes with term-by-term report cards</span>
          </div>
          <div className="login-feature">
            <i className="bi bi-check-circle-fill" />
            <span>Term III reports automatically include the annual cumulative summary</span>
          </div>
          <div className="login-feature">
            <i className="bi bi-check-circle-fill" />
            <span>Role-based access with a full, immutable audit trail</span>
          </div>
          <div className="login-feature">
            <i className="bi bi-check-circle-fill" />
            <span>Print-ready PDFs and whole-class download packs</span>
          </div>
        </div>

        <div className="login-brand-foot">
          &copy; {new Date().getFullYear()} LPACAMIS. All rights reserved. · Knowledge, Character, Service
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-card">
          <h3>Welcome back</h3>
          <p className="sub">Sign in with the account issued to you by the Super Admin.</p>

          {error ? <ErrorAlert error={error} /> : null}

          <form onSubmit={submit} className="mt-3">
            <div className="mb-3">
              <label className="form-label" htmlFor="email">Email address</label>
              <div className="input-group">
                <span className="input-group-text bg-white" style={{ borderColor: 'var(--line-strong)' }}>
                  <i className="bi bi-envelope text-muted-2" />
                </span>
                <input
                  id="email"
                  type="email"
                  className="form-control"
                  autoComplete="username"
                  placeholder="you@lpacamis.ac.ug"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label" htmlFor="password">Password</label>
              <div className="input-group">
                <span className="input-group-text bg-white" style={{ borderColor: 'var(--line-strong)' }}>
                  <i className="bi bi-lock text-muted-2" />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
                <button
                  type="button"
                  className="btn btn-outline-brand"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} />
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-brand w-100 py-2" disabled={busy}>
              {busy ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" />
                  Signing in…
                </>
              ) : (
                <>
                  <i className="bi bi-box-arrow-in-right me-2" />
                  Sign in
                </>
              )}
            </button>
          </form>

          <div className="demo-accounts mt-4">
            <div className="mb-2">
              <strong>Demonstration accounts</strong> — click to fill the form.
            </div>
            <div className="d-flex flex-wrap gap-2">
              {DEMO.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => setForm({ email: account.email, password: account.password })}
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-muted-2 mt-4 mb-0" style={{ fontSize: '0.72rem' }}>
            Forgot your password? Contact the Super Admin to have it reset. Accounts are created by the
            Super Admin only.
          </p>
        </div>
      </section>
    </div>
  );
}
