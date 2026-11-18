import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client.js';

const AuthContext = createContext(null);

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
        if (active) setUser(data.user);
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
    setUser({ ...data.user, campusId: data.user?.campusId ?? campusId ?? null });
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await api.get('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      campusId: user?.campusId ?? null,
      loading,
      login,
      logout,
      refreshUser,
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
