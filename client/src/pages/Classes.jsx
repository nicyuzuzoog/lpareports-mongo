import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { EmptyState, ErrorAlert, Loading } from '../components/Feedback.jsx';
import { LEVELS } from '../utils/constants.js';
import { roleLabel } from '../utils/format.js';

const EMPTY_FORM = { name: '', level: 'LOWER_PRIMARY', classTeacherId: '' };

const LEVEL_ORDER = { NURSERY: 0, LOWER_PRIMARY: 1, UPPER_PRIMARY: 2 };

export default function Classes() {
  const { user } = useAuth();
  const { show: toast } = useToast();
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const canManage = ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'].includes(user.role);
  const isSuperAdmin = user.role === 'SUPER_ADMIN';

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get('/classes')
      .then((res) => setClasses(res.classes))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    api
      .get('/users?status=active')
      .then((res) =>
        setTeachers(
          res.users.filter((item) =>
            ['TEACHER', 'DOS', 'HEAD_TEACHER'].includes(item.role)
          )
        )
      )
      .catch(() => {});
  }, [canManage]);

  const grouped = useMemo(() => {
    const sorted = [...classes].sort(
      (a, b) =>
        (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) ||
        a.name.localeCompare(b.name)
    );
    return LEVELS.map((level) => ({
      ...level,
      classes: sorted.filter((item) => item.level === level.value)
    })).filter((group) => group.classes.length);
  }, [classes]);

  const totalStudents = classes.reduce((sum, item) => sum + item.studentCount, 0);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (schoolClass) => {
    setEditing(schoolClass);
    setForm({
      name: schoolClass.name,
      level: schoolClass.level,
      classTeacherId: schoolClass.classTeacher?.id || ''
    });
    setFormOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        level: form.level,
        classTeacherId: form.classTeacherId || null
      };
      if (editing) {
        await api.patch(`/classes/${editing.id}`, payload);
        toast('Class updated.');
      } else {
        await api.post('/classes', payload);
        toast('Class created.');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (schoolClass) => {
    if (
      !window.confirm(
        `Delete ${schoolClass.name}? Classes with students or report cards cannot be deleted.`
      )
    ) {
      return;
    }
    try {
      await api.delete(`/classes/${schoolClass.id}`);
      toast('Class deleted.');
      load();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  return (
    <>
      <PageHeader
        title="Classes"
        subtitle="Nursery, Lower Primary and Upper Primary class structure."
      >
        {canManage ? (
          <button type="button" className="btn btn-brand" onClick={openCreate}>
            <i className="bi bi-plus-lg me-2" />
            Add class
          </button>
        ) : null}
      </PageHeader>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <span className="term-pill active">
          <i className="bi bi-diagram-3" /> {classes.length} classes
        </span>
        <span className="term-pill">
          <i className="bi bi-people" /> {totalStudents} students
        </span>
        {!canManage ? (
          <span className="term-pill">
            <i className="bi bi-info-circle" /> Ask your campus DOS or Head Teacher to add or change classes
          </span>
        ) : null}
      </div>

      {loading ? (
        <Loading label="Loading classes…" />
      ) : error ? (
        <ErrorAlert error={error} onRetry={load} />
      ) : grouped.length ? (
        grouped.map((group) => (
          <div className="card-soft mb-4" key={group.value}>
            <div className="card-header">
              <span>
                <i className="bi bi-collection me-2 text-muted-2" />
                {group.label}
              </span>
              <span className="badge badge-soft-info">{group.classes.length} classes</span>
            </div>
            <div className="table-responsive">
              <table className="table-clean">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Class teacher</th>
                    <th>Students</th>
                    <th>Report cards</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.classes.map((schoolClass) => (
                    <tr key={schoolClass.id}>
                      <td className="fw-650">{schoolClass.name}</td>
                      <td>
                        {schoolClass.classTeacher ? (
                          schoolClass.classTeacher.name
                        ) : (
                          <span className="text-muted-2">Not assigned</span>
                        )}
                      </td>
                      <td>{schoolClass.studentCount}</td>
                      <td>{schoolClass.reportCount}</td>
                      <td className="text-end">
                        <div className="d-inline-flex gap-1">
                          <Link
                            to={`/analytics/class/${schoolClass.id}`}
                            className="btn btn-sm btn-outline-brand"
                            title="Class analytics"
                          >
                            <i className="bi bi-graph-up" />
                          </Link>
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-brand"
                                title="Edit class"
                                onClick={() => openEdit(schoolClass)}
                              >
                                <i className="bi bi-pencil" />
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-soft-danger"
                                title="Delete class"
                                onClick={() => remove(schoolClass)}
                              >
                                <i className="bi bi-trash" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      ) : (
        <EmptyState
          icon="bi-diagram-3"
          title="No classes yet"
          message={
            isSuperAdmin
              ? 'Create the school classes to start registering students.'
              : 'No classes have been assigned to your section yet.'
          }
          action={
            canManage ? (
              <button type="button" className="btn btn-brand btn-sm" onClick={openCreate}>
                <i className="bi bi-plus-lg me-1" /> Add class
              </button>
            ) : null
          }
        />
      )}

      <Modal
        show={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit class' : 'Add class'}
        subtitle="Class names must be unique."
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
            <button type="submit" form="class-form" className="btn btn-brand" disabled={busy}>
              {busy ? <span className="spinner-border spinner-border-sm me-2" /> : null}
              {editing ? 'Save changes' : 'Create class'}
            </button>
          </>
        }
      >
        <form id="class-form" onSubmit={submit} className="row g-3">
          <div className="col-12">
            <label className="form-label">Class name *</label>
            <input
              className="form-control"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. P.4"
              required
            />
          </div>
          <div className="col-12">
            <label className="form-label">Section *</label>
            <select
              className="form-select"
              value={form.level}
              onChange={(event) => setForm((prev) => ({ ...prev, level: event.target.value }))}
            >
              {LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label">Class teacher</label>
            <select
              className="form-select"
              value={form.classTeacherId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, classTeacherId: event.target.value }))
              }
            >
              <option value="">Not assigned</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name} ({roleLabel(teacher.role)})
                </option>
              ))}
            </select>
            <div className="text-muted-2 mt-1" style={{ fontSize: '0.72rem' }}>
              The class teacher is shown on the report card signature line.
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
