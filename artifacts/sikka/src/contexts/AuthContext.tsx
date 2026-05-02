import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Language } from '@/lib/i18n';

interface Profile {
  language: string;
  nationality: 'egyptian' | 'foreigner';
  display_name: string | null;
  phone: string | null;
}

interface PhoneUser {
  userId: string;
  profile: Profile | null;
}

interface AuthContextType {
  user: { id: string } | null;
  phoneUser: PhoneUser | null;
  profile: Profile | null;
  isAdmin: boolean;
  isLoading: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  signOut: () => Promise<void>;
  setPhoneSession: (token: string, userId: string, profile: Profile | null, isAdmin?: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  phoneUser: null,
  profile: null,
  isAdmin: false,
  isLoading: true,
  language: 'en',
  setLanguage: () => {},
  signOut: async () => {},
  setPhoneSession: () => {},
});

export const useAuth = () => useContext(AuthContext);

interface SessionResponse {
  userId: string;
  profile: Profile;
  isAdmin: boolean;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [phoneUser, setPhoneUser] = useState<PhoneUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(
    () => !!localStorage.getItem('sikka_phone_token')
  );
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('sikka-lang') as Language) || 'en';
  });

  useEffect(() => {
    const token = localStorage.getItem('sikka_phone_token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    api.get<SessionResponse>('/auth/session')
      .then((data) => {
        setPhoneUser({ userId: data.userId, profile: data.profile });
        setProfile(data.profile);
        setIsAdmin(data.isAdmin);
        if (data.profile?.language) setLanguageState(data.profile.language as Language);
      })
      .catch(() => {
        localStorage.removeItem('sikka_phone_token');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('sikka-lang', lang);
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  };

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const setPhoneSession = (token: string, userId: string, prof: Profile | null, adminFlag?: boolean) => {
    localStorage.setItem('sikka_phone_token', token);
    setPhoneUser({ userId, profile: prof });
    setProfile(prof);
    if (adminFlag) setIsAdmin(true);
  };

  const signOut = async () => {
    const token = localStorage.getItem('sikka_phone_token');
    if (token) {
      await api.post('/auth/logout', {}).catch(() => {});
      localStorage.removeItem('sikka_phone_token');
      setPhoneUser(null);
      setProfile(null);
      setIsAdmin(false);
    }
  };

  const effectiveUser = phoneUser ? { id: phoneUser.userId } : null;

  return (
    <AuthContext.Provider value={{
      user: effectiveUser,
      phoneUser,
      profile,
      isAdmin,
      isLoading,
      language,
      setLanguage,
      signOut,
      setPhoneSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
