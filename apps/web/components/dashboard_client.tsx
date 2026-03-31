'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type SessionState = {
  authenticated: boolean;
  sessionType: 'temporary' | 'activation' | 'approved' | null;
  activationRequired: boolean;
  email: string | null;
  isSuperAdmin: boolean;
};

export function DashboardClient() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const response = await fetch('/api/auth/session', {
        credentials: 'same-origin',
      });

      if (!response.ok) {
        router.replace('/');
        return;
      }

      const data = (await response.json()) as SessionState;

      if (!active) {
        return;
      }

      if (!data.authenticated) {
        router.replace('/');
        return;
      }

      if (data.activationRequired) {
        router.replace('/auth/activate');
        return;
      }

      setSession(data);
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [router]);

  if (session === null) {
    return (
      <main className="page">
        <div className="card dashboard-card">
          <p className="eyebrow">Dashboard</p>
          <h1>Loading your dashboard</h1>
          <p>Checking your authenticated session.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="card dashboard-card">
        <div className="hero-copy">
          <p className="eyebrow">Dashboard</p>
          <h1>What do you want to do next?</h1>
        </div>
        <p>Choose a starting point for your signed-in GlitterAtlas session.</p>
        <div className="dashboard-grid">
          <section className="action-card" id="upload-photo">
            <p className="status-badge status-badge-approved">Primary action</p>
            <h2>Upload photo</h2>
            <p>Start a new upload flow and prepare your next photo for the library.</p>
            <Link className="button" href="/photos/upload">
              Upload photo
            </Link>
          </section>
          <section className="action-card" id="view-gallery">
            <p className="status-badge status-badge-approved">Next action</p>
            <h2>View gallery</h2>
            <p>Review the gallery entry point and continue browsing your authenticated space.</p>
            <Link className="button button-secondary" href="/photos">
              View gallery
            </Link>
          </section>
        </div>
        <div className="surface-note">
          <h2>Signed-in account</h2>
          <p>{session.email}</p>
        </div>
      </div>
    </main>
  );
}
