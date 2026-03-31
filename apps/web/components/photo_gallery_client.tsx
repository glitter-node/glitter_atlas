'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { GetPhotoResponse } from '@glitter-atlas/shared';

type SessionState = {
  authenticated: boolean;
  sessionType: 'temporary' | 'activation' | 'approved' | null;
  activationRequired: boolean;
  email: string | null;
  isSuperAdmin: boolean;
};

type PhotoListResponse = {
  items: GetPhotoResponse[];
  nextCursor: string | null;
};

export function PhotoGalleryClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<GetPhotoResponse[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const sessionResponse = await fetch('/api/auth/session', {
        credentials: 'same-origin',
      });

      if (!sessionResponse.ok) {
        router.replace('/');
        return;
      }

      const session = (await sessionResponse.json()) as SessionState;

      if (!active) {
        return;
      }

      if (!session.authenticated) {
        router.replace('/');
        return;
      }

      if (session.activationRequired) {
        router.replace('/auth/activate');
        return;
      }

      const photosResponse = await fetch('/api/photos?limit=20', {
        credentials: 'same-origin',
      });

      if (!photosResponse.ok) {
        setError('Photo gallery could not be loaded.');
        setReady(true);
        return;
      }

      const data = (await photosResponse.json()) as PhotoListResponse;

      if (!active) {
        return;
      }

      setItems(data.items);
      setReady(true);
    }

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  if (!ready) {
    return (
      <main className="page">
        <div className="card dashboard-card">
          <p className="eyebrow">Gallery</p>
          <h1>Loading gallery</h1>
          <p>Checking your session and loading uploaded photos.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="card dashboard-card">
        <div className="hero-copy">
          <p className="eyebrow">Gallery</p>
          <h1>Your uploaded photos</h1>
        </div>
        <p>Review the photos already stored in your authenticated GlitterAtlas workspace.</p>
        <div className="button-row">
          <Link className="button" href="/photos/upload">
            Upload another photo
          </Link>
          <Link className="button button-secondary" href="/dashboard">
            Back to dashboard
          </Link>
        </div>
        {error ? <p className="status status-error">{error}</p> : null}
        {items.length === 0 ? (
          <div className="surface-note">
            <h2>No photos yet</h2>
            <p>Your next completed upload will appear here.</p>
          </div>
        ) : (
          <div className="gallery-list">
            {items.map((item) => (
              <article className="gallery-item" key={item.photo.id}>
                {item.asset?.displayUrl ? (
                  <img
                    className="gallery-image"
                    src={item.asset.displayUrl}
                    alt={item.photo.title ?? `Photo ${item.photo.id}`}
                  />
                ) : null}
                <div className="gallery-item-header">
                  <h2>{item.photo.title ?? item.asset?.objectKey ?? `Photo ${item.photo.id}`}</h2>
                  <span className="status-badge status-badge-approved">
                    {item.photo.status}
                  </span>
                </div>
                <p>Photo ID: {item.photo.id}</p>
                <p>MIME type: {item.photo.mimeType ?? 'unknown'}</p>
                <p>Created at: {new Date(item.photo.createdAt).toLocaleString()}</p>
                <p>Object key: {item.asset?.objectKey ?? 'missing asset metadata'}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
