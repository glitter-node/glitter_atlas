"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GetPhotoResponse } from "@glitter-atlas/shared";
import { PhotoCard } from "./photo_card";

type SessionState = {
  authenticated: boolean;
  sessionType: "temporary" | "activation" | "approved" | null;
  activationRequired: boolean;
  email: string | null;
  isSuperAdmin: boolean;
};

type PhotoListResponse = {
  items: GetPhotoResponse[];
  nextCursor: string | null;
};

type GalleryView = "mine" | "shared";

export function PhotoGalleryClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [activeView, setActiveView] = useState<GalleryView>("mine");
  const [items, setItems] = useState<GetPhotoResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [visibilityBusyPhotoId, setVisibilityBusyPhotoId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setReady(false);
    setError(null);
    setSelectedPhotoId(null);
    setConfirmDelete(false);
    setIsDeleting(false);
    setVisibilityBusyPhotoId(null);

    async function load() {
      const sessionResponse = await fetch("/api/auth/session", {
        credentials: "same-origin",
      });

      if (sessionResponse.ok === false) {
        router.replace("/");
        return;
      }

      const session = (await sessionResponse.json()) as SessionState;

      if (active !== true) {
        return;
      }

      if (session.authenticated === false) {
        router.replace("/");
        return;
      }

      if (session.activationRequired) {
        router.replace("/auth/activate");
        return;
      }

      const endpoint = activeView === "mine" ? "/api/photos" : "/api/photos/shared";
      const photosResponse = await fetch(endpoint, {
        credentials: "same-origin",
      });

      if (photosResponse.ok === false) {
        setError(activeView === "mine" ? "Photo gallery could not be loaded." : "Shared photos could not be loaded.");
        setReady(true);
        return;
      }

      const data = (await photosResponse.json()) as PhotoListResponse;

      if (active !== true) {
        return;
      }

      setItems(data.items);
      setReady(true);
    }

    void load();

    return () => {
      active = false;
    };
  }, [activeView, router]);

  async function handleDelete(photoId: string) {
    setError(null);
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/photos/${encodeURIComponent(photoId)}/delete`, {
        method: "POST",
        credentials: "same-origin",
      });

      if (response.ok === false) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        setError(payload?.message ?? "Photo could not be removed.");
        return;
      }

      setItems((current) => current.filter((item) => item.photo.id !== photoId));
      setSelectedPhotoId(null);
      setConfirmDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleVisibilityChange(photoId: string, visibility: "private" | "shared") {
    setError(null);
    setVisibilityBusyPhotoId(photoId);

    try {
      const response = await fetch(`/api/photos/${encodeURIComponent(photoId)}/visibility`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ visibility }),
      });

      if (response.ok === false) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        setError(payload?.message ?? "Photo visibility could not be updated.");
        return;
      }

      setItems((current) =>
        current.map((item) =>
          item.photo.id === photoId
            ? {
                ...item,
                photo: {
                  ...item.photo,
                  visibility,
                },
              }
            : item,
        ),
      );
    } finally {
      setVisibilityBusyPhotoId(null);
    }
  }

  if (ready === false) {
    return (
      <main className="page">
        <div className="card dashboard-card">
          <p className="eyebrow">Gallery</p>
          <h1>Loading gallery</h1>
          <p>Checking your session and loading photos.</p>
        </div>
      </main>
    );
  }

  const heading = activeView === "mine" ? "Your uploaded photos" : "Shared photos";
  const description =
    activeView === "mine"
      ? "Review the photos already stored in your authenticated GlitterAtlas workspace."
      : "Review photos that other verified members have explicitly marked as shared.";

  return (
    <main className="page">
      <div className="card dashboard-card">
        <div className="hero-copy">
          <p className="eyebrow">Gallery</p>
          <h1>{heading}</h1>
        </div>
        <p>{description}</p>
        <div className="gallery-view-tabs" role="tablist" aria-label="Photo gallery views">
          <button
            type="button"
            className={`button ${activeView === "mine" ? "gallery-view-tab-active" : "button-secondary"}`}
            onClick={() => setActiveView("mine")}
            aria-pressed={activeView === "mine"}
          >
            My Photos
          </button>
          <button
            type="button"
            className={`button ${activeView === "shared" ? "gallery-view-tab-active" : "button-secondary"}`}
            onClick={() => setActiveView("shared")}
            aria-pressed={activeView === "shared"}
          >
            Shared
          </button>
        </div>
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
            <h2>{activeView === "mine" ? "No photos yet" : "No shared photos yet"}</h2>
            <p>
              {activeView === "mine"
                ? "Your next completed upload will appear here."
                : "Shared photos will appear here when a member enables shared visibility."}
            </p>
          </div>
        ) : (
          <div className="gallery-list">
            {items.map((item) => (
              <PhotoCard
                key={item.photo.id}
                photo={item}
                ownerControlsEnabled={activeView === "mine"}
                visibilityBusy={visibilityBusyPhotoId === item.photo.id}
                deleteSelected={selectedPhotoId === item.photo.id}
                deleteConfirmed={selectedPhotoId === item.photo.id && confirmDelete}
                deleteBusy={selectedPhotoId === item.photo.id && isDeleting}
                onVisibilityChange={(visibility) => handleVisibilityChange(item.photo.id, visibility)}
                onDeleteSelectionChange={(selected) => {
                  setError(null);
                  if (selected) {
                    setSelectedPhotoId(item.photo.id);
                    setConfirmDelete(false);
                    return;
                  }

                  if (selectedPhotoId === item.photo.id) {
                    setSelectedPhotoId(null);
                    setConfirmDelete(false);
                  }
                }}
                onDeleteConfirmationChange={(confirmed) => {
                  setConfirmDelete(confirmed);
                }}
                onDelete={() => handleDelete(item.photo.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
