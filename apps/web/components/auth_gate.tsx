'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type SessionState = {
  authenticated: boolean;
  sessionType: 'temporary' | 'activation' | 'approved' | null;
  activationRequired: boolean;
  email: string | null;
  isSuperAdmin: boolean;
};

type PendingApprovalCandidate = {
  email: string;
  lastSeenAt: string;
};

const anonymousSession: SessionState = {
  authenticated: false,
  sessionType: null,
  activationRequired: false,
  email: null,
  isSuperAdmin: false,
};

export function AuthGate() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalCandidate[]>([]);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          throw new Error('Failed to load session.');
        }

        const data = (await response.json()) as SessionState;

        if (!active) {
          return;
        }

        if (data.authenticated && !data.activationRequired) {
          router.replace('/dashboard');
          return;
        }

        setSession(data);
        setEmailSent(false);
        setPasswordResetSent(false);

        if (data.authenticated && data.isSuperAdmin) {
          const pendingResponse = await fetch('/api/auth/admin/pending-approvals', {
            credentials: 'same-origin',
          });

          if (!pendingResponse.ok) {
            throw new Error('Failed to load pending approvals.');
          }

          const pendingData = (await pendingResponse.json()) as {
            items?: PendingApprovalCandidate[];
          };

          if (!active) {
            return;
          }

          setPendingApprovals(pendingData.items ?? []);
          return;
        }

        setPendingApprovals([]);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        const message =
          fetchError instanceof Error
            ? fetchError.message
            : 'Failed to load session.';
        setError(message);
        setSession(anonymousSession);
      }
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setPasswordResetSent(false);

    try {
      const response = await fetch('/api/auth/email/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to start email sign-in.');
      }

      setEmailSent(true);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Failed to start email sign-in.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    if (!password.trim()) {
      setError('Password is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setPasswordResetSent(false);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: normalizedEmail,
          password,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to sign in with password.');
      }

      const data = (await response.json()) as SessionState;
      setSession({
        ...data,
        authenticated: true,
      });
      setEmail('');
      setPassword('');
      setEmailSent(false);
      setPendingApprovals([]);
      router.replace('/dashboard');
    } catch (loginError) {
      const message =
        loginError instanceof Error
          ? loginError.message
          : 'Failed to sign in with password.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setPasswordResetSent(false);

    try {
      const response = await fetch('/api/auth/password-reset/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to send password reset email.');
      }

      setPasswordResetSent(true);
    } catch (resetError) {
      const message =
        resetError instanceof Error
          ? resetError.message
          : 'Failed to send password reset email.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to log out.');
      }

      setSession(anonymousSession);
      setPendingApprovals([]);
      setEmail('');
      setPassword('');
      setEmailSent(false);
      setPasswordResetSent(false);
    } catch (logoutError) {
      const message =
        logoutError instanceof Error ? logoutError.message : 'Failed to log out.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApprove(emailToApprove: string) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/admin/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ email: emailToApprove }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to approve email.');
      }

      setPendingApprovals((current) =>
        current.filter((candidate) => candidate.email !== emailToApprove),
      );
    } catch (approvalError) {
      const message =
        approvalError instanceof Error
          ? approvalError.message
          : 'Failed to approve email.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleStartUsing() {
    router.push('/dashboard');
  }

  return (
    <main className="page">
      <div className="card auth-card">
        <div className="hero-copy">
          <p className="eyebrow">GlitterAtlas Access</p>
          <h1>
            {session === null
              ? 'Checking your access'
              : !session.authenticated
                ? emailSent
                  ? 'Check your email'
                  : 'Sign in with email'
                : session.sessionType === 'temporary'
                  ? 'Temporary access'
                  : session.activationRequired
                    ? 'Activate your account'
                  : 'Signed in'}
          </h1>
        </div>
        {session === null ? (
          <>
            <p>Loading your current session.</p>
          </>
        ) : (
          <>
            {error ? <p className="status status-error">{error}</p> : null}
            {!session.authenticated ? (
              emailSent ? (
                <>
                  <p>We sent a sign-in link to the email address you entered.</p>
                  <div className="surface-note">
                    <h2>Next step</h2>
                    <p>Open the link in your inbox to verify your email and start a session.</p>
                  </div>
                </>
              ) : (
                <>
                  {passwordResetSent ? (
                    <div className="surface-note">
                      <h2>Password reset email sent</h2>
                      <p>Open the reset link in your inbox to set a new password for the approved account.</p>
                    </div>
                  ) : null}
                  <p>Use your approved email and password, or request a one-time email link.</p>
                  <form className="auth-form" onSubmit={handlePasswordLogin}>
                    <label className="field">
                      <span>Email</span>
                      <input
                        className="input"
                        type="email"
                        name="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        disabled={isSubmitting}
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        className="input"
                        type="password"
                        name="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={isSubmitting}
                      />
                    </label>
                    <button className="button" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Signing in...' : 'Sign in'}
                    </button>
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={handlePasswordReset}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Working...' : 'Reset password via email'}
                    </button>
                  </form>
                  <div className="surface-note">
                    <h2>Email link</h2>
                    <p>Use a one-time email link if you are requesting temporary access or activating a newly approved account.</p>
                  </div>
                  <form className="auth-form" onSubmit={handleEmailSubmit}>
                    <label className="field">
                      <span>Email</span>
                      <input
                        className="input"
                        type="email"
                        name="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        disabled={isSubmitting}
                      />
                    </label>
                    <button className="button" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? 'Sending...' : 'Send sign-in link'}
                    </button>
                  </form>
                </>
              )
            ) : session.sessionType === 'temporary' ? (
              <>
                <p className="status-badge status-badge-temporary">Verified email</p>
                <dl className="session-meta">
                  <div>
                    <dt>Session type</dt>
                    <dd>temporary</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{session.email}</dd>
                  </div>
                </dl>
                <p>Your email is verified, but this session has temporary access only.</p>
                <div className="surface-note">
                  <h2>Current access</h2>
                  <p>Protected photo features remain unavailable until approval or registration is completed.</p>
                </div>
                <div className="surface-note">
                  <h2>Status</h2>
                  <p>Awaiting approval or registration.</p>
                </div>
                <button className="button" type="button" onClick={handleLogout} disabled={isSubmitting}>
                  {isSubmitting ? 'Signing out...' : 'Log out'}
                </button>
              </>
            ) : session.activationRequired ? (
              <>
                <p className="status-badge status-badge-temporary">Activation required</p>
                <dl className="session-meta">
                  <div>
                    <dt>Session type</dt>
                    <dd>{session.sessionType}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{session.email}</dd>
                  </div>
                </dl>
                <p>Your email is approved, but your account has not been activated yet.</p>
                <div className="surface-note">
                  <h2>Next step</h2>
                  <p>Finish account activation to create your password and start using approved access.</p>
                </div>
                <a className="button button-link" href="/auth/activate">
                  Activate account
                </a>
                <button className="button" type="button" onClick={handleLogout} disabled={isSubmitting}>
                  {isSubmitting ? 'Signing out...' : 'Log out'}
                </button>
              </>
            ) : (
              <>
                <p className="status-badge status-badge-approved">
                  {session.isSuperAdmin ? 'Super admin' : 'Approved access'}
                </p>
                <p>Your account is signed in and ready to continue.</p>
                <div className="surface-note">
                  <h2>Next step</h2>
                  <p>Continue to your dashboard to start using GlitterAtlas.</p>
                </div>
                <div className="button-row">
                  <button className="button" type="button" onClick={handleStartUsing}>
                    Start using GlitterAtlas
                  </button>
                  <button className="button button-secondary" type="button" onClick={handleLogout} disabled={isSubmitting}>
                    {isSubmitting ? 'Signing out...' : 'Log out'}
                  </button>
                </div>
                {session.isSuperAdmin ? (
                  <div className="surface-note surface-note-admin">
                    <h2>Admin-only actions</h2>
                    <p>Abandoned upload cleanup is available for this session.</p>
                  </div>
                ) : null}
                {session.isSuperAdmin ? (
                  <div className="surface-note surface-note-admin">
                    <h2>Pending approvals</h2>
                    {pendingApprovals.length === 0 ? (
                      <p>No pending temporary users are waiting for approval.</p>
                    ) : (
                      <div className="approval-list">
                        {pendingApprovals.map((candidate) => (
                          <div className="approval-item" key={candidate.email}>
                            <div>
                              <p className="approval-email">{candidate.email}</p>
                              <p className="approval-meta">
                                Last seen {new Date(candidate.lastSeenAt).toLocaleString()}
                              </p>
                            </div>
                            <button
                              className="button button-secondary"
                              type="button"
                              onClick={() => handleApprove(candidate.email)}
                              disabled={isSubmitting}
                            >
                              {isSubmitting ? 'Working...' : 'Approve'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
