import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const OPERATOR_KEY = 'bodega_operator';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [operator, setOperator] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadUsuarios = useCallback(async () => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, rol, activo, auth_id')
      .eq('activo', true)
      .order('id');

    if (!error && data) setUsuarios(data);
    return data || [];
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setOperator(null);
        sessionStorage.removeItem(OPERATOR_KEY);
      }
    });

    loadUsuarios();
    return () => subscription.unsubscribe();
  }, [loadUsuarios]);

  useEffect(() => {
    if (!session) return;
    const saved = sessionStorage.getItem(OPERATOR_KEY);
    if (saved) {
      try {
        setOperator(JSON.parse(saved));
      } catch {
        sessionStorage.removeItem(OPERATOR_KEY);
      }
    }
  }, [session]);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    sessionStorage.removeItem(OPERATOR_KEY);
    setOperator(null);
    await supabase.auth.signOut();
  };

  const verifyPin = async (userId, pin) => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre, rol')
      .eq('id', userId)
      .eq('pin', pin)
      .eq('activo', true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data;
  };

  const setOperatorUser = (user) => {
    setOperator(user);
    sessionStorage.setItem(OPERATOR_KEY, JSON.stringify(user));
  };

  const switchOperator = async (userId, pin) => {
    const user = await verifyPin(userId, pin);
    if (!user) throw new Error('PIN incorrecto');
    setOperatorUser(user);
    return user;
  };

  const isAdmin = operator?.rol === 'admin';

  return (
    <AuthContext.Provider
      value={{
        session,
        operator,
        usuarios,
        loading,
        isAdmin,
        signIn,
        signOut,
        switchOperator,
        setOperatorUser,
        verifyPin,
        loadUsuarios,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
