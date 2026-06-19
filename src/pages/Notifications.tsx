import { Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Notifications() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Notifications</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage and review all case notifications sent to clients and advocates.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Notification History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Notification logs and history will appear here. Use the Notify button on
            Today's Listings to send case alerts to configured recipients.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
