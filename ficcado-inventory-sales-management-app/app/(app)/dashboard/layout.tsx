'use client';

/**
 * app/(app)/dashboard/layout.tsx
 *
 * Protected layout for all dashboard pages.
 * Checks session on mount — redirects to /login if not authenticated.
 * Renders the sidebar + topbar + main content area.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppSidebar from '@/components/AppSidebar';
import MobileHeader from '@/components/MobileHeader';
import LoadingGecko from '@/components/LoadingGecko';
import SessionTimeoutModal from '@/components/SessionTimeoutModal';

interface SessionAdmin {
  name:  string;
  role:  string;
  email: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<SessionAdmin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.admin) {
          setAdmin(data.admin);
        } else {
          router.replace('/login');
        }
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  if (loading) return <LoadingGecko size="full" label="Loading Ficcado…" />;
  if (!admin)  return null;

  return (
    <div className="app-shell">
      <SessionTimeoutModal />
      <AppSidebar
        adminName={admin.name}
        adminRole={admin.role}
        onLogout={handleLogout}
      />
      <main className="app-main">
        <MobileHeader
          adminName={admin.name}
          onLogout={handleLogout}
        />
        <div className="app-content">
          {children}
        </div>
      </main>
    </div>
  );
}
