import { Bell, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { runDailySync } from '@/services/mockCauseListService';
import { generateNotificationsForMatches } from '@/services/mockNotificationService';
import { toast } from 'sonner';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    if (!user || syncing) return;
    setSyncing(true);
    try {
      const syncResult = await runDailySync(user.organization.id);
      const notifResult = await generateNotificationsForMatches(user.organization.id);
      toast.success(
        `Daily cause list sync completed successfully. ${syncResult.matchesFound} cases matched and ${notifResult.generated} notifications generated.`,
        { duration: 6000 }
      );
    } catch (err) {
      toast.error('Sync failed. Please try again.');
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSync}
          loading={syncing}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          Run Daily Sync
        </Button>
        <div className="relative">
          <Bell className="w-5 h-5 text-muted-foreground cursor-pointer hover:text-foreground" />
        </div>
        <div className="flex items-center gap-2 pl-3 border-l">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
            {user?.profile.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium leading-tight">{user?.profile.full_name}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.profile.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
