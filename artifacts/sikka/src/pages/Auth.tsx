import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '@clerk/react';
import { SignIn } from '@clerk/react';
import { shadcn } from '@clerk/themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { t, Language } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ArrowLeft, Users } from 'lucide-react';
import { toast } from 'sonner';
import LanguageSelect from '@/components/LanguageSelect';
import { api } from '@/lib/api';

type Step = 'language' | 'signin' | 'nationality' | 'admin';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

const clerkAppearance = {
  baseTheme: shadcn,
  variables: {
    colorPrimary: '#3b82f6',
    colorForeground: '#161b27',
    colorMutedForeground: '#6b7280',
    colorDanger: '#ef4444',
    colorBackground: '#f8fafc',
    colorInput: '#e2e8f0',
    colorInputForeground: '#161b27',
    colorNeutral: '#e2e8f0',
    fontFamily: "'DM Sans', 'Cairo', sans-serif",
    borderRadius: '0.5rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white dark:bg-gray-900 rounded-2xl w-full max-w-full overflow-hidden shadow-lg',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-gray-900 font-bold',
    headerSubtitle: 'text-gray-500',
    formButtonPrimary: 'bg-blue-500 hover:bg-blue-600 text-white font-semibold',
    formFieldInput: 'border-gray-300 bg-white text-gray-900',
    footerActionLink: 'text-blue-600 font-semibold',
    dividerLine: 'border-gray-200',
    socialButtonsBlockButton: 'border border-gray-200 hover:border-blue-400',
  },
};

const slideVariants = {
  enter: { x: 50, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -50, opacity: 0 },
};

const Auth = () => {
  const { user: clerkUser } = useUser();
  const { language, setLanguage, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const onboard = searchParams.get('onboard') === '1';
  const adminParam = searchParams.get('step') === 'admin';

  const [step, setStep] = useState<Step>(() => {
    if (adminParam) return 'admin';
    if (onboard) return 'nationality';
    return 'language';
  });

  const [nationality, setNationality] = useState<'egyptian' | 'foreigner'>('egyptian');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (clerkUser && step === 'language') {
      navigate('/');
    }
  }, [clerkUser, step, navigate]);

  useEffect(() => {
    if (onboard) setStep('nationality');
    else if (adminParam) setStep('admin');
  }, [onboard, adminParam]);

  const handleLanguageSelect = (lang: Language) => {
    setLanguage(lang);
    setStep('signin');
  };

  const handleSetNationality = async () => {
    setIsLoading(true);
    try {
      await api.put('/profile', { nationality, language });
      await refreshProfile();
      navigate('/');
    } catch {
      toast.error(language === 'ar' ? 'فشل حفظ البيانات' : 'Failed to save. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipNationality = () => {
    navigate('/');
  };

  const handleAdminSetup = async () => {
    if (!adminUsername.trim() || !adminPassword.trim()) return;
    if (!clerkUser) {
      toast.error(language === 'ar' ? 'يجب تسجيل الدخول أولاً' : 'You must be signed in first');
      setStep('signin');
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/auth/setup-admin', { username: adminUsername, password: adminPassword });
      await refreshProfile();
      toast.success(language === 'ar' ? 'تم منح صلاحيات المسؤول' : 'Admin access granted!');
      navigate('/admin');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (language === 'ar' ? 'بيانات غير صحيحة' : 'Invalid credentials'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mb-8 text-center"
      >
        <h1 className="text-4xl font-bold text-primary tracking-tight">سكة</h1>
        <p className="text-lg font-semibold text-foreground mt-1">Sikka</p>
        <p className="text-sm text-muted-foreground mt-2">{t('tagline', language)}</p>
      </motion.div>

      <div className="w-full max-w-sm">
        <AnimatePresence mode="wait">
          {step === 'language' && (
            <motion.div
              key="language"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('selectLanguage', language)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <LanguageSelect
                    value={language}
                    onChange={handleLanguageSelect}
                    className="w-full"
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setStep('signin')}
                  >
                    {t('continue', language)}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 'signin' && (
            <motion.div
              key="signin"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Button variant="ghost" size="icon" onClick={() => setStep('language')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">{t('back', language)}</span>
              </div>
              <SignIn
                routing="hash"
                signUpUrl={`${basePath}/sign-up`}
                fallbackRedirectUrl={`${basePath}/auth?onboard=1`}
                appearance={clerkAppearance}
              />
            </motion.div>
          )}

          {step === 'nationality' && (
            <motion.div
              key="nationality"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Users className="h-5 w-5 text-primary" />
                    {t('selectNationality', language)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    variant={nationality === 'egyptian' ? 'default' : 'outline'}
                    className="w-full justify-start text-base"
                    onClick={() => setNationality('egyptian')}
                  >
                    {t('egyptian', language)}
                  </Button>
                  <Button
                    variant={nationality === 'foreigner' ? 'default' : 'outline'}
                    className="w-full justify-start text-base"
                    onClick={() => setNationality('foreigner')}
                  >
                    {t('foreigner', language)}
                  </Button>
                  <Button
                    onClick={handleSetNationality}
                    disabled={isLoading}
                    className="w-full mt-4"
                  >
                    {isLoading ? '...' : t('continue', language)}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-sm text-muted-foreground"
                    onClick={handleSkipNationality}
                  >
                    {language === 'ar' ? 'تخطي' : 'Skip for now'}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 'admin' && (
            <motion.div
              key="admin"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setStep(clerkUser ? 'nationality' : 'language')}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Shield className="h-5 w-5 text-primary" />
                      {t('adminLogin', language)}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!clerkUser && (
                    <p className="text-sm text-muted-foreground text-center">
                      {language === 'ar'
                        ? 'سجّل الدخول أولاً ثم أدخل بيانات المسؤول'
                        : 'Sign in first, then enter admin credentials below'}
                    </p>
                  )}
                  <Input
                    type="text"
                    placeholder={t('username', language)}
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    dir="ltr"
                  />
                  <Input
                    type="password"
                    placeholder={t('password', language)}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    dir="ltr"
                    onKeyDown={(e) => e.key === 'Enter' && handleAdminSetup()}
                  />
                  <Button
                    onClick={handleAdminSetup}
                    disabled={isLoading || !adminUsername.trim() || !adminPassword.trim()}
                    className="w-full"
                  >
                    {isLoading ? '...' : t('login', language)}
                  </Button>
                  {!clerkUser && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setStep('signin')}
                    >
                      {language === 'ar' ? 'تسجيل الدخول عبر Clerk' : 'Sign in with Clerk first'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {step !== 'admin' && (
        <button
          onClick={() => setStep('admin')}
          className="mt-6 text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          <Shield className="h-3 w-3" />
          {t('admin', language)}
        </button>
      )}
    </div>
  );
};

export default Auth;
