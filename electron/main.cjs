const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  } catch {
    // Ignore malformed files
  }
  return result;
}

function detectGitHubOriginRepo() {
  const gitConfigCandidates = [
    path.join(process.cwd(), '.git', 'config'),
    path.join(__dirname, '..', '.git', 'config'),
  ];

  for (const cfgPath of gitConfigCandidates) {
    if (!fs.existsSync(cfgPath)) continue;
    try {
      const content = fs.readFileSync(cfgPath, 'utf8');
      const originSection = content.match(/\[remote\s+"origin"\]([\s\S]*?)(?:\n\[|$)/i);
      const sectionBody = originSection ? originSection[1] : content;
      const urlMatch = sectionBody.match(/url\s*=\s*(.+)/i);
      if (!urlMatch) continue;
      const remoteUrl = urlMatch[1].trim();
      const ghMatch = remoteUrl.match(
        /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i
      );
      if (ghMatch) {
        return `${ghMatch[1]}/${ghMatch[2]}`;
      }
    } catch {
      // Ignore git config read failures
    }
  }
  return '';
}

function loadDesktopEnv() {
  const execDir = path.dirname(process.execPath);
  const detectedRepo = detectGitHubOriginRepo();

  const configCandidates = [
    path.join(execDir, 'desktop-config.json'),
    path.join(process.cwd(), 'desktop-config.json'),
    path.join(__dirname, '..', 'desktop-config.json'),
  ];

  for (const cfgPath of configCandidates) {
    if (fs.existsSync(cfgPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        return {
          defaultApiUrl: parsed.defaultApiUrl || 'http://127.0.0.1:3001',
          preconfiguredKey: parsed.preconfiguredKey || '',
          defaultGitHubRepo: parsed.defaultGitHubRepo || detectedRepo,
          defaultGitHubBranch: parsed.defaultGitHubBranch || '',
          preconfiguredGitHubToken: parsed.preconfiguredGitHubToken || '',
        };
      } catch {
        // Ignore invalid JSON
      }
    }
  }

  const envCandidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(execDir, '.env'),
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      const parsed = parseEnvFile(envPath);
      const port = parsed.PORT || '3001';
      return {
        defaultApiUrl: `http://127.0.0.1:${port}`,
        preconfiguredKey: parsed.CATALOG_ADMIN_KEY || '',
        defaultGitHubRepo: parsed.GITHUB_REPO || detectedRepo,
        defaultGitHubBranch: parsed.GITHUB_BRANCH || '',
        preconfiguredGitHubToken: parsed.GITHUB_TOKEN || '',
      };
    }
  }

  return {
    defaultApiUrl: 'http://127.0.0.1:3001',
    preconfiguredKey: '',
    defaultGitHubRepo: detectedRepo,
    defaultGitHubBranch: '',
    preconfiguredGitHubToken: '',
  };
}

const desktopEnv = loadDesktopEnv();

ipcMain.on('get-desktop-env', (event) => {
  event.returnValue = desktopEnv;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 800,
    minHeight: 640,
    autoHideMenuBar: true,
    title: 'Complete a Música — Gerenciador do Catálogo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
