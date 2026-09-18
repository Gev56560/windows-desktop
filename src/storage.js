import {
  getSettings,
  saveSettings,
  ensureData,
  getFS,
  saveFS,
  getCalendarEvents,
  saveCalendarEvents,
  getNotifications,
  saveNotifications,
  WALLPAPERS
} from './storage.js';

const appCatalog = {
  'file-explorer': { title: 'File Explorer', icon: '📁' },
  notepad: { title: 'Notepad', icon: '📝' },
  browser: { title: 'Browser', icon: '🌐' },
  settings: { title: 'Settings', icon: '⚙️' },
  terminal: { title: 'Terminal', icon: '💻' },
  calculator: { title: 'Calculator', icon: '🧮' },
  clock: { title: 'Clock', icon: '🕒' },
  calendar: { title: 'Calendar', icon: '📅' },
  paint: { title: 'Paint', icon: '🎨' },
  'media-player': { title: 'Media Player', icon: '🎵' },
  games: { title: 'Games', icon: '🎮' }
};

const desktopApps = [
  ['file-explorer', 'File Explorer', '📁'],
  ['notepad', 'Notepad', '📝'],
  ['browser', 'Browser', '🌐'],
  ['settings', 'Settings', '⚙️'],
  ['terminal', 'Terminal', '💻'],
  ['calculator', 'Calculator', '🧮'],
  ['clock', 'Clock', '🕒'],
  ['calendar', 'Calendar', '📅'],
  ['paint', 'Paint', '🎨'],
  ['media-player', 'Media Player', '🎵'],
  ['games', 'Games', '🎮']
];

function normalizePath(path) {
  if (!path || path === '/') return '/';
  const p = path.replace(/\\/g, '/');
  if (!p.startsWith('/')) return `/${p}`.replace(/\/+/g, '/');
  return p.replace(/\/+/g, '/');
}

function toPosixPath(path) {
  return normalizePath(path).replace(/\/$/, '') || '/';
}

function findInFS(path) {
  const normalized = toPosixPath(path);
  if (normalized === '/' || normalized === '') return getFS();
  const parts = normalized.split('/').filter(Boolean);
  let node = getFS();
  for (const part of parts) {
    if (!node.children) return null;
    node = node.children.find((n) => n.name === part) || null;
    if (!node) return null;
  }
  return node;
}

function createFolderAt(parentPath, folderName) {
  const fs = getFS();
  const parent = findInFS(parentPath) || fs;
  if (!parent || !Array.isArray(parent.children)) return null;
  const exists = parent.children.some((item) => item.name === folderName);
  if (exists) return null;
  const folder = { id: crypto.randomUUID(), name: folderName, type: 'folder', children: [] };
  parent.children.push(folder);
  saveFS(fs);
  return folder;
}

function writeFileAt(filePath, content) {
  const fs = getFS();
  const clean = toPosixPath(filePath);
  const parts = clean.split('/').filter(Boolean);
  if (parts.length === 0) return false;
  const fileName = parts.pop();
  let current = fs;
  for (const part of parts) {
    if (!current.children) return false;
    let child = current.children.find((item) => item.name === part && item.type === 'folder');
    if (!child) {
      child = { id: crypto.randomUUID(), name: part, type: 'folder', children: [] };
      current.children.push(child);
    }
    current = child;
  }
  const existing = current.children.find((item) => item.name === fileName);
  if (existing && existing.type === 'file') {
    existing.content = content;
    saveFS(fs);
    return true;
  }
  current.children.push({ id: crypto.randomUUID(), name: fileName, type: 'file', content });
  saveFS(fs);
  return true;
}

function removeAtPath(path) {
  const fs = getFS();
  const clean = toPosixPath(path);
  const parts = clean.split('/').filter(Boolean);
  if (!parts.length) return false;
  const targetName = parts.pop();
  let current = fs;
  for (const part of parts) {
    current = current.children.find((item) => item.name === part && item.type === 'folder');
    if (!current) return false;
  }
  const index = current.children.findIndex((item) => item.name === targetName);
  if (index < 0) return false;
  current.children.splice(index, 1);
  saveFS(fs);
  return true;
}

function renameAtPath(path, newName) {
  const fs = getFS();
  const clean = toPosixPath(path);
  const parts = clean.split('/').filter(Boolean);
  if (!parts.length) return false;
  const oldName = parts.pop();
  let current = fs;
  for (const part of parts) {
    current = current.children.find((item) => item.name === part && item.type === 'folder');
    if (!current) return false;
  }
  const item = current.children.find((entry) => entry.name === oldName);
  if (!item) return false;
  item.name = newName;
  saveFS(fs);
  return true;
}

function listFolder(path) {
  const node = findInFS(path);
  if (!node || node.type !== 'folder') return [];
  return Array.isArray(node.children) ? node.children : [];
}

function addRecentFile(path) {
  const settings = getSettings();
  const name = path.split('/').pop() || 'File';
  const next = [{ name, path }, ...(settings.recentFiles || []).filter((item) => item.path !== path)].slice(0, 8);
  saveSettings({ ...settings, recentFiles: next });
}

function showToast(message) {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

class DesktopApp {
  constructor() {
    ensureData();
    this.windows = [];
    this.windowId = 1;
    this.activeWindowId = null;
    this.dragState = null;
    this.resizeState = null;
    this.startVisible = false;
    this.cutBuffer = null;
    this.desktopIconsEl = document.getElementById('desktop-icons');
    this.windowsLayer = document.getElementById('windows-layer');
    this.taskbarAppsEl = document.getElementById('taskbar-apps');
    this.startMenuEl = document.getElementById('start-menu');
    this.notificationCenter = document.getElementById('notification-center');
    this.toastContainer = document.getElementById('toast-container');
    this.contextMenu = document.getElementById('context-menu');
    this.clockEl = document.getElementById('taskbar-clock');
    this.trayEl = document.getElementById('tray-icons');
    this.applyTheme();
    this.renderDesktopIcons();
    this.renderTaskbar();
    this.renderStartMenu();
    this.renderTray();
    this.bindGlobalEvents();
    this.refreshClock();
    setInterval(() => this.refreshClock(), 1000);
    this.notify('Desktop ready', 'Your local desktop environment is ready.', 'info');
  }

  bindGlobalEvents() {
    document.getElementById('start-button').addEventListener('click', () => this.toggleStartMenu());
    document.getElementById('search-button').addEventListener('click', () => this.openApp('browser'));
    document.body.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.window') || event.target.closest('.desktop-icon')) return;
      event.preventDefault();
      this.showContextMenu(event.clientX, event.clientY, 'desktop');
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('#context-menu') && !event.target.closest('.desktop-icon')) this.hideContextMenu();
      if (!event.target.closest('#start-menu') && !event.target.closest('#start-button')) this.toggleStartMenu(false);
      if (!event.target.closest('#notification-center') && !event.target.closest('#taskbar-clock')) this.notificationCenter.classList.add('hidden');
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.toggleStartMenu(false);
        this.hideContextMenu();
        this.notificationCenter.classList.add('hidden');
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        this.openApp('file-explorer');
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        this.openApp('notepad');
      }
    });
    document.getElementById('taskbar-clock').addEventListener('click', () => {
      this.notificationCenter.classList.toggle('hidden');
    });
  }

  applyTheme() {
    const settings = getSettings();
    const root = document.documentElement;
    root.style.setProperty('--wallpaper', WALLPAPERS[settings.wallpaper] || WALLPAPERS.aurora);
    root.style.setProperty('--accent', settings.accent || '#2563eb');
    root.style.setProperty('--desktop-icon-size', `${settings.iconSize || 70}px`);
  }

  renderDesktopIcons() {
    this.desktopIconsEl.innerHTML = '';
    desktopApps.forEach(([id, label, emoji]) => {
      const icon = document.createElement('button');
      icon.className = 'desktop-icon';
      icon.dataset.app = id;
      icon.innerHTML = `<span class="icon-emoji">${emoji}</span><span class="label">${label}</span>`;
      icon.addEventListener('dblclick', () => this.openApp(id));
      icon.addEventListener('click', () => {
        document.querySelectorAll('.desktop-icon').forEach((node) => node.classList.remove('selected'));
        icon.classList.add('selected');
      });
      icon.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.showContextMenu(event.clientX, event.clientY, 'desktop', id);
      });
      this.desktopIconsEl.appendChild(icon);
    });
  }

  renderTaskbar() {
    this.taskbarAppsEl.innerHTML = '';
    this.windows.forEach((win) => {
      const btn = document.createElement('button');
      btn.className = `taskbar-btn ${this.activeWindowId === win.id ? 'active' : ''}`;
      btn.textContent = win.title;
      btn.addEventListener('click', () => {
        if (win.minimized) {
          win.element.classList.remove('hidden');
          win.minimized = false;
        }
        this.focusWindow(win.id);
      });
      this.taskbarAppsEl.appendChild(btn);
    });
  }

  renderTray() {
    this.trayEl.innerHTML = '';
    ['🔊', '📶', '🔋'].forEach((icon) => {
      const item = document.createElement('div');
      item.className = 'tray-item';
      item.textContent = icon;
      this.trayEl.appendChild(item);
    });
  }

  renderStartMenu() {
    const settings = getSettings();
    const recent = settings.recentFiles || [];
    const pinned = desktopApps.slice(0, 8);

    this.startMenuEl.innerHTML = `
      <div class="start-user">
        <div class="user-avatar">G</div>
        <div>
          <div><strong>Guest</strong></div>
          <div style="color: var(--muted); font-size: 12px;">Personal</div>
        </div>
      </div>
      <div class="start-panel">
        <div class="start-column">
          <div class="menu-heading">Pinned</div>
          ${pinned.map(([id, label, emoji]) => `
            <button class="start-item" data-app="${id}">
              <span class="menu-icon">${emoji}</span>
              <span>${label}</span>
            </button>
          `).join('')}
        </div>
        <div class="start-column">
          <div class="menu-heading">Recommended</div>
          ${recent.length ? recent.map((item) => `
            <button class="recent-item" data-file="${item.path}">
              <span class="menu-icon">📄</span>
              <span>${item.name}</span>
            </button>
          `).join('') : '<div style="color: var(--muted);">No recent files.</div>'}
        </div>
      </div>
      <div class="start-footer">
        <div class="power-buttons">
          <button class="task-button" data-app="settings">Settings</button>
          <button class="task-button" data-app="file-explorer">File Explorer</button>
        </div>
        <div class="power-buttons">
          <button class="task-button" data-power="sleep">Sleep</button>
          <button class="task-button" data-power="restart">Restart</button>
          <button class="task-button" data-power="shutdown">Shut down</button>
        </div>
      </div>
    `;

    this.startMenuEl.querySelectorAll('[data-app]').forEach((button) => {
      button.addEventListener('click', () => {
        const app = button.dataset.app;
        if (app) {
          this.openApp(app);
          this.toggleStartMenu(false);
        }
      });
    });
    this.startMenuEl.querySelectorAll('[data-power]').forEach((button) => {
      button.addEventListener('click', () => this.handlePower(button.dataset.power));
    });
    this.startMenuEl.querySelectorAll('[data-file]').forEach((button) => {
      button.addEventListener('click', () => {
        const path = button.dataset.file;
        const target = findInFS(path);
        if (target) this.openTarget(target);
      });
    });
  }

  toggleStartMenu(force) {
    const next = typeof force === 'boolean' ? force : !this.startVisible;
    this.startVisible = next;
    this.startMenuEl.classList.toggle('hidden', !next);
  }

  handlePower(mode) {
    this.notify('Power action', `${mode} was simulated locally.`, 'info');
  }

  showContextMenu(x, y, kind, appId = null) {
    this.contextMenu.innerHTML = '';
    const items = [
      { label: 'Refresh', action: () => this.notify('Desktop refreshed', 'The desktop was refreshed.', 'info') },
      { label: 'New Folder', action: () => this.createDesktopFolder() },
      { label: 'Open', action: () => appId ? this.openApp(appId) : null },
      { label: 'Personalize', action: () => this.openApp('settings') },
      { label: 'Display settings', action: () => this.openApp('settings') }
    ];
    items.forEach((item) => {
      const button = document.createElement('button');
      button.className = 'context-item';
      button.textContent = item.label;
      button.addEventListener('click', () => {
        if (item.action) item.action();
        this.hideContextMenu();
      });
      this.contextMenu.appendChild(button);
    });
    this.contextMenu.style.left = `${x}px`;
    this.contextMenu.style.top = `${y}px`;
    this.contextMenu.classList.remove('hidden');
  }

  hideContextMenu() {
    this.contextMenu.classList.add('hidden');
  }

  createDesktopFolder() {
    const name = window.prompt('New folder name:', 'New Folder');
    if (!name) return;
    const fs = getFS();
    const desktop = fs.children.find((item) => item.name === 'Desktop');
    if (!desktop) return;
    if (!desktop.children) desktop.children = [];
    desktop.children.push({ id: crypto.randomUUID(), name, type: 'folder', children: [] });
    saveFS(fs);
    showToast(`Created folder: ${name}`);
  }

  notify(title, message, type = 'info') {
    const items = getNotifications();
    items.push({ id: crypto.randomUUID(), title, message, type, time: Date.now() });
    saveNotifications(items.slice(-20));
    this.renderNotifications();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = `${title}: ${message}`;
    this.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  renderNotifications() {
    const items = getNotifications();
    const panel = this.notificationCenter;
    panel.innerHTML = `
      <div class="panel-header">
        <span>Notifications</span>
        <button class="task-button" id="clear-notifications">Clear all</button>
      </div>
      <div class="notification-list">
        ${items.length ? items.slice().reverse().map((item) => `
          <div class="notification-item">
            <strong>${item.title}</strong>
            <div>${item.message}</div>
            <small>${new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
          </div>
        `).join('') : '<div style="padding: 12px; color: var(--muted);">No notifications.</div>'}
      </div>
    `;
    panel.querySelector('#clear-notifications')?.addEventListener('click', () => {
      saveNotifications([]);
      this.renderNotifications();
    });
  }

  refreshClock() {
    const now = new Date();
    this.clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  openApp(appKey) {
    const meta = appCatalog[appKey];
    if (!meta) return null;
    const existing = this.windows.find((win) => win.appKey === appKey && !win.closed);
    if (existing) {
      this.focusWindow(existing.id);
      return existing;
    }
    const win = this.createWindow(appKey, meta.title, 240, 90, 760, 540);
    const body = win.element.querySelector('.window-body');
    let instance = null;
    switch (appKey) {
      case 'file-explorer': instance = new FileExplorer(body, this); break;
      case 'notepad': instance = new Notepad(body, this); break;
      case 'browser': instance = new Browser(body, this); break;
      case 'settings': instance = new Settings(body, this); break;
      case 'terminal': instance = new Terminal(body, this); break;
      case 'calculator': instance = new Calculator(body, this); break;
      case 'clock': instance = new Clock(body, this); break;
      case 'calendar': instance = new Calendar(body, this); break;
      case 'paint': instance = new Paint(body, this); break;
      case 'media-player': instance = new MediaPlayer(body, this); break;
      case 'games': instance = new Games(body, this); break;
      default: break;
    }
    win.instance = instance;
    this.focusWindow(win.id);
    this.renderTaskbar();
    return win;
  }

  createWindow(appKey, title, x, y, width, height) {
    const id = this.windowId++;
    const element = document.createElement('div');
    element.className = 'window active';
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.innerHTML = `
      <div class="window-header">
        <div class="window-title">${title}</div>
        <div class="window-controls">
          <button class="window-btn min" title="Minimize"></button>
          <button class="window-btn max" title="Maximize"></button>
          <button class="window-btn close" title="Close"></button>
        </div>
      </div>
      <div class="window-body"></div>
      <div class="resize-handle se"></div>
      <div class="resize-handle e"></div>
      <div class="resize-handle s"></div>
    `;
    this.windowsLayer.appendChild(element);
    const win = { id, appKey, title, element, closed: false, minimized: false, maximized: false, instance: null };
    this.windows.push(win);
    this.attachWindowEvents(win);
    return win;
  }

  attachWindowEvents(win) {
    const header = win.element.querySelector('.window-header');
    const close = win.element.querySelector('.window-btn.close');
    const min = win.element.querySelector('.window-btn.min');
    const max = win.element.querySelector('.window-btn.max');
    close.addEventListener('click', () => this.closeWindow(win.id));
    min.addEventListener('click', () => this.minimizeWindow(win.id));
    max.addEventListener('click', () => this.maximizeWindow(win.id));
    header.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      this.startDrag(win, event);
    });
    win.element.addEventListener('pointerdown', () => this.focusWindow(win.id));
    win.element.querySelector('.resize-handle.se').addEventListener('pointerdown', (event) => this.startResize(win, 'se', event));
    win.element.querySelector('.resize-handle.e').addEventListener('pointerdown', (event) => this.startResize(win, 'e', event));
    win.element.querySelector('.resize-handle.s').addEventListener('pointerdown', (event) => this.startResize(win, 's', event));
  }

  focusWindow(id) {
    this.windows.forEach((win) => {
      const active = win.id === id;
      win.element.classList.toggle('active', active);
      win.element.style.zIndex = active ? '30' : '1';
    });
    this.activeWindowId = id;
    this.renderTaskbar();
  }

  startDrag(win, event) {
    const rect = win.element.getBoundingClientRect();
    this.dragState = { winId: win.id, originX: rect.left, originY: rect.top, startX: event.clientX, startY: event.clientY };
    document.addEventListener('pointermove', this.onDragMove.bind(this));
    document.addEventListener('pointerup', this.stopDrag.bind(this));
  }

  onDragMove(event) {
    if (!this.dragState) return;
    const win = this.windows.find((item) => item.id === this.dragState.winId);
    if (!win || win.maximized) return;
    const left = this.dragState.originX + (event.clientX - this.dragState.startX);
    const top = this.dragState.originY + (event.clientY - this.dragState.startY);
    win.element.style.left = `${Math.max(0, Math.min(left, window.innerWidth - 260))}px`;
    win.element.style.top = `${Math.max(0, Math.min(top, window.innerHeight - 120))}px`;
  }

  stopDrag() {
    this.dragState = null;
    document.removeEventListener('pointermove', this.onDragMove.bind(this));
    document.removeEventListener('pointerup', this.stopDrag.bind(this));
  }

  startResize(win, edge, event) {
    this.resizeState = {
      winId: win.id,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: win.element.offsetWidth,
      startHeight: win.element.offsetHeight
    };
    document.addEventListener('pointermove', this.onResizeMove.bind(this));
    document.addEventListener('pointerup', this.stopResize.bind(this));
  }

  onResizeMove(event) {
    if (!this.resizeState) return;
    const win = this.windows.find((item) => item.id === this.resizeState.winId);
    if (!win) return;
    const dx = event.clientX - this.resizeState.startX;
    const dy = event.clientY - this.resizeState.startY;
    let width = this.resizeState.startWidth;
    let height = this.resizeState.startHeight;
    if (this.resizeState.edge.includes('e')) width = Math.max(260, this.resizeState.startWidth + dx);
    if (this.resizeState.edge.includes('s')) height = Math.max(200, this.resizeState.startHeight + dy);
    win.element.style.width = `${width}px`;
    win.element.style.height = `${height}px`;
  }

  stopResize() {
    this.resizeState = null;
    document.removeEventListener('pointermove', this.onResizeMove.bind(this));
    document.removeEventListener('pointerup', this.stopResize.bind(this));
  }

  minimizeWindow(id) {
    const win = this.windows.find((item) => item.id === id);
    if (!win) return;
    win.minimized = true;
    win.element.classList.add('hidden');
    this.renderTaskbar();
  }

  maximizeWindow(id) {
    const win = this.windows.find((item) => item.id === id);
    if (!win) return;
    if (win.maximized) {
      win.maximized = false;
      win.element.style.left = '260px';
      win.element.style.top = '80px';
      win.element.style.width = '760px';
      win.element.style.height = '540px';
      return;
    }
    win.maximized = true;
    win.element.style.left = '10px';
    win.element.style.top = '10px';
    win.element.style.width = `${window.innerWidth - 20}px`;
    win.element.style.height = `${window.innerHeight - 74}px`;
  }

  closeWindow(id) {
    const index = this.windows.findIndex((item) => item.id === id);
    if (index < 0) return;
    const win = this.windows[index];
    win.element.remove();
    win.closed = true;
    this.windows.splice(index, 1);
    if (this.activeWindowId === id) this.activeWindowId = null;
    this.renderTaskbar();
  }

  openTarget(target) {
    if (!target) return;
    if (target.type === 'folder') {
      this.openApp('file-explorer');
      return;
    }
    const ext = (target.name || '').split('.').pop()?.toLowerCase();
    if (['txt', 'md', 'json', 'log'].includes(ext)) {
      this.openApp('notepad');
      const win = this.windows.find((item) => item.appKey === 'notepad' && !item.closed);
      if (win && win.instance && typeof win.instance.openFile === 'function') win.instance.openFile(`/${target.name}`);
      return;
    }
    this.notify('Open file', `Opening ${target.name} with the default app.`, 'info');
  }
}

class FileExplorer {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.path = '/Desktop';
    this.selection = new Set();
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="app-shell fileexplorer-layout">
        <aside class="sidebar">
          <button class="sidebar-item active" data-path="/Desktop">🏠 Desktop</button>
          <button class="sidebar-item" data-path="/Documents">📄 Documents</button>
          <button class="sidebar-item" data-path="/Downloads">⬇️ Downloads</button>
          <button class="sidebar-item" data-path="/Pictures">🖼️ Pictures</button>
          <button class="sidebar-item" data-path="/Music">🎵 Music</button>
          <button class="sidebar-item" data-path="/Videos">🎬 Videos</button>
        </aside>
        <div class="main-pane">
          <div class="toolbar">
            <button id="back-btn">←</button>
            <button id="up-btn">↑</button>
            <button id="new-folder-btn">New folder</button>
            <button id="rename-btn">Rename</button>
            <button id="delete-btn">Delete</button>
            <button id="copy-btn">Copy</button>
            <button id="cut-btn">Cut</button>
            <button id="paste-btn">Paste</button>
            <input id="path-input" value="/Desktop" />
          </div>
          <div id="fe-content" class="file-grid"></div>
        </div>
      </div>
    `;
    this.content = this.container.querySelector('#fe-content');
    this.bind();
    this.loadFolder(this.path);
  }

  bind() {
    this.container.querySelectorAll('.sidebar-item').forEach((button) => {
      button.addEventListener('click', () => {
        const p = button.dataset.path;
        this.path = p;
        this.container.querySelector('#path-input').value = p;
        this.loadFolder(p);
      });
    });
    this.container.querySelector('#new-folder-btn').addEventListener('click', () => this.createFolder());
    this.container.querySelector('#rename-btn').addEventListener('click', () => this.renameSelected());
    this.container.querySelector('#delete-btn').addEventListener('click', () => this.deleteSelected());
    this.container.querySelector('#copy-btn').addEventListener('click', () => this.copySelected());
    this.container.querySelector('#cut-btn').addEventListener('click', () => this.cutSelected());
    this.container.querySelector('#paste-btn').addEventListener('click', () => this.pasteSelected());
    this.container.querySelector('#up-btn').addEventListener('click', () => this.goUp());
    this.container.querySelector('#path-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.path = normalizePath(this.container.querySelector('#path-input').value);
        this.loadFolder(this.path);
      }
    });
  }

  loadFolder(path) {
    const folder = findInFS(path) || findInFS('/Desktop');
    this.path = path || '/Desktop';
    this.container.querySelector('#path-input').value = this.path;
    this.content.innerHTML = '';
    if (!folder || folder.type !== 'folder') {
      this.content.innerHTML = '<div style="padding: 12px; color: var(--muted);">Folder not found.</div>';
      return;
    }
    (folder.children || []).forEach((item) => {
      const card = document.createElement('div');
      card.className = 'file-card';
      card.innerHTML = `<div class="icon">${item.type === 'folder' ? '📁' : '📄'}</div><div>${item.name}</div>`;
      const itemPath = `${this.path}/${item.name}`.replace(/\/+/g, '/');
      if (this.selection.has(itemPath)) card.classList.add('selected');
      card.addEventListener('click', () => {
        this.selection.clear();
        this.selection.add(itemPath);
        this.loadFolder(this.path);
      });
      card.addEventListener('dblclick', () => {
        if (item.type === 'folder') {
          this.path = itemPath;
          this.container.querySelector('#path-input').value = this.path;
          this.loadFolder(this.path);
        } else {
          addRecentFile(itemPath);
          this.desktop.notify('Opened', `Opened ${item.name}`);
        }
      });
      this.content.appendChild(card);
    });
  }

  createFolder() {
    const name = window.prompt('Folder name:', 'New Folder');
    if (!name) return;
    const created = createFolderAt(this.path, name);
    if (!created) {
      this.desktop.notify('Folder error', 'A folder with that name already exists here.', 'warn');
      return;
    }
    this.loadFolder(this.path);
  }

  renameSelected() {
    const paths = [...this.selection];
    if (!paths.length) return;
    const current = paths[0].split('/').pop();
    const name = window.prompt('Rename to:', current);
    if (!name) return;
    renameAtPath(paths[0], name);
    this.selection.clear();
    this.loadFolder(this.path);
  }

  deleteSelected() {
    const paths = [...this.selection];
    if (!paths.length) return;
    paths.forEach((p) => removeAtPath(p));
    this.selection.clear();
    this.loadFolder(this.path);
  }

  copySelected() {
    this.desktop.cutBuffer = { mode: 'copy', paths: [...this.selection] };
    this.desktop.notify('Copy', `${this.selection.size} item(s) copied.`, 'info');
  }

  cutSelected() {
    this.desktop.cutBuffer = { mode: 'cut', paths: [...this.selection] };
    this.desktop.notify('Cut', `${this.selection.size} item(s) cut.`, 'info');
  }

  pasteSelected() {
    if (!this.desktop.cutBuffer) return;
    const fs = getFS();
    const target = findInFS(this.path) || fs;
    this.desktop.cutBuffer.paths.forEach((src) => {
      const node = findInFS(src);
      if (!node) return;
      const clone = JSON.parse(JSON.stringify(node));
      target.children.push(clone);
    });
    saveFS(fs);
    this.desktop.cutBuffer = null;
    this.loadFolder(this.path);
  }

  goUp() {
    const parts = this.path.split('/').filter(Boolean);
    if (parts.length <= 1) return;
    parts.pop();
    this.path = '/' + parts.join('/');
    this.container.querySelector('#path-input').value = this.path;
    this.loadFolder(this.path);
  }
}

class Notepad {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.filePath = '/Desktop/notes.txt';
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="app-shell">
        <div class="toolbar">
          <button id="new-note">New</button>
          <button id="open-note">Open</button>
          <button id="save-note">Save</button>
          <button id="saveas-note">Save As</button>
          <button id="find-note">Find</button>
          <button id="count-note">Word count</button>
        </div>
        <textarea id="notepad-text" class="notepad-editor" spellcheck="false"></textarea>
      </div>
    `;
    this.editor = this.container.querySelector('#notepad-text');
    this.bind();
    this.editor.value = 'Welcome to Notepad\n';
  }

  bind() {
    this.container.querySelector('#new-note').addEventListener('click', () => {
      this.filePath = '/Desktop/untitled.txt';
      this.editor.value = '';
    });
    this.container.querySelector('#open-note').addEventListener('click', () => {
      const path = window.prompt('Open file path:', '/Desktop/notes.txt');
      if (!path) return;
      this.openFile(path);
    });
    this.container.querySelector('#save-note').addEventListener('click', () => this.save());
    this.container.querySelector('#saveas-note').addEventListener('click', () => {
      const path = window.prompt('Save as path:', this.filePath || '/Desktop/untitled.txt');
      if (!path) return;
      this.filePath = path;
      this.save();
    });
    this.container.querySelector('#find-note').addEventListener('click', () => {
      const term = window.prompt('Find text:');
      if (!term) return;
      const idx = this.editor.value.toLowerCase().indexOf(term.toLowerCase());
      if (idx >= 0) {
        this.editor.focus();
        this.editor.setSelectionRange(idx, idx + term.length);
      } else this.desktop.notify('Find', 'Text not found.', 'warn');
    });
    this.container.querySelector('#count-note').addEventListener('click', () => {
      const words = this.editor.value.trim() ? this.editor.value.trim().split(/\s+/).length : 0;
      this.desktop.notify('Word count', `${words} words.`, 'info');
    });
  }

  openFile(path) {
    const node = findInFS(path);
    if (!node || node.type !== 'file') {
      this.desktop.notify('Open failed', 'File not found.', 'warn');
      return;
    }
    this.filePath = path;
    this.editor.value = node.content || '';
  }

  save() {
    if (!this.filePath) return;
    writeFileAt(this.filePath, this.editor.value);
    addRecentFile(this.filePath);
    this.desktop.notify('Saved', `Saved to ${this.filePath}.`, 'success');
  }
}

class Browser {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.url = 'https://www.bing.com';
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="app-shell">
        <div class="toolbar">
          <button id="browser-back">◀</button>
          <button id="browser-forward">▶</button>
          <button id="browser-refresh">⟳</button>
          <button id="browser-home">Home</button>
          <input id="browser-url" value="https://www.bing.com" />
          <button id="browser-go">Go</button>
        </div>
        <div class="browser-view" id="browser-view"></div>
      </div>
    `;
    this.view = this.container.querySelector('#browser-view');
    this.input = this.container.querySelector('#browser-url');
    this.bind();
    this.load(this.url);
  }

  bind() {
    this.container.querySelector('#browser-go').addEventListener('click', () => this.load(this.input.value.trim()));
    this.container.querySelector('#browser-home').addEventListener('click', () => this.load('https://www.bing.com'));
    this.container.querySelector('#browser-refresh').addEventListener('click', () => this.load(this.url));
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.load(this.input.value.trim());
    });
  }

  load(value) {
    if (!value) return;
    let url = value;
    if (!/^https?:\/\//i.test(url)) {
      url = `https://www.bing.com/search?q=${encodeURIComponent(url)}`;
    }
    this.url = url;
    this.input.value = url;
    try {
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.title = 'Browser';
      this.view.innerHTML = '';
      this.view.appendChild(iframe);
    } catch {
      this.view.innerHTML = `<div class="browser-fallback">This page cannot be embedded here. <a href="${url}" target="_blank" rel="noreferrer">Open it in a new tab</a></div>`;
    }
  }
}

class Settings {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.render();
  }

  render() {
    const settings = getSettings();
    this.container.innerHTML = `
      <div class="app-shell settings-layout">
        <aside class="settings-nav">
          <button class="sidebar-item active" data-section="personalization">Personalization</button>
          <button class="sidebar-item" data-section="system">System</button>
          <button class="sidebar-item" data-section="apps">Apps</button>
          <button class="sidebar-item" data-section="privacy">Privacy</button>
        </aside>
        <div id="settings-section" class="settings-section"></div>
      </div>
    `;
    this.content = this.container.querySelector('#settings-section');
    this.bindNav();
    this.showSection('personalization');
  }

  bindNav() {
    this.container.querySelectorAll('.sidebar-item').forEach((button) => {
      button.addEventListener('click', () => {
        this.container.querySelectorAll('.sidebar-item').forEach((node) => node.classList.remove('active'));
        button.classList.add('active');
        this.showSection(button.dataset.section);
      });
    });
  }

  showSection(section) {
    const settings = getSettings();
    let html = '';
    if (section === 'personalization') {
      html = `
        <div class="setting-row">
          <span>Wallpaper</span>
          <div class="wallpapers">
            ${Object.entries(WALLPAPERS).map(([key, value]) => `
              <button class="wallpaper-preview ${settings.wallpaper === key ? 'active' : ''}" data-wallpaper="${key}" style="background:${value};"></button>
            `).join('')}
          </div>
        </div>
        <div class="setting-row"><span>Accent color</span><input id="accent-picker" type="color" value="${settings.accent || '#2563eb'}" /></div>
        <div class="setting-row"><span>Dark mode</span><input id="dark-mode" type="checkbox" ${settings.darkMode ? 'checked' : ''} /></div>
      `;
    } else if (section === 'system') {
      html = `
        <div class="setting-row"><span>Display</span><span>Default scaling</span></div>
        <div class="setting-row"><span>Sound</span><input id="sound-setting" type="checkbox" checked /></div>
        <div class="setting-row"><span>Notifications</span><input id="notification-setting" type="checkbox" ${settings.notifications ? 'checked' : ''} /></div>
      `;
    } else if (section === 'apps') {
      html = `
        <div class="setting-row"><span>Installed apps</span><span>11</span></div>
        <div class="setting-row"><span>Default apps</span><span>File Explorer, Browser, Notepad</span></div>
      `;
    } else if (section === 'privacy') {
      html = `
        <div class="setting-row"><span>Allow local file persistence</span><input type="checkbox" checked /></div>
        <div class="setting-row"><span>Cached browse data</span><button id="clear-recent">Clear recent</button></div>
      `;
    }
    this.content.innerHTML = html;
    this.bindHandlers();
  }

  bindHandlers() {
    this.content.querySelectorAll('.wallpaper-preview').forEach((node) => {
      node.addEventListener('click', () => {
        const settings = getSettings();
        settings.wallpaper = node.dataset.wallpaper;
        saveSettings(settings);
        this.desktop.applyTheme();
        this.showSection('personalization');
      });
    });
    const accent = this.content.querySelector('#accent-picker');
    if (accent) {
      accent.addEventListener('input', () => {
        const settings = getSettings();
        settings.accent = accent.value;
        saveSettings(settings);
        this.desktop.applyTheme();
      });
    }
    const dark = this.content.querySelector('#dark-mode');
    if (dark) {
      dark.addEventListener('change', () => {
        const settings = getSettings();
        settings.darkMode = dark.checked;
        saveSettings(settings);
      });
    }
    const notifications = this.content.querySelector('#notification-setting');
    if (notifications) {
      notifications.addEventListener('change', () => {
        const settings = getSettings();
        settings.notifications = notifications.checked;
        saveSettings(settings);
      });
    }
    const clear = this.content.querySelector('#clear-recent');
    if (clear) clear.addEventListener('click', () => {
      const settings = getSettings();
      settings.recentFiles = [];
      saveSettings(settings);
      this.desktop.renderStartMenu();
    });
  }
}

class Terminal {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.cwd = '/Desktop';
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="app-shell" style="background:#020617; color:#e2e8f0;">
        <div id="terminal-output" class="terminal-output">Welcome to the local terminal.
Type help for commands.
</div>
        <div class="terminal-input-row">
          <span class="terminal-prompt">guest@desktop:${this.cwd}$</span>
          <input id="terminal-input" class="terminal-input" spellcheck="false" />
        </div>
      </div>
    `;
    this.output = this.container.querySelector('#terminal-output');
    this.input = this.container.querySelector('#terminal-input');
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.run(this.input.value);
        this.input.value = '';
      }
    });
  }

  write(text) {
    this.output.textContent += `${text}\n`;
    this.output.scrollTop = this.output.scrollHeight;
  }

  run(commandLine) {
    const raw = commandLine.trim();
    if (!raw) return;
    const [cmd, ...args] = raw.split(/\s+/);
    const lower = cmd.toLowerCase();
    if (lower === 'help') this.write('help | clear | ls | pwd | cd | mkdir | touch | echo | cat | rm | rename');
    else if (lower === 'clear') this.output.textContent = '';
    else if (lower === 'pwd') this.write(this.cwd);
    else if (lower === 'ls' || lower === 'dir') {
      const items = listFolder(this.cwd);
      this.write(items.map((item) => item.name).join('  ') || 'empty');
    } else if (lower === 'mkdir') {
      const name = args[0];
      if (!name) this.write('Usage: mkdir <name>');
      else this.write(createFolderAt(this.cwd, name) ? `Created ${name}` : 'Already exists');
    } else if (lower === 'touch') {
      const name = args[0];
      if (!name) this.write('Usage: touch <name>');
      else {
        const fs = getFS();
        const target = findInFS(this.cwd) || fs;
        const exists = (target.children || []).find((item) => item.name === name && item.type === 'file');
        if (exists) this.write('File already exists');
        else {
          target.children.push({ id: crypto.randomUUID(), name, type: 'file', content: '' });
          saveFS(fs);
          this.write(`Created ${name}`);
        }
      }
    } else if (lower === 'cd') {
      const target = args[0] || '/Desktop';
      const folder = findInFS(target);
      if (folder && folder.type === 'folder') {
        this.cwd = normalizePath(target);
        this.container.querySelector('.terminal-prompt').textContent = `guest@desktop:${this.cwd}$`;
      } else this.write('Directory not found');
    } else if (lower === 'echo') {
      this.write(args.join(' '));
    } else if (lower === 'cat') {
      const path = normalizePath(args[0] || this.cwd);
      const file = findInFS(path);
      if (file && file.type === 'file') this.write(file.content || '');
      else this.write('File not found');
    } else if (lower === 'rm') {
      const path = normalizePath(args[0] || '');
      if (!path || !removeAtPath(path)) this.write('Item not found');
      else this.write(`Removed ${args[0]}`);
    } else if (lower === 'rename') {
      const oldName = args[0];
      const newName = args[1];
      if (!oldName || !newName) this.write('Usage: rename <old> <new>');
      else {
        const folder = findInFS(this.cwd) || findInFS('/Desktop');
        const item = (folder.children || []).find((entry) => entry.name === oldName);
        if (!item) this.write('Item not found');
        else {
          item.name = newName;
          saveFS(getFS());
          this.write(`Renamed ${oldName} to ${newName}`);
        }
      }
    } else {
      this.write(`Command not found: ${cmd}`);
    }
  }
}

class Calculator {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.value = '0';
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="app-shell">
        <div class="calc-layout">
          <div id="calc-display" class="calc-display">0</div>
          <button class="calc-btn operator" data-op="C">C</button>
          <button class="calc-btn operator" data-op="DEL">DEL</button>
          <button class="calc-btn operator" data-op="%">%</button>
          <button class="calc-btn operator" data-op="/">÷</button>
          <button class="calc-btn" data-op="7">7</button>
          <button class="calc-btn" data-op="8">8</button>
          <button class="calc-btn" data-op="9">9</button>
          <button class="calc-btn operator" data-op="*">×</button>
          <button class="calc-btn" data-op="4">4</button>
          <button class="calc-btn" data-op="5">5</button>
          <button class="calc-btn" data-op="6">6</button>
          <button class="calc-btn operator" data-op="-">−</button>
          <button class="calc-btn" data-op="1">1</button>
          <button class="calc-btn" data-op="2">2</button>
          <button class="calc-btn" data-op="3">3</button>
          <button class="calc-btn operator" data-op="+">+</button>
          <button class="calc-btn" data-op="0">0</button>
          <button class="calc-btn" data-op=".">.</button>
          <button class="calc-btn" data-op="00">00</button>
          <button class="calc-btn equals" data-op="=">=</button>
        </div>
      </div>
    `;
    this.display = this.container.querySelector('#calc-display');
    this.bind();
  }

  bind() {
    this.container.querySelectorAll('.calc-btn').forEach((button) => {
      button.addEventListener('click', () => this.handle(button.dataset.op));
    });
    document.addEventListener('keydown', this.keydownHandler = (event) => {
      const key = event.key;
      if (/^[0-9]$/.test(key)) this.handle(key);
      else if (['+','-','*','/','.','%'].includes(key)) this.handle(key === '*' ? '*' : key === '/' ? '/' : key);
      else if (key === 'Enter') this.handle('=');
      else if (key === 'Backspace') this.handle('DEL');
      else if (key === 'Escape') this.handle('C');
    });
  }

  handle(op) {
    if (op === 'C') {
      this.value = '0';
      this.display.textContent = '0';
      return;
    }
    if (op === 'DEL') {
      this.value = this.value.length > 1 ? this.value.slice(0, -1) : '0';
      this.display.textContent = this.value;
      return;
    }
    if (op === '%') {
      this.value = String(Number(this.value || 0) / 100);
      this.display.textContent = this.value;
      return;
    }
    if (op === '=') {
      try {
        const expr = this.value.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\s+/g, '');
        const result = Function(`"use strict"; return (${expr})`)();
        this.value = String(result);
        this.display.textContent = this.value;
      } catch {
        this.display.textContent = 'Error';
      }
      return;
    }
    if (this.value === '0' && !['.', '+', '-', '*', '/'].includes(op)) {
      this.value = op;
    } else {
      this.value += op;
    }
    if (this.value === '00') this.value = '0';
    this.display.textContent = this.value;
  }
}

class Clock {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.running = false;
    this.stopwatch = 0;
    this.timer = 60;
    this.timerRunning = false;
    this.render();
    this.tick = setInterval(() => this.update(), 1000);
  }

  render() {
    this.container.innerHTML = `
      <div class="app-shell clock-layout">
        <div class="clock-panel">
          <div style="color: var(--muted);">Current time</div>
          <div id="digital-clock" class="big-time">--:--:--</div>
          <div id="date-label">--</div>
        </div>
        <div class="timer-panel">
          <div style="color: var(--muted);">Stopwatch</div>
          <div id="stopwatch-text" class="big-time">00:00:00</div>
          <div style="display:flex; gap:8px;">
            <button id="stopwatch-toggle">Start</button>
            <button id="stopwatch-reset">Reset</button>
          </div>
          <div style="margin-top: 16px; color: var(--muted);">Timer</div>
          <div id="timer-text" class="big-time">01:00</div>
          <div style="display:flex; gap:8px;">
            <button id="timer-toggle">Start</button>
            <button id="timer-reset">Reset</button>
          </div>
        </div>
      </div>
    `;
    this.clockText = this.container.querySelector('#digital-clock');
    this.dateLabel = this.container.querySelector('#date-label');
    this.stopwatchText = this.container.querySelector('#stopwatch-text');
    this.timerText = this.container.querySelector('#timer-text');
    this.container.querySelector('#stopwatch-toggle').addEventListener('click', () => {
      this.running = !this.running;
      this.container.querySelector('#stopwatch-toggle').textContent = this.running ? 'Pause' : 'Start';
    });
    this.container.querySelector('#stopwatch-reset').addEventListener('click', () => {
      this.stopwatch = 0;
      this.running = false;
      this.stopwatchText.textContent = '00:00:00';
      this.container.querySelector('#stopwatch-toggle').textContent = 'Start';
    });
    this.container.querySelector('#timer-toggle').addEventListener('click', () => {
      this.timerRunning = !this.timerRunning;
      this.container.querySelector('#timer-toggle').textContent = this.timerRunning ? 'Pause' : 'Start';
    });
    this.container.querySelector('#timer-reset').addEventListener('click', () => {
      this.timer = 60;
      this.timerRunning = false;
      this.timerText.textContent = '01:00';
      this.container.querySelector('#timer-toggle').textContent = 'Start';
    });
    this.update();
  }

  update() {
    const now = new Date();
    this.clockText.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.dateLabel.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (this.running) {
      this.stopwatch += 1;
      this.stopwatchText.textContent = this.formatSeconds(this.stopwatch);
    }
    if (this.timerRunning) {
      if (this.timer > 0) this.timer -= 1;
      this.timerText.textContent = this.formatSeconds(this.timer);
      if (this.timer === 0) {
        this.timerRunning = false;
        this.container.querySelector('#timer-toggle').textContent = 'Start';
        this.desktop.notify('Timer complete', 'Your countdown has ended.', 'success');
      }
    }
  }

  formatSeconds(sec) {
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;
    return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
  }
}

class Calendar {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.currentMonth = new Date().getMonth();
    this.currentYear = new Date().getFullYear();
    this.selectedDate = new Date();
    this.events = getCalendarEvents();
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="app-shell calendar-layout">
        <div class="calendar-header">
          <button id="prev-month">←</button>
          <strong>${new Date(this.currentYear, this.currentMonth, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })}</strong>
          <button id="next-month">→</button>
        </div>
        <div id="calendar-grid" class="calendar-grid"></div>
        <div id="event-panel" class="event-list"></div>
      </div>
    `;
    const grid = this.container.querySelector('#calendar-grid');
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((day) => {
      const cell = document.createElement('div');
      cell.className = 'calendar-weekday';
      cell.textContent = day;
      grid.appendChild(cell);
    });
    const first = new Date(this.currentYear, this.currentMonth, 1);
    const offset = first.getDay();
    for (let i = 0; i < offset; i++) grid.appendChild(document.createElement('div'));
    const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    for (let i = 1; i <= lastDay; i++) {
      const day = document.createElement('button');
      day.className = 'calendar-day';
      const date = new Date(this.currentYear, this.currentMonth, i);
      day.textContent = `${i}`;
      if (date.toDateString() === new Date().toDateString()) day.classList.add('today');
      if (date.toDateString() === this.selectedDate.toDateString()) day.classList.add('selected');
      day.addEventListener('click', () => {
        this.selectedDate = date;
        this.render();
      });
      grid.appendChild(day);
    }
    this.container.querySelector('#prev-month').addEventListener('click', () => {
      this.currentMonth --;
      if (this.currentMonth < 0) { this.currentMonth = 11; this.currentYear--; }
      this.render();
    });
    this.container.querySelector('#next-month').addEventListener('click', () => {
      this.currentMonth ++;
      if (this.currentMonth > 11) { this.currentMonth = 0; this.currentYear++; }
      this.render();
    });
    const panel = this.container.querySelector('#event-panel');
    const dateKey = this.toDateKey(this.selectedDate);
    const events = this.events.filter((event) => event.date === dateKey);
    panel.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
      <strong>${this.selectedDate.toDateString()}</strong>
      <button id="add-event">Add</button>
    </div>`;
    if (!events.length) panel.innerHTML += '<div style="color: var(--muted);">No events.</div>';
    else {
      events.forEach((event) => {
        const row = document.createElement('div');
        row.className = 'event-item';
        row.innerHTML = `<span>${event.title}</span><button data-id="${event.id}">Delete</button>`;
        row.querySelector('button').addEventListener('click', () => {
          this.events = this.events.filter((item) => item.id !== event.id);
          saveCalendarEvents(this.events);
          this.render();
        });
        panel.appendChild(row);
      });
    }
    this.container.querySelector('#add-event')?.addEventListener('click', () => {
      const title = window.prompt('Event title:', 'New event');
      if (!title) return;
      this.events.push({ id: crypto.randomUUID(), title, date: dateKey });
      saveCalendarEvents(this.events);
      this.render();
    });
  }

  toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}

class Paint {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.tool = 'brush';
    this.color = '#000000';
    this.size = 4;
    this.isDrawing = false;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="app-shell">
        <div class="paint-toolbar">
          <button data-tool="brush">Brush</button>
          <button data-tool="eraser">Eraser</button>
          <button data-tool="line">Line</button>
          <button data-tool="rect">Rectangle</button>
          <button data-tool="circle">Circle</button>
          <input id="paint-color" type="color" value="#000000" />
          <input id="paint-size" type="range" min="1" max="30" value="4" />
          <button id="paint-clear">Clear</button>
          <button id="paint-save">Save</button>
        </div>
        <canvas id="paint-canvas" width="900" height="500"></canvas>
      </div>
    `;
    this.canvas = this.container.querySelector('#paint-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.bind();
  }

  bind() {
    this.container.querySelectorAll('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => this.tool = button.dataset.tool);
    });
    this.container.querySelector('#paint-color').addEventListener('input', (event) => this.color = event.target.value);
    this.container.querySelector('#paint-size').addEventListener('input', (event) => this.size = Number(event.target.value));
    this.container.querySelector('#paint-clear').addEventListener('click', () => {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    });
    this.container.querySelector('#paint-save').addEventListener('click', () => {
      const data = this.canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = data;
      a.download = 'drawing.png';
      a.click();
      this.desktop.notify('Saved drawing', 'PNG saved to your browser downloads.', 'success');
    });
    this.canvas.addEventListener('pointerdown', (event) => this.startDraw(event));
    this.canvas.addEventListener('pointermove', (event) => this.draw(event));
    this.canvas.addEventListener('pointerup', () => this.isDrawing = false);
    this.canvas.addEventListener('pointerleave', () => this.isDrawing = false);
  }

  startDraw(event) {
    this.isDrawing = true;
    const rect = this.canvas.getBoundingClientRect();
    this.lastX = event.clientX - rect.left;
    this.lastY = event.clientY - rect.top;
    this.startX = this.lastX;
    this.startY = this.lastY;
  }

  draw(event) {
    if (!this.isDrawing) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.ctx.lineWidth = this.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.tool === 'eraser' ? '#ffffff' : this.color;
    this.ctx.fillStyle = this.color;
    if (this.tool === 'brush' || this.tool === 'eraser') {
      this.ctx.beginPath();
      this.ctx.moveTo(this.lastX, this.lastY);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
      this.lastX = x;
      this.lastY = y;
    } else if (this.tool === 'line') {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.beginPath();
      this.ctx.moveTo(this.startX, this.startY);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
    } else if (this.tool === 'rect') {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.strokeRect(this.startX, this.startY, x - this.startX, y - this.startY);
    } else if (this.tool === 'circle') {
      this.ctx.beginPath();
      const radius = Math.hypot(x - this.startX, y - this.startY);
      this.ctx.arc(this.startX, this.startY, radius, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }
}

class MediaPlayer {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.playlist = [
      { name: 'Demo audio', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
      { name: 'Demo video', src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' }
    ];
    this.current = 0;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="app-shell media-layout">
        <aside class="playlist">
          <div class="menu-heading">Playlist</div>
          <div id="playlist-list"></div>
        </aside>
        <div class="media-view">
          <video id="media-video" class="media-video" controls></video>
          <input id="media-progress" type="range" min="0" max="100" value="0" />
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button id="media-play">Play</button>
            <button id="media-pause">Pause</button>
            <label>Volume <input id="media-volume" type="range" min="0" max="1" step="0.1" value="0.7" /></label>
          </div>
        </div>
      </div>
    `;
    this.video = this.container.querySelector('#media-video');
    this.progress = this.container.querySelector('#media-progress');
    this.volume = this.container.querySelector('#media-volume');
    this.list = this.container.querySelector('#playlist-list');
    this.bind();
    this.populatePlaylist();
  }

  bind() {
    this.container.querySelector('#media-play').addEventListener('click', () => this.video.play());
    this.container.querySelector('#media-pause').addEventListener('click', () => this.video.pause());
    this.volume.addEventListener('input', () => this.video.volume = Number(this.volume.value));
    this.progress.addEventListener('input', () => {
      if (this.video.duration) this.video.currentTime = (this.progress.value / 100) * this.video.duration;
    });
    this.video.addEventListener('timeupdate', () => {
      if (this.video.duration) this.progress.value = (this.video.currentTime / this.video.duration) * 100;
    });
  }

  populatePlaylist() {
    this.playlist.forEach((item, index) => {
      const button = document.createElement('button');
      button.className = 'sidebar-item';
      button.textContent = item.name;
      button.addEventListener('click', () => {
        this.current = index;
        this.video.src = item.src;
      });
      this.list.appendChild(button);
    });
    this.video.src = this.playlist[0].src;
  }
}

class Games {
  constructor(container, desktop) {
    this.container = container;
    this.desktop = desktop;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="app-shell">
        <div class="game-library">
          <button class="game-card" data-game="tictactoe">Tic-Tac-Toe</button>
          <button class="game-card" data-game="snake">Snake</button>
          <button class="game-card" data-game="2048">2048</button>
        </div>
      </div>
    `;
    this.container.querySelectorAll('[data-game]').forEach((button) => {
      button.addEventListener('click', () => this.launch(button.dataset.game));
    });
  }

  launch(game) {
    if (game === 'tictactoe') {
      const board = new TicTacToe(this.container);
      this.container.innerHTML = '';
      this.container.appendChild(board.element);
    } else if (game === 'snake') {
      const snake = new SnakeGame(this.container);
      this.container.innerHTML = '';
      this.container.appendChild(snake.element);
    } else if (game === '2048') {
      this.container.innerHTML = '<div style="padding: 16px;">2048 is available in a lightweight local version.</div>';
    }
  }
}

class TicTacToe {
  constructor(parent) {
    this.element = document.createElement('div');
    this.element.style.padding = '16px';
    this.element.innerHTML = '<div class="board"></div>';
    const board = this.element.querySelector('.board');
    const cells = Array(9).fill('');
    let current = 'X';
    Array.from({ length: 9 }).forEach((_, idx) => {
      const cell = document.createElement('button');
      cell.className = 'cell';
      cell.addEventListener('click', () => {
        if (cells[idx]) return;
        cells[idx] = current;
        cell.textContent = current;
        if (winner(cells, current)) {
          window.alert(`${current} wins!`);
          return;
        }
        current = current === 'X' ? 'O' : 'X';
      });
      board.appendChild(cell);
    });
    function winner(arr, value) {
      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      return lines.some((line) => line.every((n) => arr[n] === value));
    }
    parent.appendChild(this.element);
  }
}

class SnakeGame {
  constructor(parent) {
    const wrap = document.createElement('div');
    wrap.style.padding = '12px';
    const canvas = document.createElement('canvas');
    canvas.width = 340;
    canvas.height = 340;
    const ctx = canvas.getContext('2d');
    const grid = 20;
    let snake = [{ x: 10, y: 10 }];
    let dir = { x: 1, y: 0 };
    let food = { x: 8, y: 8 };
    let loop;
    wrap.appendChild(canvas);
    function draw() {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      snake.forEach((segment) => {
        ctx.fillStyle = '#34d399';
        ctx.fillRect(segment.x * grid, segment.y * grid, grid - 2, grid - 2);
      });
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(food.x * grid, food.y * grid, grid - 2, grid - 2);
    }
    function update() {
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= 17 || head.y >= 17) {
        clearInterval(loop);
        window.alert('Game over');
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        food = { x: Math.floor(Math.random() * 17), y: Math.floor(Math.random() * 17) };
      } else {
        snake.pop();
      }
      draw();
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp') dir = { x: 0, y: -1 };
      if (event.key === 'ArrowDown') dir = { x: 0, y: 1 };
      if (event.key === 'ArrowLeft') dir = { x: -1, y: 0 };
      if (event.key === 'ArrowRight') dir = { x: 1, y: 0 };
    });
    draw();
    loop = setInterval(update, 150);
    parent.appendChild(wrap);
    this.element = wrap;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const desktop = new DesktopApp();
  window.desktop = desktop;
  desktop.openApp('file-explorer');
  desktop.openApp('browser');
  desktop.renderNotifications();
});

export { DesktopApp };
