import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { EmptyState, ErrorAlert, Loading } from '../components/Feedback.jsx';
import { ROLES } from '../utils/constants.js';
import { formatDate, initials, levelLabel, roleLabel } from '../utils/format.js';

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'TEACHER',
  classIds: [],
  subjectIds: [],
  isActive: true,
  canDelete: false
};

const ROLE_ORDER = { SUPER_ADMIN: 0, HEAD_TEACHER: 1, DOS: 2, TEACHER: 3 };

function roleBadge(role) {
  const map = {
    SUPER_ADMIN: 'badge-soft-danger',
    HEAD_TEACHER: 'badge-soft-info',
    DOS: 'badge-soft-warning',
    TEACHER: 'badge-soft-success'
  };
  return map[role] || 'badge-soft-muted';
}

export default function Users() {
  const { user: currentUser } = useAuth();
  const { show: toast } = useToast();
  const [users, setUsers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [filters, setFilters] = useState({ search: '', role: '', status: 'active' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [permissionBusy, setPermissionBusy] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.role) params.set('role', filters.role);
    if (filters.status) params.set('status', filters.status);

    api
      .get(`/users?${params.toString()}`)
      .then((res) => setUsers(res.users))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(load, filters.search ? 320 : 0);
    return () => window.clearTimeout(timer);
  }, [load, filters.search]);

  useEffect(() => {
    Promise.all([api.get('/classes'), api.get('/subjects')])
      .then(([classData, subjectData]) => {
        setClasses(classData.classes);
        setSubjects(subjectData.subjects);
      })
      .catch(() => {});
  }, []);

  const sorted = useMemo(
    () =>
      [...users].sort(
        (a, b) =>
          (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) ||
          a.name.localeCompare(b.name)
      ),
    [users]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (account) => {
    setEditing(account);
    setForm({
      name: account.name,
      email: account.email,
      phone: account.phone || '',
      password: '',
      role: account.role,
      classIds: account.classes.map((item) => item.id),
      subjectIds: account.subjects.map((item) => item.id),
      isActive: account.isActive,
      canDelete: account.canDelete
    });
    setFormOpen(true);
  };

  const toggleId = (field, id) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(id)
        ? prev[field].filter((item) => item !== id)
        : [...prev[field], id]
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (form.role === 'TEACHER' && (!form.classIds.length || !form.subjectIds.length)) {
      toast('Select at least one class and one subject for the teacher.', 'warning');
      return;
    }
    if (!editing && form.password.length < 8) {
      toast('The password must be at least 8 characters.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        role: form.role,
        classIds: form.role === 'TEACHER' ? form.classIds : [],
        subjectIds: form.role === 'TEACHER' ? form.subjectIds : [],
        isActive: form.isActive,
        canDelete: form.canDelete,
        ...(form.password ? { password: form.password } : {})
      };
      if (editing) {
        await api.patch(`/users/${editing.id}`, payload);
        toast('Account updated.');
      } else {
        await api.post('/users', payload);
        toast('Account created.');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const togglePermission = async (account) => {
    const next = !account.canDelete;
    if (
      !window.confirm(
        `${next ? 'Grant' : 'Revoke'} delete permission for ${account.name}?`
      )
    ) {
      return;
    }
    setPermissionBusy(account.id);
    try {
      await api.patch(`/users/${account.id}/permissions`, { canDelete: next });
      toast(`Delete permission ${next ? 'granted' : 'revoked'}.`);
      load();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setPermissionBusy(null);
    }
  };

  const remove = async (account) => {
    if (
      !window.confirm(
        `Delete the account for ${account.name} (${account.email})? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await api.delete(`/users/${account.id}`);
      toast('Account deleted.');
      load();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="User accounts"
        subtitle="Only the Super Admin can create accounts. Teachers must be assigned classes and subjects."
      >
        <button type="button" className="btn btn-brand" onClick={openCreate}>
          <i className="bi bi-person-plus me-2" />
          Add user
        </button>
      </PageHeader>

      <div className="card-soft mb-3">
        <div className="card-body py-3">
          <div className="filter-bar">
            <div className="search-box">
              <i className="bi bi-search" />
              <input
                className="form-control"
                placeholder="Search name or email…"
                value={filters.search}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, search: event.target.value }))
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select
                className="form-select"
                value={filters.role}
                onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}
              >
                <option value="">All roles</option>
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Deactivated</option>
                <option value="">All</option>
              </select>
            </div>
            <div className="ms-md-auto text-muted-2" style={{ fontSize: '0.74rem' }}>
              <i className="bi bi-shield-lock me-1" />
              Delete permission is granted per user.
            </div>
          </div>
        </div>
      </div>

      <div className="card-soft">
        {loading ? (
          <Loading label="Loading accounts…" />
        ) : error ? (
          <div className="p-3">
            <ErrorAlert error={error} onRetry={load} />
          </div>
        ) : sorted.length ? (
          <div className="table-responsive">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Assignments</th>
                  <th>Can delete</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span className="avatar sm">{initials(account.name)}</span>
                        <div>
                          <div className="fw-650">{account.name}</div>
                          <div className="text-muted-2" style={{ fontSize: '0.74rem' }}>
                            {account.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${roleBadge(account.role)}`}>
                        {roleLabel(account.role)}
                      </span>
                      {account.id === currentUser.id ? (
                        <div className="text-muted-2" style={{ fontSize: '0.68rem' }}>You</div>
                      ) : null}
                    </td>
                    <td style={{ maxWidth: 300 }}>
                      {account.role === 'TEACHER' ? (
                        <>
                          <div className="d-flex flex-wrap gap-1 mb-1">
                            {account.classes.length ? (
                              account.classes.map((item) => (
                                <span key={item.id} className="badge badge-soft-info">
                                  {item.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted-2">No classes</span>
                            )}
                          </div>
                          <div className="d-flex flex-wrap gap-1">
                            {account.subjects.map((item) => (
                              <span key={item.id} className="badge badge-soft-muted">
                                {item.name}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-2">Whole school access</span>
                      )}
                    </td>
                    <td>
                      {account.role === 'SUPER_ADMIN' ? (
                        <span className="badge badge-soft-danger">Always</span>
                      ) : account.canDelete ? (
                        <span className="badge badge-soft-warning">Granted</span>
                      ) : (
                        <span className="badge badge-soft-muted">Not granted</span>
                      )}
                    </td>
                    <td>
                      {account.isActive ? (
                        <span className="badge badge-soft-success">Active</span>
                      ) : (
                        <span className="badge badge-soft-muted">Deactivated</span>
                      )}
                      <div className="text-muted-2" style={{ fontSize: '0.68rem' }}>
                        Added {formatDate(account.createdAt)}
                      </div>
                    </td>
                    <td className="text-end">
                      <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                        {account.role !== 'SUPER_ADMIN' ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-brand"
                            title={account.canDelete ? 'Revoke delete permission' : 'Grant delete permission'}
                            onClick={() => togglePermission(account)}
                            disabled={permissionBusy === account.id}
                          >
                            {permissionBusy === account.id ? (
                              <span className="spinner-border spinner-border-sm" />
                            ) : (
                              <i className={`bi ${account.canDelete ? 'bi-shield-x' : 'bi-shield-check'}`} />
                            )}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-brand"
                          title="Edit account"
                          onClick={() => openEdit(account)}
                        >
                          <i className="bi bi-pencil" />
                        </button>
                        {account.id !== currentUser.id ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-soft-danger"
                            title="Delete account"
                            onClick={() => remove(account)}
                          >
                            <i className="bi bi-trash" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="bi-person-gear"
            title="No accounts found"
            message="Try changing the filters or add a new user."
            action={
              <button type="button" className="btn btn-brand btn-sm" onClick={openCreate}>
                <i className="bi bi-person-plus me-1" /> Add user
              </button>
            }
          />
        )}
      </div>

      <Modal
        show={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit account' : 'Add user'}
        subtitle={editing ? editing.email : 'The new user signs in with this email and password.'}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-outline-brand"
              onClick={() => setFormOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" form="user-form" className="btn btn-brand" disabled={busy}>
              {busy ? <span className="spinner-border spinner-border-sm me-2" /> : null}
              {editing ? 'Save changes' : 'Create account'}
            </button>
          </>
        }
      >
        <form id="user-form" onSubmit={submit} className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Full name *</label>
            <input
              className="form-control"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Email address *</label>
            <input
              type="email"
              className="form-control"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Phone</label>
            <input
              className="form-control"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">
              Password {editing ? '(leave blank to keep current)' : '*'}
            </label>
            <input
              type="password"
              className="form-control"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              minLength={form.password ? 8 : undefined}
              autoComplete="new-password"
              required={!editing}
            />
          </div>

          <div className="col-md-6">
            <label className="form-label">Role *</label>
            <select
              className="form-select"
              value={form.role}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, role: event.target.value }))
              }
            >
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, isActive: event.target.value === 'active' }))
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </select>
          </div>
          <div className="col-md-3 d-flex align-items-end">
            <div className="form-check mb-2">
              <input
                className="form-check-input"
                type="checkbox"
                id="can-delete"
                checked={form.canDelete}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, canDelete: event.target.checked }))
                }
              />
              <label className="form-check-label" htmlFor="can-delete">
                Can delete records
              </label>
            </div>
          </div>

          {form.role === 'TEACHER' ? (
            <>
              <div className="col-md-6">
                <label className="form-label">Classes taught *</label>
                <div
                  className="border rounded-3 p-2"
                  style={{ maxHeight: 170, overflowY: 'auto' }}
                >
                  {classes.map((schoolClass) => (
                    <div className="form-check" key={schoolClass.id}>
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`class-${schoolClass.id}`}
                        checked={form.classIds.includes(schoolClass.id)}
                        onChange={() => toggleId('classIds', schoolClass.id)}
                      />
                      <label className="form-check-label" htmlFor={`class-${schoolClass.id}`}>
                        {schoolClass.name}{' '}
                        <span className="text-muted-2">({levelLabel(schoolClass.level)})</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Subjects taught *</label>
                <div
                  className="border rounded-3 p-2"
                  style={{ maxHeight: 170, overflowY: 'auto' }}
                >
                  {subjects.map((subject) => (
                    <div className="form-check" key={subject.id}>
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`subject-${subject.id}`}
                        checked={form.subjectIds.includes(subject.id)}
                        onChange={() => toggleId('subjectIds', subject.id)}
                      />
                      <label className="form-check-label" htmlFor={`subject-${subject.id}`}>
                        {subject.name} <span className="text-muted-2">({subject.code})</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="col-12">
                <div className="alert alert-info mb-0">
                  <i className="bi bi-info-circle me-1" />
                  Teachers can only record assessments for the classes and subjects selected here.
                  The subject list includes Swahili where it is offered.
                </div>
              </div>
            </>
          ) : (
            <div className="col-12">
              <div className="alert alert-info mb-0">
                <i className="bi bi-info-circle me-1" />
                {form.role === 'DOS'
                  ? 'The Dean of Studies sees Primary section analytics, can edit grades and approve reports. Delete access must be granted separately.'
                  : form.role === 'HEAD_TEACHER'
                    ? 'The Head Teacher has whole-school access and can download all report cards.'
                    : 'Super Admins have full access, can create users and control delete permissions.'}
              </div>
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}
