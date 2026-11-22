import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

function normalizeUser(user, fallbackCampusId = null) {
  if (!user) return null;
  return {
    ...user,
    campusId: user.campusId ?? fallbackCampusId ?? null,
    isGlobal: Boolean(user.isGlobal ?? user.role === 'SUPER_ADMIN'),
    classTeacherClassId: user.classTeacherClassId ?? null,
    canDelete: Boolean(user.canDelete ?? user.role === 'SUPER_ADMIN')
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const token = getToken();
    if (!token) {
      setLoading(false);
      return undefined;
    }

    api
      .get('/auth/me')
      .then((data) => {
        if (active) setUser(normalizeUser(data.user));
      })
      .catch(() => {
        setToken(null);
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email, password, campusId) => {
    const data = await api.post('/auth/login', { email, password, campusId });
    setToken(data.token);
    const nextUser = normalizeUser(data.user, campusId);
    setUser(nextUser);
    return nextUser;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await api.get('/auth/me');
    const nextUser = normalizeUser(data.user);
    setUser(nextUser);
    return nextUser;
  }, []);

  const value = useMemo(
    () => ({
      user,
      campusId: user?.campusId ?? null,
      loading,
      login,
      logout,
      refreshUser,
      isSuperAdmin: Boolean(user && user.role === 'SUPER_ADMIN'),
      canManageAcademics: Boolean(user && ['SUPER_ADMIN', 'DOS'].includes(user.role)),
      canManageUsers: Boolean(user && ['SUPER_ADMIN', 'DOS'].includes(user.role)),
      hasRole: (...roles) => Boolean(user && roles.includes(user.role)),
      canManageStudents: Boolean(user),
      canApprove: Boolean(user && ['SUPER_ADMIN', 'DOS', 'HEAD_TEACHER'].includes(user.role))
    }),
    [user, loading, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
