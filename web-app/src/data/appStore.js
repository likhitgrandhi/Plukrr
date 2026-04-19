const STORAGE_KEY = 'plukrr_published_apps';

export function getPublishedApps() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function savePublishedApp(app) {
  const apps = getPublishedApps();
  const idx = apps.findIndex((a) => a.id === app.id);
  if (idx >= 0) {
    apps[idx] = app;
  } else {
    apps.push(app);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
}
