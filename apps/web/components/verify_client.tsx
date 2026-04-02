'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type VerifyResponse = {
  ok: boolean;
  sessionType: 'temporary' | 'activation' | 'approved';
  activationRequired: boolean;
  email: string;
};

export function VerifyClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const selector = searchParams.get('selector');
    const token = searchParams.get('token');

    if (!selector || !token) {
      setError('Verification link is incomplete.');
      return;
    }

    const verifiedSelector = selector;
    const verifiedToken = token;
    let active = true;

    async function verify() {
      try {
        const response = await fetch(
          `/api/auth/email/verify?selector=${encodeURIComponent(verifiedSelector)}&token=${encodeURIComponent(verifiedToken)}&format=json`,
          {
            credentials: 'same-origin',
          },
        );

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { message?: string | string[] }
            | null;
          const message = Array.isArray(data?.message)
            ? data?.message[0]
            : data?.message;
          throw new Error(message ?? 'Verification failed.');
        }

        const data = (await response.json()) as VerifyResponse;

        if (!active) {
          return;
        }

        if (data.sessionType === 'temporary') {
          router.replace('/access');
          return;
        }

        router.replace(data.activationRequired ? '/auth/activate' : '/dashboard');
      } catch (verifyError) {
        if (!active) {
          return;
        }

        const message =
          verifyError instanceof Error
            ? verifyError.message
            : 'Verification failed.';
        setError(message);
      }
    }

    void verify();

    return () => {
      active = false;
    };
  }, [router, searchParams]);

  return (
    <main className="page">
      <div className="card auth-card">
        <p className="eyebrow">Access</p>
        {error ? (
          <>
            <h1>Verification failed</h1>
            <p className="status status-error">{error}</p>
          </>
        ) : (
          <>
            <h1>Verifying sign-in link</h1>
            <p>Completing email verification...</p>
          </>
        )}
      </div>
    </main>
  );
}
