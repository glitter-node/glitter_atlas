'use client';

import { useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useState } from 'react';

const archiveAcknowledgementKey = 'atlas_acknowledged';

export function LandingGate() {
  const router = useRouter();
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(archiveAcknowledgementKey);

    if (storedValue === 'true') {
      router.replace('/access');
    }
  }, [router]);

  function handleAcknowledgementChange(event: ChangeEvent<HTMLInputElement>) {
    setIsAcknowledged(event.target.checked);
  }

  function handleEnterArchive() {
    window.localStorage.setItem(archiveAcknowledgementKey, 'true');
    router.replace('/access');
  }

  return (
    <main className="page landing-page">
      <section className="card landing-card">
        <header className="hero-copy landing-hero">
          <p className="eyebrow">Archive entry</p>
          <h1>A structured archive for photos, memories, and records</h1>
          <p>
            This service is designed for intentional archival use. Access is limited
            to verified requests and activated accounts. It is not a public platform
            or a general-purpose content system.
          </p>
        </header>

        <div className="landing-sections">
          <section className="surface-note landing-section">
            <h2>What this archive is for</h2>
            <p>
              Organizing and preserving photo-based records with context and
              structure.
            </p>
            <p>
              Maintaining personal or small-scale archives where verified access
              and archival consistency matter.
            </p>
          </section>

          <section className="surface-note landing-section">
            <h2>Appropriate use</h2>
            <ul className="landing-list">
              <li>Uploading and organizing image assets</li>
              <li>Reviewing metadata and contextual information</li>
              <li>Sorting and maintaining a consistent archive</li>
            </ul>
          </section>

          <section className="surface-note landing-section">
            <h2>Not intended for</h2>
            <ul className="landing-list">
              <li>Open registration or public participation</li>
              <li>General content publishing or social interaction</li>
              <li>Unstructured or temporary content usage</li>
            </ul>
          </section>

          <section className="surface-note landing-section">
            <h2>Recommended workflow</h2>
            <ol className="landing-list landing-list-ordered">
              <li>Prepare or upload assets.</li>
              <li>Review metadata and context.</li>
              <li>Sort and classify intentionally.</li>
              <li>Continue within the archive.</li>
            </ol>
          </section>

          <section className="surface-note landing-section">
            <h2>Before you enter</h2>
            <p>
              Access requires a verified request and initial activation.
            </p>
            <p>
              If this is your first time, complete email verification and set your
              password before signing in.
            </p>
          </section>
        </div>

        <section className="landing-acknowledgement" aria-labelledby="landing-acknowledgement">
          <div className="surface-note landing-section">
            <h2 id="landing-acknowledgement">Acknowledgment before entry</h2>
            <label className="landing-checkbox">
              <input
                type="checkbox"
                checked={isAcknowledged}
                onChange={handleAcknowledgementChange}
              />
              <span>
                I understand that this service is a restricted archive and not an
                open platform.
              </span>
            </label>
            <div className="button-row landing-actions">
              <button
                className="button"
                type="button"
                onClick={handleEnterArchive}
                disabled={isAcknowledged === false}
              >
                Enter Archive
              </button>

            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
