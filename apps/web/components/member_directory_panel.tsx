'use client';

import { useEffect, useMemo, useState } from 'react';

type MemberDirectoryItem = {
  id: number;
  email: string;
  normalized_email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  password_hash: string;
  is_super_admin: boolean;
  isProtected: boolean;
};

type MemberDirectoryResponse = {
  tableName: string;
  primaryKey: string;
  deleteMode: 'soft_delete';
  columnOrder: string[];
  maskedColumns: string[];
  items: MemberDirectoryItem[];
};

function formatCellValue(value: boolean | number | string) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value);
}

export function MemberDirectoryPanel() {
  const [directory, setDirectory] = useState<MemberDirectoryResponse | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedMember = useMemo(
    () => directory?.items.find((item) => item.id === selectedMemberId) ?? null,
    [directory, selectedMemberId],
  );

  useEffect(() => {
    let active = true;

    async function loadDirectory() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch('/api/auth/admin/members', {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { message?: string | string[] }
            | null;
          const message = Array.isArray(data?.message)
            ? data?.message[0]
            : data?.message;
          throw new Error(message ?? 'Failed to load member directory.');
        }

        const data = (await response.json()) as MemberDirectoryResponse;

        if (!active) {
          return;
        }

        setDirectory(data);
        setSelectedMemberId((current) => {
          if (current === null) {
            return data.items[0]?.id ?? null;
          }

          return data.items.some((item) => item.id === current)
            ? current
            : data.items[0]?.id ?? null;
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load member directory.';
        setError(message);
        setDirectory(null);
        setSelectedMemberId(null);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadDirectory();

    return () => {
      active = false;
    };
  }, []);

  async function handleRemoveSelectedMember() {
    if (!selectedMember) {
      setError('Select a member first.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/auth/admin/members/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ id: selectedMember.id }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(data?.message)
          ? data?.message[0]
          : data?.message;
        throw new Error(message ?? 'Failed to remove member.');
      }

      setDirectory((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: current.items.map((item) => (
            item.id === selectedMember.id
              ? {
                  ...item,
                  is_active: false,
                  updated_at: new Date().toISOString(),
                }
              : item
          )),
        };
      });
      setSuccessMessage(`Member ${selectedMember.email} was deactivated.`);
      setConfirmRemoval(false);
    } catch (removeError) {
      const message =
        removeError instanceof Error ? removeError.message : 'Failed to remove member.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="surface-note surface-note-admin member-directory-panel">
      <div className="hero-copy">
        <h2>Member directory</h2>
        <p>Table: <strong>{directory?.tableName ?? 'approved_users'}</strong></p>
        <p>Deletion mode: soft delete via <strong>is_active = false</strong></p>
      </div>
      {error ? <p className="status status-error">{error}</p> : null}
      {successMessage ? <p className="status status-success">{successMessage}</p> : null}
      {isLoading ? (
        <p>Loading members from the live database.</p>
      ) : !directory || directory.items.length === 0 ? (
        <p>No members were returned from {directory?.tableName ?? 'approved_users'}.</p>
      ) : (
        <>
          <div className="member-directory-table-wrap">
            <table className="member-directory-table">
              <thead>
                <tr>
                  {directory.columnOrder.map((columnName) => (
                    <th key={columnName} scope="col">{columnName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {directory.items.map((item) => {
                  const isSelected = item.id === selectedMemberId;
                  return (
                    <tr
                      key={item.id}
                      className={isSelected ? 'member-row-selected' : undefined}
                      onClick={() => {
                        setSelectedMemberId(item.id);
                        setConfirmRemoval(false);
                        setError(null);
                        setSuccessMessage(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedMemberId(item.id);
                          setConfirmRemoval(false);
                          setError(null);
                          setSuccessMessage(null);
                        }
                      }}
                      tabIndex={0}
                    >
                      {directory.columnOrder.map((columnName) => {
                        const value = item[columnName as keyof MemberDirectoryItem] as boolean | number | string;
                        return (
                          <td key={columnName} data-label={columnName}>
                            {formatCellValue(value)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="member-directory-meta">
            <p>Masked columns: {directory.maskedColumns.join(', ')}</p>
            <p>Protected members: active super admin accounts, including gim@glitter.kr.</p>
          </div>
          {selectedMember ? (
            <div className="member-directory-actions">
              <h3>Selected member</h3>
              <p>ID {selectedMember.id} · {selectedMember.email}</p>
              <p>
                {selectedMember.isProtected
                  ? 'This member is protected and cannot be removed.'
                  : !selectedMember.is_active
                    ? 'This member is already inactive.'
                    : 'Select remove only if you intend to deactivate this specific member.'}
              </p>
              {!selectedMember.isProtected && selectedMember.is_active ? (
                <>
                  <label className="landing-checkbox member-confirmation">
                    <input
                      type="checkbox"
                      checked={confirmRemoval}
                      onChange={(event) => setConfirmRemoval(event.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span>I understand this removes the selected member from active access.</span>
                  </label>
                  <div className="button-row">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={handleRemoveSelectedMember}
                      disabled={!confirmRemoval || isSubmitting}
                    >
                      {isSubmitting ? 'Removing...' : 'Remove selected member'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
