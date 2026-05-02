import React, { createContext, useContext, useEffect, useState } from 'react';
import { useUser, useClerk } from '@clerk/react';
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
  user: any | null;
  phoneUser: PhoneUser | null;
  profile: Profile | null;
  isAdmin: boolean;
  isLoading: boolean;
  language: Language;
  setLanguage: (lang: Language) => void;
  signOut: () => Promise<void>;
  setPhoneSession: (token: string, userId: string, profile: Profile | null) => void;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoaded: clerkLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const [phoneUser, setPhoneUser] = useState<PhoneUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPhoneLoading, setIsPhoneLoading] = useState(
    () => !!localStorage.getItem('sikka_phone_token')
  );
  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('sikka-lang') as Language) || 'en';
  });

  useEffect(() => {
    const token = localStorage.getItem('sikka_phone_token');
    if (!token) {
      setIsPhoneLoading(false);
      return;
    }
    api.get('/auth/session')
      .then((data: any) => {
        setPhoneUser({ userId: data.userId, profile: data.profile });
        setProfile(data.profile);
        setIsAdmin(data.isAdmin);
        if (data.profile?.language) setLanguageState(data.profile.language as Language);
      })
      .catch(() => {
        localStorage.removeItem('sikka_phone_token');
      })
      .finally(() => setIsPhoneLoading(false));
  }, []);

  useEffect(() => {
    if (user && clerkLoaded) {
      const role = (user.publicMetadata as any)?.role;
      setIsAdmin(role === 'admin');
    }
  }, [user, clerkLoaded]);

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

  const setPhoneSession = (token: string, userId: string, prof: Profile | null) => {
    localStorage.setItem('sikka_phone_token', token);
    setPhoneUser({ userId, profile: prof });
    setProfile(prof);
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
    if (user) {
      await clerkSignOut();
    }
  };

  const isLoading = isPhoneLoading;
  const effectiveUser = user || (phoneUser ? { id: phoneUser.userId } : null);

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
