/**
 * gdrive.js - Google Drive Sync integration for FinanceFlow
 */

let tokenClient;
let gapiInited = false;
let gisInited = false;
let gdriveFileId = null;

const DEFAULT_CLIENT_ID = '696812902574-9iumi00k2aaqik27s8ket0arqq5fibcu.apps.googleusercontent.com';

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// 1. Initialization and Loaders
window.gapiLoad = function() {
  gapi.load('client', async () => {
    try {
      await gapi.client.init({
        discoveryDocs: [DISCOVERY_DOC],
      });
      gapiInited = true;
      console.log("Google API Client loaded");
      
      const syncEnabled = localStorage.getItem('gdrive_sync_enabled') === 'true';
      const token = JSON.parse(localStorage.getItem('gdrive_oauth_token'));
      
      if (syncEnabled && token && new Date().getTime() < token.expires_at) {
        gapi.client.setToken(token);
        startSync();
      } else {
        if (syncEnabled) {
          // Sync is active but token is missing/expired: show auth gate
          toggleAuthGate(true);
        }
        updateSyncUI();
      }
    } catch (err) {
      console.error("GAPI initialization error", err);
    }
  });
};

window.gisLoad = function() {
  gisInit();
};

function gisInit() {
  const clientId = localStorage.getItem('gdrive_client_id') || DEFAULT_CLIENT_ID;
  if (!clientId) {
    updateSyncUI();
    return;
  }

  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: handleAuthCallback,
      error_callback: (err) => {
        console.error("Google Identity Services auth error:", err);
        showToast("Sign-in failed/canceled. Please try again.", "error");
      }
    });
    gisInited = true;
    updateSyncUI();
    console.log("Google Identity Services loaded");
  } catch (err) {
    console.error("GIS initialization error", err);
  }
}

function ensureGapiInit() {
  if (gapiInited) return Promise.resolve(true);

  return new Promise((resolve) => {
    if (typeof gapi === 'undefined' || typeof gapi.load === 'undefined') {
      console.error("GAPI script not loaded yet");
      resolve(false);
      return;
    }
    
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          discoveryDocs: [DISCOVERY_DOC],
        });
        gapiInited = true;
        console.log("Google API Client loaded dynamically");
        resolve(true);
      } catch (err) {
        console.error("GAPI dynamic initialization error", err);
        resolve(false);
      }
    });
  });
}

// 2. Authentication Handlers
function handleAuthClick() {
  const clientId = localStorage.getItem('gdrive_client_id') || DEFAULT_CLIENT_ID;
  if (!clientId) {
    showToast("Please enter a Google Client ID in the Backup & Sync page first!", "error");
    switchTab('backup');
    const input = document.getElementById('gdriveClientId');
    if (input) input.focus();
    return;
  }

  if (!gisInited) {
    gisInit();
  }

  if (tokenClient) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    showToast("Initializing Google Sign-in. Please try again in a moment.", "error");
  }
}

async function handleAuthCallback(tokenResponse) {
  if (tokenResponse.error !== undefined) {
    console.error("Auth callback error:", tokenResponse);
    showToast("Google Authentication failed!", "error");
    return;
  }

  try {
    const token = {
      ...tokenResponse,
      expires_at: new Date().getTime() + (tokenResponse.expires_in * 1000)
    };
    localStorage.setItem('gdrive_oauth_token', JSON.stringify(token));

    // Ensure GAPI client is fully loaded and initialized before setting token
    const inited = await ensureGapiInit();
    if (!inited) {
      showToast("Google API services failed to load. Please reload the page.", "error");
      return;
    }

    if (gapi && gapi.client) {
      gapi.client.setToken(token);
    } else {
      throw new Error("GAPI client not available");
    }

    showToast("Authenticated with Google!", "success");
    await startSync();
  } catch (err) {
    console.error("Error in auth callback:", err);
    showToast("Authentication callback error: " + err.message, "error");
  }
}

function handleLogout() {
  localStorage.removeItem('gdrive_oauth_token');
  localStorage.removeItem('gdrive_sync_enabled');
  localStorage.removeItem('gdrive_client_id');
  localStorage.removeItem('home_expenses_transactions');
  localStorage.removeItem('base_opening_balance');
  localStorage.removeItem('financeflow_last_updated');
  gdriveFileId = null;
  
  if (typeof gapi !== 'undefined' && gapi.client) {
    gapi.client.setToken(null);
  }
  
  showToast("Logged out & browser cache cleared!", "success");
  toggleAuthGate(false);
  updateSyncUI();
  
  // Reload the page to reset the application state and load seed data
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

// 3. Two-Way Sync Conflict Resolution
async function startSync() {
  const inited = await ensureGapiInit();
  if (!inited) {
    showToast("Google API services failed to load. Please reload the page.", "error");
    return;
  }

  try {
    // Show spinner or pulse status badge
    setSyncingIndicator(true);

    const localTxs = JSON.parse(localStorage.getItem('home_expenses_transactions')) || [];
    const localBaseBalance = parseFloat(localStorage.getItem('base_opening_balance') || '0');
    const localLastUpdated = parseInt(localStorage.getItem('financeflow_last_updated') || '0', 10);

    // Search for the backup file in Google Drive
    const response = await gapi.client.drive.files.list({
      q: "name = 'financeflow_backup.json' and trashed = false",
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive'
    });

    const files = response.result.files;
    if (files && files.length > 0) {
      gdriveFileId = files[0].id;
      const fileData = await fetchFileContent(gdriveFileId);
      
      if (fileData) {
        let cloudTxs = [];
        let cloudBaseBalance = 0;
        let cloudLastUpdated = 0;

        if (Array.isArray(fileData)) {
          // Retroactive support for simple list structures
          cloudTxs = fileData;
        } else if (fileData && typeof fileData === 'object') {
          cloudTxs = fileData.transactions || [];
          cloudBaseBalance = parseFloat(fileData.base_opening_balance || '0');
          cloudLastUpdated = parseInt(fileData.last_updated || '0', 10);
        }

        // Overwrite rules:
        // Cloud wins if it's strictly newer, or if the local dataset has <= 15 items (assumed fresh seed data)
        const isLocalNewer = localLastUpdated > cloudLastUpdated;
        const isFreshSeed = localTxs.length <= 15 && localLastUpdated === 0;

        if (!isLocalNewer && (cloudLastUpdated > localLastUpdated || isFreshSeed)) {
          console.log("Cloud backup is newer. Overwriting local data...");
          
          state.transactions = cloudTxs;
          localStorage.setItem('home_expenses_transactions', JSON.stringify(cloudTxs));
          localStorage.setItem('base_opening_balance', cloudBaseBalance.toString());
          localStorage.setItem('financeflow_last_updated', cloudLastUpdated.toString());
          
          showToast("Loaded synced data from Google Drive!", "success");
          if (typeof refreshDashboard === 'function') {
            refreshDashboard();
          }
        } else if (isLocalNewer) {
          console.log("Local changes are newer. Overwriting cloud backup file...");
          await updateCloudFile();
        } else {
          console.log("FinanceFlow is already fully synchronized.");
        }
      }
    } else {
      // No cloud file found: upload current local state
      console.log("No cloud file found. Uploading initial backup...");
      await createCloudFile();
    }

    localStorage.setItem('gdrive_sync_enabled', 'true');
    toggleAuthGate(false);
    updateSyncUI();
  } catch (err) {
    console.error("Synchronization failed", err);
    if (err.status === 401) {
      handleLogout();
    } else {
      showToast("Cloud sync failed. Check internet connection.", "error");
    }
  } finally {
    setSyncingIndicator(false);
  }
}

async function fetchFileContent(fileId) {
  try {
    const response = await gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media'
    });
    let data = response.body || response.result;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        console.error("Error parsing fetched JSON", e);
        return null;
      }
    }
    return data;
  } catch (err) {
    console.error("Error fetching file content", err);
    return null;
  }
}

async function createCloudFile() {
  const metadata = {
    name: 'financeflow_backup.json',
    mimeType: 'application/json'
  };

  const localTxs = state.transactions;
  const localBaseBalance = parseFloat(localStorage.getItem('base_opening_balance') || '0');
  const localLastUpdated = parseInt(localStorage.getItem('financeflow_last_updated') || '0', 10);

  const payload = {
    transactions: localTxs,
    base_opening_balance: localBaseBalance,
    last_updated: localLastUpdated
  };

  const content = JSON.stringify(payload);
  const boundary = 'gdrive_sync_boundary';
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      content +
      close_delim;

  const request = gapi.client.request({
    path: '/upload/drive/v3/files',
    method: 'POST',
    params: {'uploadType': 'multipart'},
    headers: {
      'Content-Type': 'multipart/related; boundary="' + boundary + '"'
    },
    body: multipartRequestBody
  });

  const response = await request;
  gdriveFileId = response.result.id;
  console.log("Created backup file in Google Drive with ID:", gdriveFileId);
}

async function updateCloudFile() {
  if (!gdriveFileId || !gapiInited) return;

  try {
    const token = JSON.parse(localStorage.getItem('gdrive_oauth_token'));
    if (!token || new Date().getTime() >= token.expires_at) {
      console.log("Token expired. Auto-upload skipped.");
      return;
    }

    const localTxs = state.transactions;
    const localBaseBalance = parseFloat(localStorage.getItem('base_opening_balance') || '0');
    const localLastUpdated = parseInt(localStorage.getItem('financeflow_last_updated') || '0', 10);

    const payload = {
      transactions: localTxs,
      base_opening_balance: localBaseBalance,
      last_updated: localLastUpdated
    };

    const content = JSON.stringify(payload);
    const request = gapi.client.request({
      path: '/upload/drive/v3/files/' + gdriveFileId,
      method: 'PATCH',
      params: {'uploadType': 'media'},
      body: content
    });
    await request;
    console.log("Cloud backup updated successfully");
  } catch (err) {
    console.error("Failed to update cloud file:", err);
    if (err.status === 401) {
      handleLogout();
    }
  }
}

// 4. UI Functions
function toggleAuthGate(visible) {
  const authGate = document.getElementById('authGate');
  if (!authGate) return;
  authGate.style.display = visible ? 'flex' : 'none';
  if (visible) {
    document.documentElement.classList.add('gdrive-sync-locked');
  } else {
    document.documentElement.classList.remove('gdrive-sync-locked');
  }
}

function setSyncingIndicator(isSyncing) {
  const syncNowBtns = document.querySelectorAll('.gdrive-sync-now-btn');
  syncNowBtns.forEach(btn => {
    if (isSyncing) {
      btn.innerText = "🔄 Syncing...";
      btn.style.pointerEvents = "none";
      btn.style.opacity = "0.7";
    } else {
      btn.innerText = "🔄 Sync Now";
      btn.style.pointerEvents = "auto";
      btn.style.opacity = "1";
    }
  });
}

function updateSyncUI() {
  const sidebarContainer = document.getElementById('gdriveStatusContainer');
  const mobileContainer = document.getElementById('gdriveStatusContainerMobile');

  const isConnected = localStorage.getItem('gdrive_sync_enabled') === 'true';
  const clientId = localStorage.getItem('gdrive_client_id') || DEFAULT_CLIENT_ID;

  let htmlContent = '';

  if (isConnected) {
    htmlContent = `
      <div style="display:flex; flex-direction:column; gap:0.5rem; width:100%;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="gdrive-status-badge connected">● Connected</span>
          <button class="gdrive-sync-now-btn" style="background:transparent; border:none; color:#4285F4; font-size:0.75rem; font-weight:600; cursor:pointer;" title="Sync Now">🔄 Sync Now</button>
        </div>
        <button class="btn btn-secondary gdrive-logout-btn" style="width:100%; font-size:0.75rem; padding:0.4rem; border-color:var(--accent-expense); color:var(--accent-expense);">Disconnect</button>
      </div>
    `;
  } else {
    if (clientId) {
      htmlContent = `
        <div style="display:flex; flex-direction:column; gap:0.5rem; width:100%;">
          <div class="gdrive-status-badge disconnected">● Disconnected</div>
          <button class="btn btn-primary gdrive-login-btn" style="width: 100%; font-size: 0.8rem; padding: 0.5rem; background: #4285F4; display: flex; align-items: center; justify-content: center; gap: 0.5rem; border: none; box-shadow: 0 4px 10px rgba(66, 133, 244, 0.2);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Sign in with Google
          </button>
        </div>
      `;
    } else {
      htmlContent = `
        <div style="display:flex; flex-direction:column; gap:0.5rem; width:100%;">
          <div class="gdrive-status-badge disconnected" style="font-size: 0.7rem;">● Setup Required</div>
          <button class="btn btn-secondary gdrive-setup-btn" style="width: 100%; font-size: 0.75rem; padding: 0.4rem;">Configure ID</button>
        </div>
      `;
    }
  }

  // Inject content
  if (sidebarContainer) {
    sidebarContainer.innerHTML = htmlContent;
  }
  if (mobileContainer) {
    mobileContainer.innerHTML = htmlContent;
  }

  // Re-bind listeners for both
  document.querySelectorAll('.gdrive-logout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm("Are you sure you want to disconnect Google Drive sync and wipe all local storage data from this device?")) {
        handleLogout();
      }
    });
  });
  document.querySelectorAll('.gdrive-sync-now-btn').forEach(btn => {
    btn.addEventListener('click', startSync);
  });
  document.querySelectorAll('.gdrive-login-btn').forEach(btn => {
    btn.addEventListener('click', handleAuthClick);
  });
  document.querySelectorAll('.gdrive-setup-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab('backup');
      const input = document.getElementById('gdriveClientId');
      if (input) input.focus();
    });
  });
}

// 5. Config Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  const gdriveIdInput = document.getElementById('gdriveClientId');
  if (gdriveIdInput) {
    gdriveIdInput.value = localStorage.getItem('gdrive_client_id') || '';
  }

  const saveBtn = document.getElementById('saveGdriveConfigBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const clientId = document.getElementById('gdriveClientId').value.trim();
      if (clientId === '') {
        showToast("Please enter a valid Google Client ID", "error");
        return;
      }
      localStorage.setItem('gdrive_client_id', clientId);
      showToast("Settings saved. Connecting...", "success");
      gisInit();
      handleAuthClick();
    });
  }

  // Auth gate buttons
  const gateLoginBtn = document.getElementById('gateLoginBtn');
  if (gateLoginBtn) {
    gateLoginBtn.addEventListener('click', handleAuthClick);
  }

  const gateResetBtn = document.getElementById('gateResetBtn');
  if (gateResetBtn) {
    gateResetBtn.addEventListener('click', () => {
      if (confirm("Wipe all local cash transaction data from this device? This cannot be undone.")) {
        handleLogout();
      }
    });
  }
  
  // Initial UI Setup
  updateSyncUI();
});
