import { Suspense } from 'react';
import { VerifyClient } from '../../../components/verify_client';

export default function CompletePage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="card auth-card">
            <p className="eyebrow">Access</p>
            <h1>Completing approval</h1>
            <p>Finishing access upgrade...</p>
          </div>
        </main>
      }
    >
      <VerifyClient />
    </Suspense>
  );
}
