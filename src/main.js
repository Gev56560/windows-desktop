const DEFAULT_SETTINGS = {
  wallpaper: 'aurora',
  accent: '#2563eb',
  darkMode: true,
  iconSize: 70,
  notifications: true,
  recentFiles: []
};

const WALLPAPERS = {
  aurora: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 45%, #0ea5e9 100%)',
  sunset: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 35%, #f59e0b 100%)',
  forest: 'linear-gradient(135deg, #14532d 0%, #15803d 45%, #86efac 100%)',
  evening: 'linear-gradient(135deg, #312e81 0%, #7c3aed 48%, #ec4899 100%)',
  night: 'linear-gradient(135deg, #020617 0%, #1f2937 40%, #334155 100%)'
};

export function getSettings() {
  try {
    const value = JSON.parse(localStorage.getItem('windows-desktop-settings') || 'null');
    return { ...DEFAULT_SETTINGS, ...(value || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem('windows-desktop-settings', JSON.stringify(settings));
}

export function defaultFS() {
  return {
    id: 'root',
    name: 'Root',
    type: 'folder',
    children: [
      { id: 'desktop', name: 'Desktop', type: 'folder', children: [] },
      { id: 'documents', name: 'Documents', type: 'folder', children: [] },
      { id: 'downloads', name: 'Downloads', type: 'folder', children: [] },
      { id: 'pictures', name: 'Pictures', type: 'folder', children: [] },
      { id: 'music', name: 'Music', type: 'folder', children: [] },
      { id: 'videos', name: 'Videos', type: 'folder', children: [] }
    ]
  };
}

export function getFS() {
  try {
    const value = JSON.parse(localStorage.getItem('windows-desktop-fs') || 'null');
    return value && value.id === 'root' ? value : defaultFS();
  } catch {
    return defaultFS();
  }
}

export function saveFS(fs) {
  localStorage.setItem('windows-desktop-fs', JSON.stringify(fs));
}

export function getCalendarEvents() {
  try {
    const v = JSON.parse(localStorage.getItem('windows-desktop-events') || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveCalendarEvents(events) {
  localStorage.setItem('windows-desktop-events', JSON.stringify(events));
}

export function getNotifications() {
  try {
    const v = JSON.parse(localStorage.getItem('windows-desktop-notifications') || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveNotifications(items) {
  localStorage.setItem('windows-desktop-notifications', JSON.stringify(items));
}

export function ensureData() {
  if (!localStorage.getItem('windows-desktop-fs')) saveFS(defaultFS());
  if (!localStorage.getItem('windows-desktop-settings')) saveSettings(DEFAULT_SETTINGS);
  if (!localStorage.getItem('windows-desktop-events')) saveCalendarEvents([]);
  if (!localStorage.getItem('windows-desktop-notifications')) saveNotifications([]);
}

export { DEFAULT_SETTINGS, WALLPAPERS };
