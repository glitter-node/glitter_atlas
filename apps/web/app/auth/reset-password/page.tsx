import { Suspense } from 'react';
import { ResetPasswordClient } from '../../../components/reset_password_client';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="card auth-card">
            <p className="eyebrow">Password Reset</p>
            <h1>Reset your password</h1>
            <p>Loading your approved email...</p>
          </div>
        </main>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
