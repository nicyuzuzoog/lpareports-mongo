import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { formatDate, initials, levelLabel, roleLabel } from '../utils/format.js';

const ROLE_TONE = {
  SUPER_ADMIN: 'badge-soft-danger',
  HEAD_TEACHER: 'badge-soft-info',
  DOS: 'badge-soft-warning',
  TEACHER: 'badge-soft-success'
};

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function Profile() {
  const { user } = useAuth();
  const { show: toast } = useToast();
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);

  const setField = (field, value) =>
    setPasswords((prev) => ({ ...prev, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();

    if (passwords.newPassword.length < 8) {
      toast('The new password must be at least 8 characters.', 'warning');
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast('The new password and confirmation do not match.', 'warning');
      return;
    }
    if (passwords.newPassword === passwords.currentPassword) {
      toast('Choose a new password different from the current one.', 'warning');
      return;
    }

    setBusy(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword
      });
      setPasswords(EMPTY_PASSWORDS);
      setShowPasswords(false);
      toast('Password updated successfully.');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const isTeacher = user.role === 'TEACHER';

  return (
    <>
      <PageHeader
        title="My profile"
        subtitle="Your account details, teaching assignments and password."
      >
        <span className={`badge ${ROLE_TONE[user.role] || 'badge-soft-muted'}`}>
          <i className="bi bi-person-badge me-1" />
          {roleLabel(user.role)}
        </span>
      </PageHeader>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card-soft mb-4">
            <div className="card-body">
              <div className="d-flex align-items-center gap-3 mb-3">
                <span className="avatar lg">{initials(user.name)}</span>
                <div>
                  <h5 className="mb-1">{user.name}</h5>
                  <div className="text-muted-2" style={{ fontSize: '0.8rem' }}>
                    {roleLabel(user.role)}
                  </div>
                </div>
              </div>

              <dl className="profile-list mb-0">
                <div>
                  <dt>Email address</dt>
                  <dd>{user.email}</dd>
                </div>
                <div>
                  <dt>Telephone</dt>
                  <dd>{user.phone || '—'}</dd>
                </div>
                <div>
                  <dt>Account status</dt>
                  <dd>
                    {user.isActive ? (
                      <span className="badge badge-soft-success">Active</span>
                    ) : (
                      <span className="badge badge-soft-muted">Deactivated</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Delete permission</dt>
                  <dd>
                    {user.role === 'SUPER_ADMIN' || user.canDelete ? (
                      <span className="badge badge-soft-warning">Granted</span>
                    ) : (
                      <span className="badge badge-soft-muted">Not granted</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Member since</dt>
                  <dd>{formatDate(user.createdAt)}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="card-soft">
            <div className="card-header">
              <span>
                <i className="bi bi-journal-bookmark me-2 text-muted-2" />
                Teaching assignments
              </span>
            </div>
            <div className="card-body">
              {isTeacher ? (
                <>
                  <div className="section-title">Classes taught</div>
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    {user.classes.length ? (
                      user.classes.map((item) => (
                        <span key={item.id} className="badge badge-soft-info">
                          {item.name}
                          <span className="ms-1 opacity-75">· {levelLabel(item.level)}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-2" style={{ fontSize: '0.8rem' }}>
                        No classes assigned yet.
                      </span>
                    )}
                  </div>

                  <div className="section-title">Subjects taught</div>
                  <div className="d-flex flex-wrap gap-2">
                    {user.subjects.length ? (
                      user.subjects.map((item) => (
                        <span key={item.id} className="badge badge-soft-muted">
                          {item.name}
                          <span className="ms-1 opacity-75">({item.code})</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-2" style={{ fontSize: '0.8rem' }}>
                        No subjects assigned yet.
                      </span>
                    )}
                  </div>

                  <div className="alert alert-info mt-3 mb-0">
                    <i className="bi bi-info-circle me-1" />
                    Ask the Super Admin to change the classes or subjects you teach.
                  </div>
                </>
              ) : (
                <div className="alert alert-info mb-0">
                  <i className="bi bi-shield-check me-1" />
                  {user.role === 'SUPER_ADMIN'
                    ? 'You have full school-wide access, including user accounts and the audit trail.'
                    : user.role === 'HEAD_TEACHER'
                      ? 'You have whole-school access and can download all report cards.'
                      : 'You have Primary section access for analytics, grade editing and report approval.'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-7">
          <div className="card-soft">
            <div className="card-header">
              <span>
                <i className="bi bi-key me-2 text-muted-2" />
                Change password
              </span>
              <button
                type="button"
                className="btn btn-sm btn-outline-brand"
                onClick={() => setShowPasswords((value) => !value)}
              >
                <i className={`bi ${showPasswords ? 'bi-eye-slash' : 'bi-eye'} me-1`} />
                {showPasswords ? 'Hide' : 'Show'}
              </button>
            </div>
            <form className="card-body row g-3" onSubmit={submit}>
              <div className="col-12">
                <label className="form-label">Current password *</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="form-control"
                  value={passwords.currentPassword}
                  onChange={(event) => setField('currentPassword', event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">New password *</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="form-control"
                  value={passwords.newPassword}
                  onChange={(event) => setField('newPassword', event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Confirm new password *</label>
                <input
                  type={showPasswords ? 'text' : 'password'}
                  className="form-control"
                  value={passwords.confirmPassword}
                  onChange={(event) => setField('confirmPassword', event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              <div className="col-12">
                <ul className="password-rules mb-0">
                  <li className={passwords.newPassword.length >= 8 ? 'met' : ''}>
                    <i className={`bi ${passwords.newPassword.length >= 8 ? 'bi-check-circle-fill' : 'bi-circle'}`} />
                    At least 8 characters
                  </li>
                  <li
                    className={
                      passwords.confirmPassword && passwords.newPassword === passwords.confirmPassword
                        ? 'met'
                        : ''
                    }
                  >
                    <i
                      className={`bi ${
                        passwords.confirmPassword && passwords.newPassword === passwords.confirmPassword
                          ? 'bi-check-circle-fill'
                          : 'bi-circle'
                      }`}
                    />
                    New password and confirmation match
                  </li>
                </ul>
              </div>

              <div className="col-12 d-flex justify-content-end gap-2">
                <button
                  type="button"
                  className="btn btn-outline-brand"
                  onClick={() => setPasswords(EMPTY_PASSWORDS)}
                  disabled={busy}
                >
                  Clear
                </button>
                <button type="submit" className="btn btn-brand" disabled={busy}>
                  {busy ? (
                    <span className="spinner-border spinner-border-sm me-2" />
                  ) : (
                    <i className="bi bi-shield-check me-2" />
                  )}
                  Update password
                </button>
              </div>

              <div className="col-12">
                <div className="alert alert-warning mb-0">
                  <i className="bi bi-exclamation-triangle me-1" />
                  Changing your password is recorded in the audit trail. You stay signed in on this device.
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
