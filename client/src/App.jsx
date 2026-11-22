import { Routes, Route, Navigate } from 'react-router-dom';
import Protected from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Students from './pages/Students.jsx';
import StudentDetail from './pages/StudentDetail.jsx';
import Assessments from './pages/Assessments.jsx';
import Reports from './pages/Reports.jsx';
import ReportDetail from './pages/ReportDetail.jsx';
import Approvals from './pages/Approvals.jsx';
import Analytics from './pages/Analytics.jsx';
import ClassAnalytics from './pages/ClassAnalytics.jsx';
import Classes from './pages/Classes.jsx';
import Subjects from './pages/Subjects.jsx';
import Users from './pages/Users.jsx';
import Audit from './pages/Audit.jsx';
import Settings from './pages/Settings.jsx';
import Profile from './pages/Profile.jsx';
import NotFound from './pages/NotFound.jsx';

const MANAGERS = ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'];
const ACADEMIC_MANAGERS = ['SUPER_ADMIN', 'DOS'];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentDetail />} />
        <Route path="assessments" element={<Assessments />} />
        <Route path="reports" element={<Reports />} />
        <Route path="reports/:id" element={<ReportDetail />} />
        <Route
          path="approvals"
          element={
            <Protected roles={MANAGERS}>
              <Approvals />
            </Protected>
          }
        />
        <Route
          path="analytics"
          element={
            <Protected roles={MANAGERS}>
              <Analytics />
            </Protected>
          }
        />
        <Route
          path="analytics/class/:id"
          element={
            <Protected roles={MANAGERS}>
              <ClassAnalytics />
            </Protected>
          }
        />
        <Route
          path="classes"
          element={
            <Protected roles={ACADEMIC_MANAGERS}>
              <Classes />
            </Protected>
          }
        />
        <Route
          path="subjects"
          element={
            <Protected roles={ACADEMIC_MANAGERS}>
              <Subjects />
            </Protected>
          }
        />
        <Route
          path="users"
          element={
            <Protected roles={ACADEMIC_MANAGERS}>
              <Users />
            </Protected>
          }
        />
        <Route
          path="audit"
          element={
            <Protected roles={['SUPER_ADMIN']}>
              <Audit />
            </Protected>
          }
        />
        <Route
          path="settings"
          element={
            <Protected roles={MANAGERS}>
              <Settings />
            </Protected>
          }
        />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
