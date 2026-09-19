// Runs before first paint so the saved theme never flashes. Dark is the default.
try {
  const saved = localStorage.getItem('devlog:theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch {}
