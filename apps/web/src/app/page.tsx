export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase">Dhaka Tesla Pool</p>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Web foundation</h1>
      <p className="max-w-xl text-base leading-7 text-zinc-600">
        Next.js is serving on port 43123. Same-origin requests to{' '}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-sm">/api/*</code> rewrite
        to the Fastify API.
      </p>
    </main>
  );
}
