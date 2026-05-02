import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, LogOut, Shield, User } from 'lucide-react';
import { motion } from 'framer-motion';
import LanguageSelect from '@/components/LanguageSelect';
import ThemeToggle from '@/components/ThemeToggle';

const Profile = () => {
  const { user, profile, isAdmin, language, setLanguage, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 bg-card/95 backdrop-blur-sm border-b z-10 p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold text-lg">{t('profile', language)}</h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      <div className="p-4 space-y-4">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <Card>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{profile?.displayName ?? profile?.phone ?? user?.id?.replace(/^(?:phone|admin):/, '') ?? 'User'}</p>
                <p className="text-sm text-muted-foreground capitalize">{profile?.nationality || 'egyptian'}</p>
              </div>
              {isAdmin && (
                <div className="ml-auto">
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Admin
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                {t('language', language)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LanguageSelect value={language} onChange={setLanguage} className="w-full" />
            </CardContent>
          </Card>
        </motion.div>

        {isAdmin && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
            <Button variant="outline" className="w-full" onClick={() => navigate('/admin')}>
              <Shield className="h-4 w-4 mr-2" />
              {t('dashboard', language)}
            </Button>
          </motion.div>
        )}

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}>
          <Button variant="destructive" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            {t('logout', language)}
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default Profile;
