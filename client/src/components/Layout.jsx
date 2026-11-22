import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.jpeg';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { initials, roleLabel } from '../utils/format.js';

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: 'bi-grid-1x2-fill', end: true },
      { to: '/students', label: 'Students', icon: 'bi-people-fill' },
      { to: '/assessments', label: 'Assessments', icon: 'bi-clipboard2-check-fill' },
      { to: '/reports', label: 'Report Cards', icon: 'bi-file-earmark-text-fill' },
      {
        to: '/approvals',
        label: 'Approvals',
        icon: 'bi-patch-check-fill',
        roles: ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'],
        badge: true
      }
    ]
  },
  {
    label: 'Insights',
    items: [
      {
        to: '/analytics',
        label: 'Performance',
        icon: 'bi-graph-up-arrow',
        roles: ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER']
      },
      {
        to: '/classes',
        label: 'Classes',
        icon: 'bi-diagram-3-fill',
        roles: ['SUPER_ADMIN', 'DOS']
      }
    ]
  },
  {
    label: 'Administration',
    items: [
      { to: '/users', label: 'Users', icon: 'bi-person-gear', roles: ['SUPER_ADMIN', 'DOS'] },
      { to: '/subjects', label: 'Subjects', icon: 'bi-book-fill', roles: ['SUPER_ADMIN', 'DOS'] },
      { to: '/audit', label: 'Audit Trail', icon: 'bi-shield-lock-fill', roles: ['SUPER_ADMIN'] },
      {
        to: '/settings',
        label: 'Settings',
        icon: 'bi-gear-fill',
        roles: ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER']
      }
    ]
  }
];

const PAGE_META = [
  { match: /^\/$/, title: 'Dashboard' },
  { match: /^\/students\/[^/]+$/, title: 'Student Profile' },
  { match: /^\/students/, title: 'Students' },
  { match: /^\/assessments/, title: 'Assessments' },
  { match: /^\/reports\/[^/]+$/, title: 'Report Card' },
  { match: /^\/reports/, title: 'Report Cards' },
  { match: /^\/approvals/, title: 'Report Approvals' },
  { match: /^\/analytics\/class/, title: 'Class Performance' },
  { match: /^\/analytics/, title: 'Performance Analytics' },
  { match: /^\/classes/, title: 'Classes' },
  { match: /^\/subjects/, title: 'Subjects' },
  { match: /^\/users/, title: 'User Accounts' },
  { match: /^\/audit/, title: 'Audit Trail' },
  { match: /^\/settings/, title: 'Settings' },
  { match: /^\/profile/, title: 'My Profile' }
];

function titleFor(pathname) {
  return PAGE_META.find((item) => item.match.test(pathname))?.title || 'LPAREPORTS';
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const menuRef = useRef(null);

  const canApprove = ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'].includes(user.role);

  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!canApprove) return undefined;
    let active = true;
    api
      .get('/dashboard')
      .then((data) => {
        if (active) setPendingCount(data.totals?.pending || 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canApprove, location.pathname]);

  useEffect(() => {
    const onClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const sections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => !item.roles || item.roles.includes(user.role))
      })).filter((section) => section.items.length)
    ,
    [user.role]
  );

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      {sidebarOpen ? (
        <div className="sidebar-backdrop d-lg-none" onClick={() => setSidebarOpen(false)} />
      ) : null}

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img src={logo} alt="School logo" />
          <div>
            <div className="brand-name">LPAREPORTS</div>
            <div className="brand-sub">Report System</div>
          </div>
        </div>

        <div className="sidebar-scroll">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <i className={`bi ${item.icon}`} />
                  <span className="flex-grow-1">{item.label}</span>
                  {item.badge && pendingCount > 0 ? (
                    <span className="badge badge-soft-warning">{pendingCount}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span className="avatar">{initials(user.name)}</span>
            <div className="overflow-hidden">
              <div className="sidebar-user-name text-truncate">{user.name}</div>
              <div className="sidebar-user-role">{roleLabel(user.role)}</div>
            </div>
          </div>
          <button type="button" className="btn-sidebar-logout" onClick={handleLogout}>
            <i className="bi bi-box-arrow-left me-2" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="btn btn-icon d-lg-none"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <i className="bi bi-list" />
          </button>

          <div className="flex-grow-1">
            <h2 className="topbar-title">{titleFor(location.pathname)}</h2>
            <div className="topbar-sub d-none d-sm-block">
              {user.name} · {roleLabel(user.role)}
            </div>
          </div>

          <div className="d-none d-md-flex align-items-center gap-2 text-muted-2" style={{ fontSize: '0.75rem' }}>
            <i className="bi bi-calendar3" />
            {new Date().toLocaleDateString('en-GB', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })}
          </div>

          <div className="position-relative" ref={menuRef}>
            <button
              type="button"
              className="btn d-flex align-items-center gap-2 border-0 bg-transparent px-1"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Account menu"
            >
              <span className="avatar">{initials(user.name)}</span>
              <i className="bi bi-chevron-down text-muted-2" style={{ fontSize: '0.65rem' }} />
            </button>
            {menuOpen ? (
              <div
                className="dropdown-menu show position-absolute end-0 mt-2"
                style={{ minWidth: 220 }}
              >
                <div className="px-3 py-2 border-bottom">
                  <div className="fw-650">{user.name}</div>
                  <div className="text-muted-2" style={{ fontSize: '0.72rem' }}>{user.email}</div>
                </div>
                <button
                  type="button"
                  className="dropdown-item"
                  onClick={() => navigate('/profile')}
                >
                  <i className="bi bi-person me-2" />
                  My profile
                </button>
                <button type="button" className="dropdown-item text-danger" onClick={handleLogout}>
                  <i className="bi bi-box-arrow-right me-2" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
