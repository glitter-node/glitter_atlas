import type { GetPhotoResponse } from '@glitter-atlas/shared';

type PhotoCardProps = {
  photo: GetPhotoResponse;
  ownerControlsEnabled: boolean;
  visibilityBusy: boolean;
  deleteSelected: boolean;
  deleteConfirmed: boolean;
  deleteBusy: boolean;
  onVisibilityChange: (visibility: 'private' | 'shared') => void;
  onDeleteSelectionChange: (selected: boolean) => void;
  onDeleteConfirmationChange: (confirmed: boolean) => void;
  onDelete: () => void;
};

export function PhotoCard({
  photo,
  ownerControlsEnabled,
  visibilityBusy,
  deleteSelected,
  deleteConfirmed,
  deleteBusy,
  onVisibilityChange,
  onDeleteSelectionChange,
  onDeleteConfirmationChange,
  onDelete,
}: PhotoCardProps) {
  const latitude =
    typeof photo.location?.latitude === 'number' &&
    Number.isFinite(photo.location.latitude)
      ? photo.location.latitude
      : null;
  const longitude =
    typeof photo.location?.longitude === 'number' &&
    Number.isFinite(photo.location.longitude)
      ? photo.location.longitude
      : null;
  const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapUrl =
    latitude !== null && longitude !== null && mapsApiKey
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${latitude},${longitude}` +
        `&zoom=15&size=600x300&maptype=roadmap` +
        `&markers=color:red|${latitude},${longitude}` +
        `&key=${mapsApiKey}`
      : null;

  return (
    <article className="gallery-item">
      {photo.asset?.displayUrl ? (
        <img
          className="gallery-image"
          src={photo.asset.displayUrl}
          alt={photo.photo.title ?? `Photo ${photo.photo.id}`}
        />
      ) : null}
      {mapUrl ? (
        <img
          src={mapUrl}
          alt="location map"
          className="photo-map"
        />
      ) : null}
      <p>
        lat: {String(latitude)} / lng: {String(longitude)} / map:{' '}
        {mapUrl ? 'yes' : 'no'}
      </p>
      <div className="gallery-item-header">
        <div className="gallery-item-title">
          <h2>{photo.photo.title ?? photo.asset?.objectKey ?? `Photo ${photo.photo.id}`}</h2>
        </div>
        <span className="status-badge status-badge-approved">
          {photo.photo.status}
        </span>
      </div>
      <p>Photo ID: {photo.photo.id}</p>
      <p>Visibility: {photo.photo.visibility}</p>
      <p>MIME type: {photo.photo.mimeType ?? 'unknown'}</p>
      <p>Created at: {new Date(photo.photo.createdAt).toLocaleString()}</p>
      <p className="gallery-meta-break">Object key: {photo.asset?.objectKey ?? 'missing asset metadata'}</p>
      {ownerControlsEnabled ? (
        <div className="gallery-visibility-block">
          <p className="gallery-visibility-title">Visibility</p>
          <div className="gallery-visibility-options">
            <label className="gallery-visibility-option">
              <input
                type="radio"
                name={`visibility-${photo.photo.id}`}
                checked={photo.photo.visibility === 'private'}
                onChange={() => onVisibilityChange('private')}
                disabled={visibilityBusy || deleteBusy}
              />
              <span>Private</span>
            </label>
            <label className="gallery-visibility-option">
              <input
                type="radio"
                name={`visibility-${photo.photo.id}`}
                checked={photo.photo.visibility === 'shared'}
                onChange={() => onVisibilityChange('shared')}
                disabled={visibilityBusy || deleteBusy}
              />
              <span>Shared</span>
            </label>
          </div>
        </div>
      ) : null}
      {ownerControlsEnabled ? (
        <div className="gallery-delete-block">
          <label className="gallery-delete-label">
            <input
              type="checkbox"
              checked={deleteSelected}
              onChange={(event) => onDeleteSelectionChange(event.target.checked)}
              disabled={deleteBusy || visibilityBusy}
            />
            <span>Select this photo for removal</span>
          </label>
          {deleteSelected ? (
            <label className="gallery-delete-label">
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={(event) => onDeleteConfirmationChange(event.target.checked)}
                disabled={deleteBusy || visibilityBusy}
              />
              <span>I understand this will remove this photo from my gallery.</span>
            </label>
          ) : null}
          <button
            type="button"
            className="button button-secondary"
            onClick={onDelete}
            disabled={!deleteSelected || !deleteConfirmed || deleteBusy || visibilityBusy}
          >
            {deleteBusy ? 'Removing photo...' : 'Remove photo'}
          </button>
        </div>
      ) : null}
    </article>
  );
}
