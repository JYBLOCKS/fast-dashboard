import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

const App = lazy(() => import('./App'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="grid min-h-[100dvh] place-items-center text-slate-300">Loading dashboard…</div>}>
      <App />
    </Suspense>
  </StrictMode>,
);
