'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { CreatePhotoUploadResponse } from '@glitter-atlas/shared';

type SessionState = {
  authenticated: boolean;
  sessionType: 'temporary' | 'activation' | 'approved' | null;
  activationRequired: boolean;
  email: string | null;
  isSuperAdmin: boolean;
};

export function PhotoUploadClient() {
  const router = useRouter();
  const [sessionReady, setSessionReady] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const response = await fetch('/api/auth/session', {
        credentials: 'same-origin',
      });

      if (!response.ok) {
        router.replace('/');
        return;
      }

      const data = (await response.json()) as SessionState;

      if (!active) {
        return;
      }

      if (!data.authenticated) {
        router.replace('/');
        return;
      }

      if (data.activationRequired) {
        router.replace('/auth/activate');
        return;
      }

      setSessionReady(true);
    }

    void loadSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError('Choose a photo file first.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const createResponse = await fetch('/api/photos/uploads', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Upload session could not be created.');
      }

      const createData = (await createResponse.json()) as CreatePhotoUploadResponse;
      const uploadResponse = await fetch(createData.uploadUrl, {
        method: createData.uploadMethod,
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('File upload to storage failed.');
      }

      const completeResponse = await fetch(
        `/api/photos/${createData.photo.id}/complete`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            objectKey: createData.asset.objectKey,
          }),
        },
      );

      if (!completeResponse.ok) {
        throw new Error('Upload completion failed.');
      }

      setFile(null);
      router.push('/photos');
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Upload failed unexpectedly.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!sessionReady) {
    return (
      <main className="page">
        <div className="card dashboard-card">
          <p className="eyebrow">Upload</p>
          <h1>Preparing upload</h1>
          <p>Checking your authenticated session.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="card dashboard-card">
        <div className="hero-copy">
          <p className="eyebrow">Upload</p>
          <h1>Upload a photo</h1>
        </div>
        <p>Choose one file to create a photo, upload the original asset, and finalize it.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Photo file</span>
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </label>
          {error ? <p className="status status-error">{error}</p> : null}
          <div className="button-row">
            <button className="button" type="submit" disabled={submitting}>
              {submitting ? 'Uploading…' : 'Upload photo'}
            </button>
            <Link className="button button-secondary" href="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
