'use client';

import { useEffect, useState } from 'react';

type PendingApprovalCandidate = {
  email: string;
  lastSeenAt: string;
};

export function AdminApprovalPanel() {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPendingApprovals() {
      try {
        setIsLoading(true);
        setError(null);

        const pendingResponse = await fetch('/api/auth/admin/pending-approvals', {
          credentials: 'same-origin',
        });

        if (!pendingResponse.ok) {
          const data = (await pendingResponse.json().catch(() => null)) as
            | { message?: string | string[] }
            | null;
          const message = Array.isArray(data?.message)
            ? data?.message[0]
            : data?.message;
          throw new Error(message ?? 'Failed to load pending approvals.');
        }

        const pendingData = (await pendingResponse.json()) as {
          items?: PendingApprovalCandidate[];
        };

        if (!active) {
          return;
        }

        setPendingApprovals(pendingData.items ?? []);
      } catch (fetchError) {
        if (!active) {
          return;
        }

        const message =
          fetchError instanceof Error
            ? fetchError.message
            : 'Failed to load pending approvals.';
        setError(message);
        setPendingApprovals([]);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadPendingApprovals();

    return () => {
      active = false;
    };
  }, []);

  async function handleApprove(email: string) {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/admin/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
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
        current.filter((candidate) => candidate.email !== email),
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

  return (
    <div className="surface-note surface-note-admin">
      <h2>Pending approvals</h2>
      {error ? <p className="status status-error">{error}</p> : null}
      {isLoading ? (
        <p>Loading pending approvals.</p>
      ) : pendingApprovals.length === 0 ? (
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
  );
}
