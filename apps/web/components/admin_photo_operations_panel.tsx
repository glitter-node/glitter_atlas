
'use client';

import { useEffect, useMemo, useState } from 'react';

type AdminPhotoRecord = {
  id: string;
  userId: string | null;
  title: string | null;
  description: string | null;
  capturedAt: string | null;
  mimeType: string | null;
  visibility: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type AdminPhotoLocation = {
  latitude: number | null;
  longitude: number | null;
  locality: string | null;
  countryCode: string | null;
  formattedAddress: string | null;
};

type AdminPhotoAsset = {
  objectKey: string;
  displayUrl: string;
  mimeType: string;
  sizeBytes: number;
};

type AdminPhotoItem = {
  photo: AdminPhotoRecord;
  location: AdminPhotoLocation | null;
  asset: AdminPhotoAsset | null;
};

type AdminPhotoListResponse = {
  filters: {
    userId: string | null;
    visibility: 'private' | 'shared' | null;
    includeDeleted: boolean;
    createdFrom: string | null;
    createdTo: string | null;
  };
  items: AdminPhotoItem[];
};

type FilterState = {
  userId: string;
  visibility: 'all' | 'private' | 'shared';
  includeDeleted: boolean;
  createdFrom: string;
  createdTo: string;
};

const defaultFilters: FilterState = {
  userId: '',
  visibility: 'all',
  includeDeleted: false,
  createdFrom: '',
  createdTo: '',
};

function toQueryDate(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatDate(value: string | null) {
  if (!value) {
    return 'null';
  }

  return new Date(value).toLocaleString();
}

export function AdminPhotoOperationsPanel() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [directory, setDirectory] = useState<AdminPhotoListResponse | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminPhotoItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const selectedFromList = useMemo(
    () => directory?.items.find((item) => item.photo.id === selectedPhotoId) ?? null,
    [directory, selectedPhotoId],
  );

  useEffect(() => {
    let active = true;

    async function loadDirectory() {
      try {
        setIsLoading(true);
        setError(null);

        const params = new URLSearchParams();

        if (appliedFilters.userId.trim()) {
          params.set('user_id', appliedFilters.userId.trim());
        }

        if (appliedFilters.visibility !== 'all') {
          params.set('visibility', appliedFilters.visibility);
        }

        if (appliedFilters.includeDeleted) {
          params.set('include_deleted', 'true');
        }

        const createdFrom = toQueryDate(appliedFilters.createdFrom);
        const createdTo = toQueryDate(appliedFilters.createdTo);

        if (createdFrom) {
          params.set('created_from', createdFrom);
        }

        if (createdTo) {
          params.set('created_to', createdTo);
        }

        const query = params.toString();
        const response = await fetch(query ? `/api/admin/photos?${query}` : '/api/admin/photos', {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { message?: string | string[] }
            | null;
          const message = Array.isArray(data?.message)
            ? data?.message[0]
            : data?.message;
          throw new Error(message ?? 'Failed to load admin photo dataset.');
        }

        const data = (await response.json()) as AdminPhotoListResponse;

        if (!active) {
          return;
        }

        setDirectory(data);
        setSelectedPhotoId((current) => {
          if (current && data.items.some((item) => item.photo.id === current)) {
            return current;
          }

          return data.items[0]?.photo.id ?? null;
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load admin photo dataset.';
        setError(message);
        setDirectory(null);
        setSelectedPhotoId(null);
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
  }, [appliedFilters]);

  useEffect(() => {
    let active = true;

    async function loadDetail() {
      if (!selectedPhotoId) {
        setSelectedDetail(null);
        setDetailError(null);
        return;
      }

      try {
        setIsDetailLoading(true);
        setDetailError(null);

        const response = await fetch(`/api/admin/photos/${encodeURIComponent(selectedPhotoId)}`, {
          credentials: 'same-origin',
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as
            | { message?: string | string[] }
            | null;
          const message = Array.isArray(data?.message)
            ? data?.message[0]
            : data?.message;
          throw new Error(message ?? 'Failed to load admin photo detail.');
        }

        const data = (await response.json()) as AdminPhotoItem;

        if (!active) {
          return;
        }

        setSelectedDetail(data);
      } catch (loadError) {
        if (!active) {
          return;
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load admin photo detail.';
        setDetailError(message);
        setSelectedDetail(null);
      } finally {
        if (active) {
          setIsDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      active = false;
    };
  }, [selectedPhotoId]);

  return (
    <section className="surface-note surface-note-admin member-directory-panel admin-photo-panel">
      <div className="hero-copy">
        <h2>Photo operations view</h2>
        <p>Super admin access to the full physical photo dataset.</p>
      </div>
      {error ? <p className="status status-error">{error}</p> : null}
      <form
        className="auth-form admin-photo-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedFilters(filters);
        }}
      >
        <div className="admin-photo-filter-grid">
          <label className="field">
            <span>User ID</span>
            <input
              className="input"
              value={filters.userId}
              onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))}
              placeholder="All users"
            />
          </label>
          <label className="field">
            <span>Visibility</span>
            <select
              className="input"
              value={filters.visibility}
              onChange={(event) => setFilters((current) => ({
                ...current,
                visibility: event.target.value as FilterState['visibility'],
              }))}
            >
              <option value="all">All</option>
              <option value="private">Private</option>
              <option value="shared">Shared</option>
            </select>
          </label>
          <label className="field">
            <span>Created from</span>
            <input
              className="input"
              type="datetime-local"
              value={filters.createdFrom}
              onChange={(event) => setFilters((current) => ({ ...current, createdFrom: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Created to</span>
            <input
              className="input"
              type="datetime-local"
              value={filters.createdTo}
              onChange={(event) => setFilters((current) => ({ ...current, createdTo: event.target.value }))}
            />
          </label>
        </div>
        <label className="landing-checkbox member-confirmation">
          <input
            type="checkbox"
            checked={filters.includeDeleted}
            onChange={(event) => setFilters((current) => ({ ...current, includeDeleted: event.target.checked }))}
          />
          <span>Include soft-deleted rows</span>
        </label>
        <div className="button-row">
          <button className="button" type="submit">Apply filters</button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              setFilters(defaultFilters);
              setAppliedFilters(defaultFilters);
            }}
          >
            Clear filters
          </button>
        </div>
      </form>
      {isLoading ? (
        <p>Loading photos from the live database.</p>
      ) : !directory || directory.items.length === 0 ? (
        <p>No photos matched the current admin filters.</p>
      ) : (
        <>
          <div className="member-directory-table-wrap">
            <table className="member-directory-table admin-photo-table">
              <thead>
                <tr>
                  <th scope="col">id</th>
                  <th scope="col">user_id</th>
                  <th scope="col">visibility</th>
                  <th scope="col">status</th>
                  <th scope="col">deleted_at</th>
                  <th scope="col">created_at</th>
                  <th scope="col">title</th>
                </tr>
              </thead>
              <tbody>
                {directory.items.map((item) => {
                  const isSelected = item.photo.id === selectedPhotoId;
                  return (
                    <tr
                      key={item.photo.id}
                      className={isSelected ? 'member-row-selected' : undefined}
                      onClick={() => {
                        setSelectedPhotoId(item.photo.id);
                        setDetailError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedPhotoId(item.photo.id);
                          setDetailError(null);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td data-label="id">{item.photo.id}</td>
                      <td data-label="user_id">{item.photo.userId ?? 'null'}</td>
                      <td data-label="visibility">{item.photo.visibility}</td>
                      <td data-label="status">{item.photo.status}</td>
                      <td data-label="deleted_at">{formatDate(item.photo.deletedAt)}</td>
                      <td data-label="created_at">{formatDate(item.photo.createdAt)}</td>
                      <td data-label="title">{item.photo.title ?? '(untitled)'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="member-directory-meta">
            <p>Returned rows: {directory.items.length}</p>
            <p>Applied visibility filter: {directory.filters.visibility ?? 'all'}</p>
            <p>Deleted rows included: {directory.filters.includeDeleted ? 'true' : 'false'}</p>
          </div>
        </>
      )}
      <div className="member-directory-actions admin-photo-detail">
        <h3>Selected photo detail</h3>
        {detailError ? <p className="status status-error">{detailError}</p> : null}
        {isDetailLoading ? (
          <p>Loading selected photo detail.</p>
        ) : selectedDetail ? (
          <>
            <p>ID {selectedDetail.photo.id} · user_id {selectedDetail.photo.userId ?? 'null'}</p>
            <p>Visibility: {selectedDetail.photo.visibility}</p>
            <p>Status: {selectedDetail.photo.status}</p>
            <p>Deleted at: {formatDate(selectedDetail.photo.deletedAt)}</p>
            <p>Captured at: {formatDate(selectedDetail.photo.capturedAt)}</p>
            <p>MIME type: {selectedDetail.photo.mimeType ?? 'unknown'}</p>
            <p>Title: {selectedDetail.photo.title ?? '(untitled)'}</p>
            <p className="admin-photo-detail-value">Description: {selectedDetail.photo.description ?? '(none)'}</p>
            <p className="admin-photo-detail-value">Object key: {selectedDetail.asset?.objectKey ?? 'missing asset metadata'}</p>
            <p className="admin-photo-detail-value">Display URL: {selectedDetail.asset?.displayUrl ?? 'missing asset metadata'}</p>
            <p className="admin-photo-detail-value">Location: {selectedDetail.location?.formattedAddress ?? 'no location metadata'}</p>
          </>
        ) : selectedFromList ? (
          <p>Select a photo row to inspect its full record.</p>
        ) : (
          <p>No photo selected.</p>
        )}
      </div>
    </section>
  );
}
