import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Language } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Shield, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import CountryCodeSelect, { countries, Country } from '@/components/auth/CountryCodeSelect';
import { api } from '@/lib/api';

type Step = 'language' | 'phone' | 'otp' | 'nationality' | 'admin';

const countriesByDialLength = [...countries].sort((a, b) => b.dial.length - a.dial.length);
const stripNationalPrefix = (value: string) => value.replace(/^0/, '');
const buildFullPhone = (country: Country, localNumber: string) => `${country.dial}${stripNationalPrefix(localNumber)}`;
const detectCountryFromPhone = (value: string) => {
  const normalized = value.startsWith('00') ? `+${value.slice(2)}` : value;
  return countriesByDialLength.find((country) => normalized.startsWith(country.dial));
};

const Auth = () => {
  const { user, setPhoneSession, setLanguage, language } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('language');
  const [selectedCountry, setSelectedCountry] = useState<Country>(countries[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [nationality, setNationality] = useState<'egyptian' | 'foreigner'>('egyptian');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPhone, setPendingPhone] = useState('');

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const fullPhone = buildFullPhone(selectedCountry, phoneNumber);

  const handlePhoneInput = (value: string) => {
    const normalized = value.replace(/[^\d+]/g, '');
    const internationalValue = normalized.startsWith('00') ? `+${normalized.slice(2)}` : normalized;
    if (internationalValue.startsWith('+')) {
      const detectedCountry = detectCountryFromPhone(internationalValue);
      if (detectedCountry) {
        setSelectedCountry(detectedCountry);
        setPhoneNumber(internationalValue.slice(detectedCountry.dial.length).replace(/\D/g, '').replace(/^0/, ''));
        return;
      }
    }
    setPhoneNumber(normalized.replace(/\D/g, ''));
  };

  const handleCountryChange = (countryCode: string) => {
    const nextCountry = countries.find((c) => c.code === countryCode);
    if (nextCountry) setSelectedCountry(nextCountry);
  };

  const [selectedLang, setSelectedLang] = useState<Language>('en');

  const handleSelectLanguage = () => {
    setLanguage(selectedLang);
    setStep('phone');
  };

  const handleSendOtp = async () => {
    if (!stripNationalPrefix(phoneNumber).trim() || stripNationalPrefix(phoneNumber).length < 6) {
      toast.error(language === 'ar' ? 'أدخل رقم هاتف صحيح' : 'Enter a valid phone number');
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.post('/auth/send-otp', { phone: fullPhone });
      toast.success(language === 'ar' ? 'تم إرسال رمز التحقق!' : 'Verification code sent!');
      if (res.dev_code) {
        toast.info(`Dev OTP: ${res.dev_code}`, { duration: 30000 });
      }
      setPendingPhone(fullPhone);
      setStep('otp');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  interface OtpResponse { token: string; userId: string; profile: Parameters<typeof setPhoneSession>[2]; isNew: boolean }
  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    setIsLoading(true);
    try {
      const res = await api.post<OtpResponse>('/auth/verify-otp', { phone: pendingPhone, code: otp });
      setPhoneSession(res.token, res.userId, res.profile);
      if (res.isNew) {
        setStep('nationality');
      } else {
        navigate('/');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Invalid code');
    } finally { setIsLoading(false); }
  };

  const handleSetNationality = async () => {
    setIsLoading(true);
    try {
      await api.put('/profile', { nationality, language });
    } catch {}
    setIsLoading(false);
    navigate('/');
  };

  const handleAdminLogin = async () => {
    if (!adminUsername.trim() || !adminPassword.trim()) return;
    setIsLoading(true);
    try {
      const res = await api.post('/auth/admin-login', {
        username: adminUsername.trim(),
        password: adminPassword,
      });
      setPhoneSession(res.token, res.userId, res.profile, !!res.isAdmin);
      toast.success('Welcome, Admin!');
      navigate('/admin');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Login failed. Check username and password.');
    } finally { setIsLoading(false); }
  };

  const slideVariants = {
    enter: { x: 50, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -50, opacity: 0 },
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-primary tracking-tight">سكة</h1>
        <p className="text-lg font-semibold text-foreground mt-1">Sikka</p>
        <p className="text-sm text-muted-foreground mt-2">Your intelligent transport companion in Egypt</p>
      </motion.div>

      <AnimatePresence mode="wait">
        {step === 'language' && (
          <motion.div key="language" variants={slideVariants} initial="enter" animate="center" exit="exit" className="w-full max-w-sm">
            <Card>
              <CardHeader><CardTitle className="text-lg text-center">Select Language / اختر اللغة</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <select
                  value={selectedLang}
                  onChange={(e) => setSelectedLang(e.target.value as Language)}
                  className="flex h-14 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="en">🇬🇧 English</option>
                  <option value="ar">🇪🇬 العربية</option>
                </select>
                <Button className="w-full h-12 text-base font-semibold" onClick={handleSelectLanguage}>
                  {selectedLang === 'ar' ? 'التالي ←' : 'Next →'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'phone' && (
          <motion.div key="phone" variants={slideVariants} initial="enter" animate="center" exit="exit" className="w-full max-w-sm">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setStep('language')}><ArrowLeft className="h-4 w-4" /></Button>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Phone className="h-5 w-5 text-primary" />
                    {language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {language === 'ar' ? 'الدولة' : 'Country'}
                  </label>
                  <select
                    value={selectedCountry.code}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2" dir="ltr">
                  <CountryCodeSelect selected={selectedCountry} onSelect={setSelectedCountry} />
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder={language === 'ar' ? 'رقم الهاتف' : 'Phone number'}
                    value={phoneNumber}
                    onChange={(e) => handlePhoneInput(e.target.value)}
                    dir="ltr"
                    className="text-base flex-1"
                  />
                </div>
                <Button
                  onClick={handleSendOtp}
                  disabled={isLoading || stripNationalPrefix(phoneNumber).length < 6}
                  className="w-full"
                >
                  {isLoading ? '...' : (language === 'ar' ? 'إرسال الرمز' : 'Send Code')}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'otp' && (
          <motion.div key="otp" variants={slideVariants} initial="enter" animate="center" exit="exit" className="w-full max-w-sm">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setStep('phone')}><ArrowLeft className="h-4 w-4" /></Button>
                  <CardTitle className="text-lg">
                    {language === 'ar' ? 'أدخل رمز التحقق' : 'Enter Verification Code'}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  {language === 'ar' ? `تم إرسال الرمز إلى ${pendingPhone}` : `Code sent to ${pendingPhone}`}
                </p>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  dir="ltr"
                  className="text-center text-2xl tracking-widest"
                />
                <Button
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otp.length !== 6}
                  className="w-full"
                >
                  {isLoading ? '...' : (language === 'ar' ? 'تحقق' : 'Verify')}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'nationality' && (
          <motion.div key="nationality" variants={slideVariants} initial="enter" animate="center" exit="exit" className="w-full max-w-sm">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {language === 'ar' ? 'ما جنسيتك؟' : 'What is your nationality?'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant={nationality === 'egyptian' ? 'default' : 'outline'}
                  className="w-full justify-start text-base h-12"
                  onClick={() => setNationality('egyptian')}
                >
                  🇪🇬 {language === 'ar' ? 'مصري' : 'Egyptian'}
                </Button>
                <Button
                  variant={nationality === 'foreigner' ? 'default' : 'outline'}
                  className="w-full justify-start text-base h-12"
                  onClick={() => setNationality('foreigner')}
                >
                  🌍 {language === 'ar' ? 'أجنبي' : 'Foreigner'}
                </Button>
                <Button onClick={handleSetNationality} disabled={isLoading} className="w-full mt-4">
                  {isLoading ? '...' : (language === 'ar' ? 'متابعة' : 'Continue')}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'admin' && (
          <motion.div key="admin" variants={slideVariants} initial="enter" animate="center" exit="exit" className="w-full max-w-sm">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setStep('language')}><ArrowLeft className="h-4 w-4" /></Button>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Shield className="h-5 w-5 text-primary" />
                    Admin Login
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  type="text"
                  placeholder="Username"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  dir="ltr"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  dir="ltr"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                />
                <Button onClick={handleAdminLogin} disabled={isLoading} className="w-full">
                  {isLoading ? '...' : 'Login'}
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
          <Shield className="h-3 w-3" /> Admin
        </button>
      )}
    </div>
  );
};

export default Auth;
