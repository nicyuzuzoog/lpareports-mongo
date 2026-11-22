import { useEffect, useMemo, useState } from 'react';
import { api, getSystemSettings, patchSystemSettings } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { ErrorAlert, Loading } from '../components/Feedback.jsx';
import { LEVELS } from '../utils/constants.js';
import { levelLabel } from '../utils/format.js';

const TABS = [
  { key: 'school', label: 'School profile', icon: 'bi-building', roles: ['SUPER_ADMIN'] },
  { key: 'grading', label: 'Grading scales', icon: 'bi-list-ol', roles: ['SUPER_ADMIN', 'DOS'] },
  { key: 'weights', label: 'Assessment weights', icon: 'bi-calculator', roles: ['SUPER_ADMIN'] },
  { key: 'system', label: 'System controls', icon: 'bi-shield-check', roles: ['SUPER_ADMIN'] },
  { key: 'criteria', label: 'Analysis criteria', icon: 'bi-sliders' }
];

const EMPTY_BAND = { min: 0, max: 0, grade: '', remark: '' };

export default function Settings() {
  const { user } = useAuth();
  const { show: toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [criteria, setCriteria] = useState(null);
  const [tab, setTab] = useState('school');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [error, setError] = useState(null);
  const [systemSettings, setSystemSettings] = useState(null);
  const [systemError, setSystemError] = useState(null);
  const [registrationBusy, setRegistrationBusy] = useState(false);

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const canEditGrading = ['SUPER_ADMIN', 'DOS'].includes(user.role);
  const availableTabs = useMemo(
    () => TABS.filter((item) => !item.roles || item.roles.includes(user.role)),
    [user.role]
  );

  useEffect(() => {
    setLoading(true);
    api
      .get('/settings')
      .then((data) => {
        setSettings(data.settings);
        setForm(data.settings);
        setCriteria({
          passMark: data.settings.passMark,
          lowPerformanceThreshold: data.settings.lowPerformanceThreshold,
          lowPerformanceMinSubjects: data.settings.lowPerformanceMinSubjects
        });
        setTab(isSuperAdmin ? 'school' : user.role === 'DOS' ? 'grading' : 'criteria');
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [isSuperAdmin, user.role]);

  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    let active = true;
    getSystemSettings()
      .then((data) => {
        if (active) setSystemSettings(data.systemSettings || {});
      })
      .catch((err) => {
        if (active) setSystemError(err);
      });
    return () => {
      active = false;
    };
  }, [isSuperAdmin]);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const saveSettings = async (event) => {
    event.preventDefault();
    if (
      Number(form.courseworkWeight) + Number(form.examWeight) !==
      100
    ) {
      toast('Coursework and exam weights must add up to 100.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        schoolName: form.schoolName,
        schoolMotto: form.schoolMotto,
        schoolAddress: form.schoolAddress,
        schoolPhone: form.schoolPhone,
        schoolEmail: form.schoolEmail,
        headTeacherName: form.headTeacherName,
        dosName: form.dosName,
        passMark: Number(form.passMark),
        lowPerformanceThreshold: Number(form.lowPerformanceThreshold),
        lowPerformanceMinSubjects: Number(form.lowPerformanceMinSubjects),
        courseworkWeight: Number(form.courseworkWeight),
        examWeight: Number(form.examWeight),
        gradingScales: form.gradingScales
      };
      const data = await api.put('/settings', payload);
      setSettings(data.settings);
      setForm(data.settings);
      setCriteria({
        passMark: data.settings.passMark,
        lowPerformanceThreshold: data.settings.lowPerformanceThreshold,
        lowPerformanceMinSubjects: data.settings.lowPerformanceMinSubjects
      });
      toast('Settings saved.');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const saveGrading = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await api.put('/settings', { gradingScales: form.gradingScales });
      setSettings(data.settings);
      setForm(data.settings);
      setCriteria({
        passMark: data.settings.passMark,
        lowPerformanceThreshold: data.settings.lowPerformanceThreshold,
        lowPerformanceMinSubjects: data.settings.lowPerformanceMinSubjects
      });
      toast('Grading scales saved.');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const toggleRegistration = async () => {
    const previous = Boolean(systemSettings?.studentRegistrationEnabled);
    const next = !previous;
    setSystemSettings((prev) => ({ ...(prev || {}), studentRegistrationEnabled: next }));
    setRegistrationBusy(true);
    try {
      const data = await patchSystemSettings(next);
      setSystemSettings(data.systemSettings || { studentRegistrationEnabled: next });
      setSystemError(null);
      toast('Student registration setting updated.');
    } catch (err) {
      setSystemSettings((prev) => ({ ...(prev || {}), studentRegistrationEnabled: previous }));
      toast(err.message, 'danger');
    } finally {
      setRegistrationBusy(false);
    }
  };

  const saveCriteria = async (event) => {
    event.preventDefault();
    if (Number(criteria.lowPerformanceThreshold) > Number(criteria.passMark)) {
      toast('The low-performance threshold cannot be higher than the pass mark.', 'warning');
      return;
    }
    setSavingCriteria(true);
    try {
      const data = await api.patch('/settings/criteria', {
        passMark: Number(criteria.passMark),
        lowPerformanceThreshold: Number(criteria.lowPerformanceThreshold),
        lowPerformanceMinSubjects: Number(criteria.lowPerformanceMinSubjects)
      });
      setSettings((prev) => ({ ...prev, ...data.settings }));
      setForm((prev) => ({ ...prev, ...data.settings }));
      setCriteria({
        passMark: data.settings.passMark,
        lowPerformanceThreshold: data.settings.lowPerformanceThreshold,
        lowPerformanceMinSubjects: data.settings.lowPerformanceMinSubjects
      });
      toast('Analysis criteria updated.');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSavingCriteria(false);
    }
  };

  const updateBand = (level, index, field, value) => {
    setForm((prev) => {
      const scales = { ...prev.gradingScales };
      const bands = scales[level].map((band, i) =>
        i === index ? { ...band, [field]: value } : band
      );
      scales[level] = bands;
      return { ...prev, gradingScales: scales };
    });
  };

  const addBand = (level) => {
    setForm((prev) => {
      const scales = { ...prev.gradingScales };
      const bands = [...(scales[level] || [])];
      const lastMax = bands.length ? Number(bands[bands.length - 1].max) : 39;
      bands.push({
        ...EMPTY_BAND,
        min: Math.min(100, lastMax + 1),
        max: Math.min(100, lastMax + 10),
        grade: '',
        remark: ''
      });
      scales[level] = bands;
      return { ...prev, gradingScales: scales };
    });
  };

  const removeBand = (level, index) => {
    setForm((prev) => {
      const scales = { ...prev.gradingScales };
      scales[level] = scales[level].filter((band, i) => i !== index);
      return { ...prev, gradingScales: scales };
    });
  };

  const resetScale = (level) => {
    if (!settings) return;
    setForm((prev) => ({
      ...prev,
      gradingScales: {
        ...prev.gradingScales,
        [level]: settings.gradingScales[level]
      }
    }));
    toast(`${levelLabel(level)} grading scale reset to the saved version.`, 'info');
  };

  if (loading) return <Loading label="Loading settings…" />;
  if (error) return <ErrorAlert error={error} />;
  if (!form || !settings) return null;

  const weightTotal = Number(form.courseworkWeight) + Number(form.examWeight);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={
          user.role === 'DOS'
            ? 'Grading scales and performance criteria for your campus.'
            : 'School identity, grading scales, assessment weights, registration and performance criteria.'
        }
      >
        {isSuperAdmin ? (
          <span className="badge badge-soft-danger">
            <i className="bi bi-shield-lock me-1" /> Super Admin controls
          </span>
        ) : (
          <span className="badge badge-soft-info">
            <i className="bi bi-sliders me-1" />
            {user.role === 'DOS' ? 'Grading & analysis' : 'Analysis criteria'}
          </span>
        )}
      </PageHeader>

      <ul className="nav nav-tabs settings-tabs mb-3">
        {availableTabs.map((item) => (
          <li className="nav-item" key={item.key}>
            <button
              type="button"
              className={`nav-link ${tab === item.key ? 'active' : ''}`}
              onClick={() => setTab(item.key)}
            >
              <i className={`bi ${item.icon} me-2`} />
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      {tab === 'school' && isSuperAdmin ? (
        <form onSubmit={saveSettings}>
          <div className="card-soft mb-4">
            <div className="card-header">
              <span>
                <i className="bi bi-building me-2 text-muted-2" /> School identity
              </span>
            </div>
            <div className="card-body row g-3">
              <div className="col-md-6">
                <label className="form-label">School name *</label>
                <input
                  className="form-control"
                  value={form.schoolName}
                  onChange={(event) => set('schoolName', event.target.value)}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Motto</label>
                <input
                  className="form-control"
                  value={form.schoolMotto}
                  onChange={(event) => set('schoolMotto', event.target.value)}
                />
              </div>
              <div className="col-md-12">
                <label className="form-label">Address</label>
                <input
                  className="form-control"
                  value={form.schoolAddress}
                  onChange={(event) => set('schoolAddress', event.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Telephone</label>
                <input
                  className="form-control"
                  value={form.schoolPhone}
                  onChange={(event) => set('schoolPhone', event.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Email</label>
                <input
                  className="form-control"
                  value={form.schoolEmail}
                  onChange={(event) => set('schoolEmail', event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="card-soft mb-4">
            <div className="card-header">
              <span>
                <i className="bi bi-person-badge me-2 text-muted-2" /> Report card signatories
              </span>
            </div>
            <div className="card-body row g-3">
              <div className="col-md-6">
                <label className="form-label">Head Teacher's name</label>
                <input
                  className="form-control"
                  value={form.headTeacherName}
                  onChange={(event) => set('headTeacherName', event.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Dean of Studies' name</label>
                <input
                  className="form-control"
                  value={form.dosName}
                  onChange={(event) => set('dosName', event.target.value)}
                />
              </div>
              <div className="col-12">
                <div className="alert alert-info mb-0">
                  <i className="bi bi-info-circle me-1" />
                  The Head Teacher's name is printed on report cards. The Class Teacher line uses the
                  teacher assigned to the student's class.
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button type="submit" className="btn btn-brand" disabled={saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-check2 me-2" />}
              Save school profile
            </button>
          </div>
        </form>
      ) : null}

      {tab === 'grading' && canEditGrading ? (
        <form onSubmit={saveGrading}>
          <div className="alert alert-info">
            <i className="bi bi-info-circle me-1" />
            Rwandan primary bands apply to every section: A 70–100 (6 pts, Excellent), B 65–69
            (5 pts, Very Good), C 60–64 (4 pts, Good), D 50–59 (3 pts, Satisfactory), E 40–49
            (2 pts, Adequate), S 20–39 (1 pt, Fair), F 0–19 (0 pts, Fail). Higher points are better.
            Each scale must cover 0 to 100 without overlapping bands; bands are matched from the top
            score down.
          </div>

          {LEVELS.map((level) => (
            <div className="card-soft mb-4" key={level.value}>
              <div className="card-header">
                <span>
                  <i className="bi bi-list-ol me-2 text-muted-2" />
                  {level.label} scale
                </span>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-brand"
                    onClick={() => addBand(level.value)}
                  >
                    <i className="bi bi-plus-lg me-1" /> Add band
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-brand"
                    onClick={() => resetScale(level.value)}
                  >
                    <i className="bi bi-arrow-counterclockwise me-1" /> Reset
                  </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="table-clean">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Min score</th>
                      <th style={{ width: 110 }}>Max score</th>
                      <th style={{ width: 110 }}>Grade</th>
                      <th>Remark</th>
                      <th style={{ width: 60 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {(form.gradingScales[level.value] || []).map((band, index) => (
                      <tr key={`${level.value}-${index}`}>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="form-control form-control-sm"
                            value={band.min}
                            onChange={(event) =>
                              updateBand(level.value, index, 'min', Number(event.target.value))
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="form-control form-control-sm"
                            value={band.max}
                            onChange={(event) =>
                              updateBand(level.value, index, 'max', Number(event.target.value))
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            value={band.grade}
                            onChange={(event) =>
                              updateBand(level.value, index, 'grade', event.target.value)
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="form-control form-control-sm"
                            value={band.remark}
                            onChange={(event) =>
                              updateBand(level.value, index, 'remark', event.target.value)
                            }
                          />
                        </td>
                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-soft-danger"
                            title="Remove band"
                            onClick={() => removeBand(level.value, index)}
                          >
                            <i className="bi bi-x-lg" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="d-flex justify-content-end gap-2">
            <button type="submit" className="btn btn-brand" disabled={saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-check2 me-2" />}
              Save grading scales
            </button>
          </div>
        </form>
      ) : null}

      {tab === 'weights' && isSuperAdmin ? (
        <form onSubmit={saveSettings}>
          <div className="card-soft mb-4">
            <div className="card-header">
              <span>
                <i className="bi bi-calculator me-2 text-muted-2" /> How totals are calculated
              </span>
            </div>
            <div className="card-body row g-3">
              <div className="col-md-6">
                <label className="form-label">Coursework weight (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-control"
                  value={form.courseworkWeight}
                  onChange={(event) => set('courseworkWeight', event.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Exam weight (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-control"
                  value={form.examWeight}
                  onChange={(event) => set('examWeight', event.target.value)}
                />
              </div>
              <div className="col-12">
                <div
                  className={`alert mb-0 ${weightTotal === 100 ? 'alert-success' : 'alert-warning'}`}
                >
                  <i className="bi bi-calculator me-1" />
                  Coursework {form.courseworkWeight}% + Exam {form.examWeight}% ={' '}
                  <strong>{weightTotal}%</strong>
                  {weightTotal === 100
                    ? ' — the weights are balanced.'
                    : ' — the weights must add up to 100.'}
                </div>
              </div>
            </div>
          </div>

          <div className="card-soft mb-4">
            <div className="card-header">
              <span>
                <i className="bi bi-sliders me-2 text-muted-2" /> Pass mark
              </span>
            </div>
            <div className="card-body row g-3">
              <div className="col-md-6">
                <label className="form-label">Pass mark (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-control"
                  value={form.passMark}
                  onChange={(event) => set('passMark', Number(event.target.value))}
                />
                <div className="text-muted-2 mt-1" style={{ fontSize: '0.72rem' }}>
                  Used for pass rates in analytics. The low-performance threshold cannot exceed this.
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button type="submit" className="btn btn-brand" disabled={saving}>
              {saving ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-check2 me-2" />}
              Save weights
            </button>
          </div>
        </form>
      ) : null}

      {tab === 'system' && isSuperAdmin ? (
        <div className="card-soft mb-4">
          <div className="card-header">
            <span>
              <i className="bi bi-shield-check me-2 text-muted-2" /> Global controls
            </span>
          </div>
          <div className="card-body">
            {systemError ? <ErrorAlert error={systemError} /> : null}
            {systemSettings === null ? (
              <Loading label="Loading system controls…" />
            ) : (
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="student-registration-enabled"
                  checked={Boolean(systemSettings.studentRegistrationEnabled)}
                  onChange={toggleRegistration}
                  disabled={registrationBusy}
                />
                <label className="form-check-label fw-650" htmlFor="student-registration-enabled">
                  Student registration enabled
                </label>
                <div className="text-muted-2 mt-2" style={{ fontSize: '0.78rem' }}>
                  When switched off, no user can register new students. The setting applies to both
                  campuses; the API also enforces it.
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'criteria' && criteria ? (
        <form onSubmit={saveCriteria}>
          <div className="card-soft mb-4">
            <div className="card-header">
              <span>
                <i className="bi bi-sliders me-2 text-muted-2" /> Low-performance criteria
              </span>
              <span className="text-muted-2 fw-normal" style={{ fontSize: '0.72rem' }}>
                Applies to the Primary section analytics
              </span>
            </div>
            <div className="card-body row g-3">
              <div className="col-md-4">
                <label className="form-label">Pass mark (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-control"
                  value={criteria.passMark}
                  onChange={(event) =>
                    setCriteria((prev) => ({ ...prev, passMark: event.target.value }))
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Low-performance threshold (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-control"
                  value={criteria.lowPerformanceThreshold}
                  onChange={(event) =>
                    setCriteria((prev) => ({
                      ...prev,
                      lowPerformanceThreshold: event.target.value
                    }))
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Minimum subjects below threshold</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  className="form-control"
                  value={criteria.lowPerformanceMinSubjects}
                  onChange={(event) =>
                    setCriteria((prev) => ({
                      ...prev,
                      lowPerformanceMinSubjects: event.target.value
                    }))
                  }
                />
              </div>
              <div className="col-12">
                <div className="alert alert-info mb-0">
                  <i className="bi bi-info-circle me-1" />
                  A student is flagged when their average falls below the threshold, or when at least the
                  set number of subjects fall below it. The threshold cannot be higher than the pass mark.
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button type="submit" className="btn btn-brand" disabled={savingCriteria}>
              {savingCriteria ? (
                <span className="spinner-border spinner-border-sm me-2" />
              ) : (
                <i className="bi bi-check2 me-2" />
              )}
              Save criteria
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}
