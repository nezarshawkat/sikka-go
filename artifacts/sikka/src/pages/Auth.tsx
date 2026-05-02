import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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

type Step = 'language' | 'phone' | 'otp' | 'nationality' | 'admin';

const countriesByDialLength = [...countries].sort((a, b) => b.dial.length - a.dial.length);
const stripNationalPrefix = (value: string) => value.replace(/^0/, '');
const buildFullPhone = (country: Country, localNumber: string) => `${country.dial}${stripNationalPrefix(localNumber)}`;
const detectCountryFromPhone = (value: string) => {
  const normalized = value.startsWith('00') ? `+${value.slice(2)}` : value;
  return countriesByDialLength.find((country) => normalized.startsWith(country.dial));
};

const getFunctionErrorMessage = async (error: unknown, fallback: string) => {
  const response = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: Response }).context : undefined;
  if (response) {
    try {
      const data = await response.clone().json();
      if (typeof data?.error === 'string' && data.error.trim()) return data.error;
    } catch {}
    try {
      const text = await response.clone().text();
      if (text.trim()) return text;
    } catch {}
  }
  return error instanceof Error ? error.message : fallback;
};

const Auth = () => {
  const { language, setLanguage, session } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('language');
  const [selectedCountry, setSelectedCountry] = useState<Country>(countries[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [nationality, setNationality] = useState<'egyptian' | 'foreigner'>('egyptian');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (session) { navigate('/'); return null; }

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

  const handleSendOtp = async () => {
    if (!stripNationalPrefix(phoneNumber).trim() || stripNationalPrefix(phoneNumber).length < 6) {
      toast.error(language === 'ar' ? 'أدخل رقم هاتف صحيح' : 'Enter a valid phone number');
      return;
    }
    setIsLoading(true);
    try {
      const res = await supabase.functions.invoke('send-otp', { body: { phone: fullPhone } });
      if (res.error) { toast.error(await getFunctionErrorMessage(res.error, 'Failed to send OTP')); return; }
      if (res.data?.error) { toast.error(res.data.error); return; }
      toast.success(language === 'ar' ? 'تم إرسال رمز التحقق!' : 'Verification code sent!');
      setStep('otp');
    } catch (err) {
      toast.error(await getFunctionErrorMessage(err, 'Failed to send OTP'));
    } finally { setIsLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    setIsLoading(true);
    try {
      const res = await supabase.functions.invoke('verify-otp', { body: { phone: fullPhone, code: otp } });
      if (res.error) { toast.error(await getFunctionErrorMessage(res.error, 'Invalid code')); return; }
      if (res.data?.error) { toast.error(res.data.error); return; }
      if (res.data?.verification_url) {
        const url = new URL(res.data.verification_url);
        const token_hash = url.searchParams.get('token') || res.data.token_hash;
        if (token_hash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' });
          if (error) { toast.error(error.message); return; }
        }
      }
      if (res.data?.is_new) setStep('nationality');
      else navigate('/');
    } catch (err) {
      toast.error(await getFunctionErrorMessage(err, 'Verification failed'));
    } finally { setIsLoading(false); }
  };

  const handleSetNationality = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ nationality, language }).eq('user_id', user.id);
    }
    setIsLoading(false);
    navigate('/');
  };

  const handleAdminLogin = async () => {
    if (!adminUsername.trim() || !adminPassword.trim()) return;
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: `${adminUsername}@sikka.admin`, password: adminPassword });
    setIsLoading(false);
    if (error) toast.error(error.message);
    else navigate('/admin');
  };

  const slideVariants = { enter: { x: 50, opacity: 0 }, center: { x: 0, opacity: 1 }, exit: { x: -50, opacity: 0 } };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-primary tracking-tight">سكة</h1>
        <p className="text-lg font-semibold text-foreground mt-1">Sikka</p>
        <p className="text-sm text-muted-foreground mt-2">{t('tagline', language)}</p>
      </motion.div>

      <AnimatePresence mode="wait">
        {step === 'language' && (
          <motion.div key="language" variants={slideVariants} initial="enter" animate="center" exit="exit" className="w-full max-w-sm">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('selectLanguage', language)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <LanguageSelect value={language} onChange={(lang) => { setLanguage(lang); setStep('phone'); }} className="w-full" />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'phone' && (
          <motion.div key="phone" variants={slideVariants} initial="enter" animate="center" exit="exit" className="w-full max-w-sm">
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
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2" dir="ltr">
                  <CountryCodeSelect selected={selectedCountry} onSelect={setSelectedCountry} />
                  <Input
                    type="tel" inputMode="numeric"
                    placeholder={t('enterPhone', language)}
                    value={phoneNumber}
                    onChange={(e) => handlePhoneInput(e.target.value)}
                    dir="ltr" className="text-base flex-1"
                  />
                </div>
                <Button onClick={handleSendOtp} disabled={isLoading || stripNationalPrefix(phoneNumber).length < 6} className="w-full">
                  {isLoading ? '...' : t('sendOtp', language)}
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
                  <Button variant="ghost" size="icon" onClick={() => setStep('phone')}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <CardTitle className="text-lg">{t('enterOtp', language)}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  {language === 'ar' ? `تم إرسال الرمز إلى ${fullPhone}` : `Code sent to ${fullPhone}`}
                </p>
                <Input
                  type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  dir="ltr" className="text-center text-2xl tracking-widest"
                />
                <Button onClick={handleVerifyOtp} disabled={isLoading || otp.length !== 6} className="w-full">
                  {isLoading ? '...' : t('verifyOtp', language)}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'nationality' && (
          <motion.div key="nationality" variants={slideVariants} initial="enter" animate="center" exit="exit" className="w-full max-w-sm">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-primary" />
                  {t('selectNationality', language)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant={nationality === 'egyptian' ? 'default' : 'outline'} className="w-full justify-start text-base" onClick={() => setNationality('egyptian')}>
                  {t('egyptian', language)}
                </Button>
                <Button variant={nationality === 'foreigner' ? 'default' : 'outline'} className="w-full justify-start text-base" onClick={() => setNationality('foreigner')}>
                  {t('foreigner', language)}
                </Button>
                <Button onClick={handleSetNationality} disabled={isLoading} className="w-full mt-4">
                  {isLoading ? '...' : t('continue', language)}
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
                <Input type="text" placeholder={t('username', language)} value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} dir="ltr" />
                <Input type="password" placeholder={t('password', language)} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} dir="ltr" />
                <Button onClick={handleAdminLogin} disabled={isLoading} className="w-full">
                  {isLoading ? '...' : t('login', language)}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {step !== 'admin' && (
        <button onClick={() => setStep('admin')} className="mt-6 text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
          <Shield className="h-3 w-3" />
          {t('admin', language)}
        </button>
      )}
    </div>
  );
};

export default Auth;
