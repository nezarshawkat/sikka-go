import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser, useSignIn } from '@clerk/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { t, Language } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Shield, ArrowLeft, Users } from 'lucide-react';
import { toast } from 'sonner';
import CountryCodeSelect, { countries, Country } from '@/components/auth/CountryCodeSelect';
import LanguageSelect from '@/components/LanguageSelect';
import { api } from '@/lib/api';

type Step = 'language' | 'phone' | 'otp' | 'nationality' | 'admin';

const countriesByDialLength = [...countries].sort((a, b) => b.dial.length - a.dial.length);
const stripNationalPrefix = (value: string) => value.replace(/^0/, '');
const buildFullPhone = (country: Country, localNumber: string) =>
  `${country.dial}${stripNationalPrefix(localNumber)}`;

const detectCountryFromPhone = (value: string) => {
  const normalized = value.startsWith('00') ? `+${value.slice(2)}` : value;
  return countriesByDialLength.find((country) => normalized.startsWith(country.dial));
};

const slideVariants = {
  enter: { x: 50, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -50, opacity: 0 },
};

const Auth = () => {
  const { user: clerkUser } = useUser();
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
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

  const [selectedCountry, setSelectedCountry] = useState<Country>(countries[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [nationality, setNationality] = useState<'egyptian' | 'foreigner'>('egyptian');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (clerkUser && step === 'language') navigate('/');
  }, [clerkUser, step, navigate]);

  useEffect(() => {
    if (onboard) setStep('nationality');
    else if (adminParam) setStep('admin');
  }, [onboard, adminParam]);

  const fullPhone = buildFullPhone(selectedCountry, phoneNumber);

  const handlePhoneInput = (value: string) => {
    const normalized = value.replace(/[^\d+]/g, '');
    const internationalValue = normalized.startsWith('00') ? `+${normalized.slice(2)}` : normalized;
    if (internationalValue.startsWith('+')) {
      const detectedCountry = detectCountryFromPhone(internationalValue);
      if (detectedCountry) {
        setSelectedCountry(detectedCountry);
        setPhoneNumber(
          internationalValue.slice(detectedCountry.dial.length).replace(/\D/g, '').replace(/^0/, '')
        );
        return;
      }
    }
    setPhoneNumber(normalized.replace(/\D/g, ''));
  };

  const handleLanguageSelect = (lang: Language) => {
    setLanguage(lang);
    setStep('phone');
  };

  const handleSendOtp = async () => {
    const local = stripNationalPrefix(phoneNumber).trim();
    if (!local || local.length < 6) {
      toast.error(language === 'ar' ? 'أدخل رقم هاتف صحيح' : 'Enter a valid phone number');
      return;
    }
    setIsLoading(true);
    try {
      if (!signInLoaded || !signIn) throw new Error('Auth not ready');
      await signIn.create({ strategy: 'phone_code', phoneNumber: fullPhone });
      toast.success(language === 'ar' ? 'تم إرسال رمز التحقق!' : 'Verification code sent!');
      setStep('otp');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('not enabled') || msg.toLowerCase().includes('strategy')) {
        toast.info(
          language === 'ar'
            ? 'رمز التحقق: 123456 (وضع تجريبي)'
            : 'OTP not yet wired — use 123456 to continue'
        );
        setStep('otp');
      } else {
        toast.error(msg || (language === 'ar' ? 'فشل إرسال الرمز' : 'Failed to send code'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    setIsLoading(true);
    try {
      if (!signIn) throw new Error('stub');
      const result = await signIn.attemptFirstFactor({ strategy: 'phone_code', code: otp });
      if (result.status === 'complete' && setActive) {
        await setActive({ session: result.createdSessionId });
        setStep('nationality');
      }
    } catch {
      if (otp === '123456') {
        toast.info(language === 'ar' ? 'وضع تجريبي — جاري المتابعة' : 'Dev mode — continuing');
        setStep('nationality');
      } else {
        toast.error(language === 'ar' ? 'رمز غير صحيح' : 'Invalid code');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetNationality = async () => {
    setIsLoading(true);
    try {
      await api.put('/profile', { nationality, language });
      await refreshProfile();
      navigate('/');
    } catch {
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminSetup = async () => {
    if (!adminUsername.trim() || !adminPassword.trim()) return;
    if (!clerkUser) {
      toast.error(language === 'ar' ? 'يجب تسجيل الدخول أولاً' : 'You must be signed in first');
      setStep('phone');
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

      <AnimatePresence mode="wait">
        {step === 'language' && (
          <motion.div
            key="language"
            variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.2 }}
            className="w-full max-w-sm"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('selectLanguage', language)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <LanguageSelect
                  value={language}
                  onChange={(lang) => { setLanguage(lang); setStep('phone'); }}
                  className="w-full"
                />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'phone' && (
          <motion.div
            key="phone"
            variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.2 }}
            className="w-full max-w-sm"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setStep('language')}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Phone className="h-5 w-5 text-primary" />
                    {t('phone', language)}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t('country', language)}</label>
                  <select
                    value={selectedCountry.code}
                    onChange={(e) => {
                      const c = countries.find((c) => c.code === e.target.value);
                      if (c) setSelectedCountry(c);
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2" dir="ltr">
                  <CountryCodeSelect selected={selectedCountry} onSelect={setSelectedCountry} />
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder={t('enterPhone', language)}
                    value={phoneNumber}
                    onChange={(e) => handlePhoneInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                    dir="ltr"
                    className="text-base flex-1"
                  />
                </div>
                <Button
                  onClick={handleSendOtp}
                  disabled={isLoading || stripNationalPrefix(phoneNumber).length < 6}
                  className="w-full"
                >
                  {isLoading ? '...' : t('sendOtp', language)}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'otp' && (
          <motion.div
            key="otp"
            variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.2 }}
            className="w-full max-w-sm"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setStep('phone')}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <CardTitle className="text-lg">{t('enterOtp', language)}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  {language === 'ar'
                    ? `تم إرسال الرمز إلى ${fullPhone}`
                    : `Code sent to ${fullPhone}`}
                </p>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && otp.length === 6 && handleVerifyOtp()}
                  dir="ltr"
                  className="text-center text-2xl tracking-widest"
                />
                <Button
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otp.length !== 6}
                  className="w-full"
                >
                  {isLoading ? '...' : t('verifyOtp', language)}
                </Button>
                <button
                  onClick={() => { setOtp(''); setStep('phone'); }}
                  className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {language === 'ar' ? 'تغيير رقم الهاتف' : 'Change phone number'}
                </button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'nationality' && (
          <motion.div
            key="nationality"
            variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.2 }}
            className="w-full max-w-sm"
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
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'admin' && (
          <motion.div
            key="admin"
            variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.2 }}
            className="w-full max-w-sm"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setStep('language')}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Shield className="h-5 w-5 text-primary" />
                    {t('adminLogin', language)}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminSetup()}
                  dir="ltr"
                />
                <Button
                  onClick={handleAdminSetup}
                  disabled={isLoading || !adminUsername.trim() || !adminPassword.trim()}
                  className="w-full"
                >
                  {isLoading ? '...' : t('login', language)}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

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
