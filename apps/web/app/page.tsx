import { projectName } from '@glitter-atlas/shared';

export default function HomePage() {
  return (
    <main className="page">
      <div className="card">
        <p className="eyebrow">Web</p>
        <h1>{projectName}</h1>
        <p>Minimal Next.js App Router setup inside a pnpm monorepo.</p>
      </div>
    </main>
  );
}
