import { Suspense } from 'react';
import { DashboardClient } from '../../components/dashboard_client';

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="card dashboard-card">
            <p className="eyebrow">Dashboard</p>
            <h1>Loading your dashboard</h1>
            <p>Checking your authenticated session.</p>
          </div>
        </main>
      }
    >
      <DashboardClient />
    </Suspense>
  );
}
