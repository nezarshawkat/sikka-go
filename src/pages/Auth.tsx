import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { t, Language } from '@/lib/i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, Shield, ArrowLeft, Globe, Users } from 'lucide-react';
import { toast } from 'sonner';

type Step = 'language' | 'phone' | 'otp' | 'nationality' | 'admin';

const Auth = () => {
  const { language, setLanguage, session } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('language');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [nationality, setNationality] = useState<'egyptian' | 'foreigner'>('egyptian');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (session) {
    navigate('/');
    return null;
  }

  const handleSendOtp = async () => {
    if (!phone.trim()) return;
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('OTP sent!');
      setStep('otp');
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) return;
    setIsLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' });
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setStep('nationality');
    }
  };

  const handleSetNationality = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ nationality, language })
        .eq('user_id', user.id);
    }
    setIsLoading(false);
    navigate('/');
  };

  const handleAdminLogin = async () => {
    if (!adminEmail.trim() || !adminPassword.trim()) return;
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      navigate('/admin');
    }
  };

  const slideVariants = {
    enter: { x: 50, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -50, opacity: 0 },
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      {/* Logo / Brand */}
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
          <motion.div key="language" variants={slideVariants} initial="enter" animate="center" exit="exit" className="w-full max-w-sm">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe className="h-5 w-5 text-primary" />
                  {t('selectLanguage', language)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant={language === 'en' ? 'default' : 'outline'}
                  className="w-full justify-start text-base"
                  onClick={() => { setLanguage('en'); setStep('phone'); }}
                >
                  🇬🇧 English
                </Button>
                <Button
                  variant={language === 'ar' ? 'default' : 'outline'}
                  className="w-full justify-start text-base"
                  onClick={() => { setLanguage('ar'); setStep('phone'); }}
                >
                  🇪🇬 العربية
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
                <Input
                  type="tel"
                  placeholder={t('enterPhone', language)}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  className="text-base"
                />
                <Button onClick={handleSendOtp} disabled={isLoading} className="w-full">
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
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  dir="ltr"
                  className="text-center text-2xl tracking-widest"
                />
                <Button onClick={handleVerifyOtp} disabled={isLoading} className="w-full">
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
                <Button
                  variant={nationality === 'egyptian' ? 'default' : 'outline'}
                  className="w-full justify-start text-base"
                  onClick={() => setNationality('egyptian')}
                >
                  🇪🇬 {t('egyptian', language)}
                </Button>
                <Button
                  variant={nationality === 'foreigner' ? 'default' : 'outline'}
                  className="w-full justify-start text-base"
                  onClick={() => setNationality('foreigner')}
                >
                  🌍 {t('foreigner', language)}
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
                <Input
                  type="email"
                  placeholder={t('email', language)}
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  dir="ltr"
                />
                <Input
                  type="password"
                  placeholder={t('password', language)}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  dir="ltr"
                />
                <Button onClick={handleAdminLogin} disabled={isLoading} className="w-full">
                  {isLoading ? '...' : t('login', language)}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin entry */}
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
