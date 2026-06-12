import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/cases': 'Case Management',
  '/bulk-upload': 'Bulk Upload',
  '/cause-list': 'Cause List',
  '/matched-cases': 'Matched Cases',
  '/notifications': 'Notifications',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

export function AppShell() {
  const location = useLocation();
  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    location.pathname === path || location.pathname.startsWith(path + '/')
  )?.[1] ?? 'Legal Case Alert';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
