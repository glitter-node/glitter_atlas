import { Suspense } from 'react';
import { ResetPasswordClient } from '../../../components/reset_password_client';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <div className="card auth-card">
            <p className="eyebrow">Password Setup</p>
            <h1>Set your password</h1>
            <p>Loading your account email...</p>
          </div>
        </main>
      }
    >
      <ResetPasswordClient />
    </Suspense>
  );
}
