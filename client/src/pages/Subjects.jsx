import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Modal from '../components/Modal.jsx';
import { EmptyState, ErrorAlert, Loading } from '../components/Feedback.jsx';
import { LEVELS } from '../utils/constants.js';
import { levelLabel } from '../utils/format.js';

const EMPTY_FORM = {
  name: '',
  code: '',
  levels: ['LOWER_PRIMARY'],
  position: 0,
  isActive: true
};

export default function Subjects() {
  const { show: toast } = useToast();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [filterLevel, setFilterLevel] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get('/subjects')
      .then((res) => setSubjects(res.subjects))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, position: subjects.length + 1 });
    setFormOpen(true);
  };

  const openEdit = (subject) => {
    setEditing(subject);
    setForm({
      name: subject.name,
      code: subject.code,
      levels: subject.levels,
      position: subject.position ?? 0,
      isActive: subject.isActive
    });
    setFormOpen(true);
  };

  const toggleLevel = (level) => {
    setForm((prev) => ({
      ...prev,
      levels: prev.levels.includes(level)
        ? prev.levels.filter((item) => item !== level)
        : [...prev.levels, level]
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.levels.length) {
      toast('Select at least one section for this subject.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        levels: form.levels,
        position: Number(form.position) || 0,
        isActive: form.isActive
      };
      if (editing) {
        await api.patch(`/subjects/${editing.id}`, payload);
        toast('Subject updated.');
      } else {
        await api.post('/subjects', payload);
        toast('Subject created.');
      }
      setFormOpen(false);
      load();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (subject) => {
    if (
      !window.confirm(
        `Delete ${subject.name}? Subjects with assessment records cannot be deleted — deactivate them instead.`
      )
    ) {
      return;
    }
    try {
      await api.delete(`/subjects/${subject.id}`);
      toast('Subject deleted.');
      load();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  const visible = filterLevel
    ? subjects.filter((subject) => subject.levels.includes(filterLevel))
    : subjects;

  const usage = LEVELS.map((level) => ({
    ...level,
    count: subjects.filter((subject) => subject.levels.includes(level.value)).length
  }));

  return (
    <>
      <PageHeader
        title="Subjects"
        subtitle="Subjects offered per section. Teachers are assigned from these subjects, including Swahili."
      >
        <button type="button" className="btn btn-brand" onClick={openCreate}>
          <i className="bi bi-plus-lg me-2" />
          Add subject
        </button>
      </PageHeader>

      <div className="d-flex flex-wrap gap-2 mb-3">
        {usage.map((level) => (
          <span className="term-pill" key={level.value}>
            <i className="bi bi-book" /> {level.label}: {level.count}
          </span>
        ))}
        <div className="ms-auto">
          <select
            className="form-select form-select-sm"
            value={filterLevel}
            onChange={(event) => setFilterLevel(event.target.value)}
          >
            <option value="">All sections</option>
            {LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card-soft">
        {loading ? (
          <Loading label="Loading subjects…" />
        ) : error ? (
          <div className="p-3">
            <ErrorAlert error={error} onRetry={load} />
          </div>
        ) : visible.length ? (
          <div className="table-responsive">
            <table className="table-clean">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Order</th>
                  <th>Subject</th>
                  <th>Code</th>
                  <th>Sections</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((subject) => (
                  <tr key={subject.id}>
                    <td className="text-muted-2">{subject.position}</td>
                    <td className="fw-650">{subject.name}</td>
                    <td>
                      <span className="mono">{subject.code}</span>
                    </td>
                    <td>
                      <div className="d-flex flex-wrap gap-1">
                        {subject.levels.map((level) => (
                          <span key={level} className="badge badge-soft-info">
                            {levelLabel(level)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {subject.isActive ? (
                        <span className="badge badge-soft-success">Active</span>
                      ) : (
                        <span className="badge badge-soft-muted">Inactive</span>
                      )}
                    </td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-1">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-brand"
                          title="Edit subject"
                          onClick={() => openEdit(subject)}
                        >
                          <i className="bi bi-pencil" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-soft-danger"
                          title="Delete subject"
                          onClick={() => remove(subject)}
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="bi-book"
            title="No subjects found"
            message="Add the subjects offered on the report card."
            action={
              <button type="button" className="btn btn-brand btn-sm" onClick={openCreate}>
                <i className="bi bi-plus-lg me-1" /> Add subject
              </button>
            }
          />
        )}
      </div>

      <Modal
        show={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit subject' : 'Add subject'}
        subtitle="Subjects appear on report cards in the order set below."
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
            <button type="submit" form="subject-form" className="btn btn-brand" disabled={busy}>
              {busy ? <span className="spinner-border spinner-border-sm me-2" /> : null}
              {editing ? 'Save changes' : 'Create subject'}
            </button>
          </>
        }
      >
        <form id="subject-form" onSubmit={submit} className="row g-3">
          <div className="col-md-8">
            <label className="form-label">Subject name *</label>
            <input
              className="form-control"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. Social Studies"
              required
            />
          </div>
          <div className="col-md-4">
            <label className="form-label">Code *</label>
            <input
              className="form-control"
              value={form.code}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
              }
              placeholder="e.g. SST"
              maxLength={12}
              required
            />
          </div>

          <div className="col-12">
            <label className="form-label">Sections *</label>
            <div className="d-flex flex-wrap gap-3 border rounded-3 p-3">
              {LEVELS.map((level) => (
                <div className="form-check" key={level.value}>
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={`level-${level.value}`}
                    checked={form.levels.includes(level.value)}
                    onChange={() => toggleLevel(level.value)}
                  />
                  <label className="form-check-label" htmlFor={`level-${level.value}`}>
                    {level.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="col-md-6">
            <label className="form-label">Display order</label>
            <input
              type="number"
              min="0"
              className="form-control"
              value={form.position}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, position: event.target.value }))
              }
            />
          </div>
          <div className="col-md-6">
            <label className="form-label">Status</label>
            <select
              className="form-select"
              value={form.isActive ? 'active' : 'inactive'}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, isActive: event.target.value === 'active' }))
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <div className="text-muted-2 mt-1" style={{ fontSize: '0.72rem' }}>
              Inactive subjects keep their history but are hidden from new assessments.
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
