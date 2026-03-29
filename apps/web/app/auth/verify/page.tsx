import { Suspense } from 'react';
import { VerifyClient } from '../../../components/verify_client';

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="card auth-card">
            <p className="eyebrow">Access</p>
            <h1>Verifying sign-in link</h1>
            <p>Completing email verification...</p>
          </div>
        </main>
      }
    >
      <VerifyClient />
    </Suspense>
  );
}
