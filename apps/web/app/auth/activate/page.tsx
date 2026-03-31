import { Suspense } from 'react';
import { ActivateClient } from '../../../components/activate_client';

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="card auth-card">
            <p className="eyebrow">Account Activation</p>
            <h1>Activate your account</h1>
            <p>Loading your approved email...</p>
          </div>
        </main>
      }
    >
      <ActivateClient />
    </Suspense>
  );
}
