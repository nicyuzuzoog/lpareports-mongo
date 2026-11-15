import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { EmptyState, ErrorAlert, Loading, Pagination } from '../components/Feedback.jsx';
import { GENDERS } from '../utils/constants.js';
import { formatDate, fullName, initials, levelLabel } from '../utils/format.js';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  otherNames: '',
  code: '',
  gender: 'MALE',
  dateOfBirth: '',
  classId: '',
  guardianName: '',
  guardianPhone: '',
  address: '',
  isActive: true
};

function StudentForm({ show, onClose, onSaved, classes, editing }) {
  const { show: toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!show) return;
    if (editing) {
      setForm({
        firstName: editing.firstName || '',
        lastName: editing.lastName || '',
        otherNames: editing.otherNames || '',
        code: editing.code || '',
        gender: editing.gender || 'MALE',
        dateOfBirth: editing.dateOfBirth ? String(editing.dateOfBirth).slice(0, 10) : '',
        classId: editing.classId || '',
        guardianName: editing.guardianName || '',
        guardianPhone: editing.guardianPhone || '',
        address: editing.address || '',
        isActive: editing.isActive ?? true
      });
    } else {
      setForm({ ...EMPTY_FORM, classId: classes[0]?.id || '' });
    }
    setError(null);
  }, [show, editing, classes]);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...form,
        code: form.code.trim() || undefined,
        dateOfBirth: form.dateOfBirth || null
      };
      if (editing) {
        await api.patch(`/students/${editing.id}`, payload);
        toast('Student details updated.');
      } else {
        await api.post('/students', payload);
        toast('Student registered successfully.');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      show={show}
      onClose={onClose}
      title={editing ? 'Edit student' : 'Register student'}
      subtitle={editing ? editing.code : 'The student code is generated automatically if left blank.'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline-brand" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="student-form" className="btn btn-brand" disabled={busy}>
            {busy ? <span className="spinner-border spinner-border-sm me-2" /> : null}
            {editing ? 'Save changes' : 'Register student'}
          </button>
        </>
      }
    >
      {error ? <ErrorAlert error={error} /> : null}
      <form id="student-form" onSubmit={submit}>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">First name *</label>
            <input
              className="form-control"
              value={form.firstName}
              onChange={(event) => set('firstName', event.target.value)}
              required
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Last name *</label>
            <input
              className="form-control"
              value={form.lastName}
              onChange={(event) => set('lastName', event.target.value)}
              required
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Other names</label>
            <input
              className="form-control"
              value={form.otherNames}
              onChange={(event) => set('otherNames', event.target.value)}
            />
          </div>

          <div className="col-md-4">
            <label className="form-label">Student code</label>
            <input
              className="form-control"
              placeholder="Auto-generated"
              value={form.code}
              onChange={(event) => set('code', event.target.value.toUpperCase())}
              disabled={Boolean(editing)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Gender *</label>
            <select
              className="form-select"
              value={form.gender}
              onChange={(event) => set('gender', event.target.value)}
            >
              {GENDERS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Date of birth</label>
            <input
              type="date"
              className="form-control"
              value={form.dateOfBirth}
              onChange={(event) => set('dateOfBirth', event.target.value)}
            />
          </div>

          <div className="col-md-6">
            <label className="form-label">Class *</label>
            <select
              className="form-select"
              value={form.classId}
              onChange={(event) => set('classId', event.target.value)}
              required
            >
              <option value="">Select class</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {levelLabel(item.level)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(event) => set('isActive', event.target.value === 'active')}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive / left school</option>
            </select>
          </div>

          <div className="col-md-5">
            <label className="form-label">Guardian name</label>
            <input
              className="form-control"
              value={form.guardianName}
              onChange={(event) => set('guardianName', event.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label">Guardian phone</label>
            <input
              className="form-control"
              value={form.guardianPhone}
              onChange={(event) => set('guardianPhone', event.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Address</label>
            <input
              className="form-control"
              value={form.address}
              onChange={(event) => set('address', event.target.value)}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default function Students() {
  const { user } = useAuth();
  const { show: toast } = useToast();
  const [classes, setClasses] = useState([]);
  const [data, setData] = useState({ students: [], pagination: null });
  const [filters, setFilters] = useState({ search: '', classId: '', status: 'active' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const canDelete = user.role === 'SUPER_ADMIN' || user.canDelete;

  useEffect(() => {
    api.get('/classes').then((res) => setClasses(res.classes)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      status: filters.status
    });
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.classId) params.set('classId', filters.classId);

    api
      .get(`/students?${params.toString()}`)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [page, filters]);

  useEffect(() => {
    const timer = window.setTimeout(load, filters.search ? 320 : 0);
    return () => window.clearTimeout(timer);
  }, [load, filters.search]);

  const remove = async (student) => {
    if (
      !window.confirm(
        `Delete ${fullName(student)} (${student.code})? This permanently removes the student and all report cards.`
      )
    ) {
      return;
    }
    try {
      await api.delete(`/students/${student.id}`);
      toast('Student deleted.', 'success');
      load();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  const classOptions = useMemo(() => classes, [classes]);

  return (
    <>
      <PageHeader
        title="Students"
        subtitle="Register learners, keep their unique codes and manage class placement."
      >
        <button type="button" className="btn btn-brand" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <i className="bi bi-person-plus me-2" />
          Register student
        </button>
      </PageHeader>

      <div className="card-soft mb-3">
        <div className="card-body py-3">
          <div className="filter-bar">
            <div className="search-box">
              <i className="bi bi-search" />
              <input
                className="form-control"
                placeholder="Search name or student code…"
                value={filters.search}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, search: event.target.value }));
                }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Class</label>
              <select
                className="form-select"
                value={filters.classId}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, classId: event.target.value }));
                }}
              >
                <option value="">All classes</option>
                {classOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={filters.status}
                onChange={(event) => {
                  setPage(1);
                  setFilters((prev) => ({ ...prev, status: event.target.value }));
                }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </select>
            </div>
            {(filters.search || filters.classId || filters.status !== 'active') ? (
              <button
                type="button"
                className="btn btn-outline-brand"
                onClick={() => {
                  setPage(1);
                  setFilters({ search: '', classId: '', status: 'active' });
                }}
              >
                <i className="bi bi-x-circle me-1" />
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="card-soft">
        {loading ? (
          <Loading label="Loading students…" />
        ) : error ? (
          <div className="p-3"><ErrorAlert error={error} onRetry={load} /></div>
        ) : data.students.length ? (
          <div className="table-responsive">
            <table className="table-clean">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Gender</th>
                  <th>Guardian</th>
                  <th>Registered</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span className="avatar sm">{initials(fullName(student))}</span>
                        <div>
                          <Link to={`/students/${student.id}`} className="fw-650">{fullName(student)}</Link>
                          <div className="mono">{student.code}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>{student.className}</div>
                      <div className="text-muted-2" style={{ fontSize: '0.7rem' }}>{levelLabel(student.level)}</div>
                    </td>
                    <td>{student.gender === 'FEMALE' ? 'Female' : 'Male'}</td>
                    <td>
                      <div>{student.guardianName || '—'}</div>
                      <div className="text-muted-2" style={{ fontSize: '0.72rem' }}>{student.guardianPhone || ''}</div>
                    </td>
                    <td>{formatDate(student.createdAt)}</td>
                    <td>
                      {student.isActive ? (
                        <span className="badge badge-soft-success">Active</span>
                      ) : (
                        <span className="badge badge-soft-muted">Inactive</span>
                      )}
                    </td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-1">
                        <Link to={`/students/${student.id}`} className="btn btn-sm btn-outline-brand" title="View profile">
                          <i className="bi bi-eye" />
                        </Link>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-brand"
                          title="Edit student"
                          onClick={() => { setEditing(student); setFormOpen(true); }}
                        >
                          <i className="bi bi-pencil" />
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-soft-danger"
                            title="Delete student"
                            onClick={() => remove(student)}
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
            icon="bi-people"
            title="No students found"
            message={filters.search || filters.classId ? 'Try changing your filters.' : 'Register the first student to get started.'}
            action={
              <button type="button" className="btn btn-brand btn-sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
                <i className="bi bi-person-plus me-1" /> Register student
              </button>
            }
          />
        )}
        {data.pagination && data.students.length ? (
          <div className="px-3 pb-3">
            <Pagination pagination={data.pagination} onPage={setPage} />
          </div>
        ) : null}
      </div>

      <StudentForm
        show={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        classes={classOptions}
        editing={editing}
      />
    </>
  );
}
