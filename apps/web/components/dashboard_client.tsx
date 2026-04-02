'use client';

import type { SessionState } from '@glitter-atlas/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminPhotoOperationsPanel } from './admin_photo_operations_panel';
import { MemberDirectoryPanel } from './member_directory_panel';

export function DashboardClient() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const response = await fetch('/api/auth/session', {
        credentials: 'same-origin',
      });

      if (response.ok === false) {
        router.replace('/');
        return;
      }

      const data = (await response.json()) as SessionState;

      if (active === false) {
        return;
      }

      if (data.authenticated === false) {
        router.replace('/');
        return;
      }

      if (data.activationRequired) {
        router.replace('/auth/activate');
        return;
      }

      if (data.sessionType !== 'approved') {
        router.replace('/');
        return;
      }

      setSession(data);
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    setIsLoggingOut(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (response.ok === false) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to log out.');
      }

      setSession(null);
      router.replace('/');
      router.refresh();
    } catch (logoutError) {
      const message =
        logoutError instanceof Error ? logoutError.message : 'Failed to log out.';
      setError(message);
      setIsLoggingOut(false);
    }
  }

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
        {session.isSuperAdmin ? <MemberDirectoryPanel /> : null}
        {session.isSuperAdmin ? <AdminPhotoOperationsPanel /> : null}
        {error ? <p className="status status-error">{error}</p> : null}
        <div className="surface-note">
          <h2>Signed-in account</h2>
          <p>{session.email}</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Signing out...' : 'Log out'}
          </button>
        </div>
      </div>
    </main>
  );
}
