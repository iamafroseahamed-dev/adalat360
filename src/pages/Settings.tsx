import { Settings as SettingsIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Settings() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Configure your organisation preferences, notification providers, and integrations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <SettingsIcon className="h-4 w-4" />
            Organisation Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Settings and configuration options will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
