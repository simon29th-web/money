import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { auth, googleDriveProvider } from '../firebase/config';
import { AppState } from '../utils/ledgerCore';

export interface DriveFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

export interface DriveSyncStatus {
  isConnected: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  fileId: string | null;
  webViewLink: string | null;
  error: string | null;
  autoSync: boolean;
}

const DRIVE_FILE_NAME = 'PennyPop_Finance_Backup.json';
const AUTOSYNC_STORAGE_KEY = 'pennypop_drive_autosync_enabled';

// In-memory token storage (NEVER stored in localStorage per Workspace guidelines)
let inMemoryAccessToken: string | null = null;
let currentBackupFileId: string | null = null;
let currentWebViewLink: string | null = null;

// Subscribers for Drive status changes
type DriveStatusListener = (status: DriveSyncStatus) => void;
const statusListeners = new Set<DriveStatusListener>();

let driveStatus: DriveSyncStatus = {
  isConnected: false,
  isSyncing: false,
  lastSyncedAt: null,
  fileId: null,
  webViewLink: null,
  error: null,
  autoSync: localStorage.getItem(AUTOSYNC_STORAGE_KEY) !== 'false',
};

function notifyListeners() {
  const current = { ...driveStatus };
  statusListeners.forEach((listener) => {
    try {
      listener(current);
    } catch (err) {
      console.error('Error notifying Drive listener:', err);
    }
  });
}

export function subscribeDriveStatus(listener: DriveStatusListener): () => void {
  statusListeners.add(listener);
  listener({ ...driveStatus });
  return () => {
    statusListeners.delete(listener);
  };
}

export function getDriveStatus(): DriveSyncStatus {
  return { ...driveStatus };
}

export function setCachedDriveToken(token: string | null) {
  inMemoryAccessToken = token;
  driveStatus = {
    ...driveStatus,
    isConnected: !!token,
    error: null,
  };
  notifyListeners();
}

export function getCachedDriveToken(): string | null {
  return inMemoryAccessToken;
}

export function setDriveAutoSync(enabled: boolean) {
  localStorage.setItem(AUTOSYNC_STORAGE_KEY, enabled ? 'true' : 'false');
  driveStatus = {
    ...driveStatus,
    autoSync: enabled,
  };
  notifyListeners();
}

/**
 * Connect Google Drive via Google OAuth popup and retrieve access token with Drive scopes.
 */
export async function connectGoogleDrive(): Promise<{ user: User; accessToken: string }> {
  driveStatus = { ...driveStatus, isSyncing: true, error: null };
  notifyListeners();

  try {
    const result = await signInWithPopup(auth, googleDriveProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error('Google Drive access token was not returned. Please try again.');
    }

    setCachedDriveToken(accessToken);

    // Check if backup already exists
    const existing = await findDriveBackupFile(accessToken);
    if (existing) {
      currentBackupFileId = existing.id;
      currentWebViewLink = existing.webViewLink || null;
      driveStatus = {
        ...driveStatus,
        isConnected: true,
        isSyncing: false,
        fileId: existing.id,
        webViewLink: existing.webViewLink || null,
        lastSyncedAt: existing.modifiedTime,
      };
    } else {
      driveStatus = {
        ...driveStatus,
        isConnected: true,
        isSyncing: false,
      };
    }
    notifyListeners();

    return { user: result.user, accessToken };
  } catch (error: any) {
    console.error('Connect Google Drive failed:', error);
    driveStatus = {
      ...driveStatus,
      isSyncing: false,
      error: error.message || 'Failed to authenticate Google Drive',
    };
    notifyListeners();
    throw error;
  }
}

/**
 * Disconnect Google Drive session and clear in-memory token.
 */
export function disconnectGoogleDrive() {
  setCachedDriveToken(null);
  currentBackupFileId = null;
  currentWebViewLink = null;
  driveStatus = {
    isConnected: false,
    isSyncing: false,
    lastSyncedAt: null,
    fileId: null,
    webViewLink: null,
    error: null,
    autoSync: driveStatus.autoSync,
  };
  notifyListeners();
}

/**
 * Find existing FinSense backup file in user's Google Drive.
 */
export async function findDriveBackupFile(token?: string): Promise<DriveFileInfo | null> {
  const activeToken = token || inMemoryAccessToken;
  if (!activeToken) return null;

  try {
    const query = encodeURIComponent(`name = '${DRIVE_FILE_NAME}' and trashed = false`);
    const fields = encodeURIComponent('files(id, name, modifiedTime, size, webViewLink)');
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=5`,
      {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      }
    );

    if (!res.ok) {
      if (res.status === 401) {
        setCachedDriveToken(null);
        throw new Error('Google Drive session expired. Please re-authenticate.');
      }
      throw new Error(`Google Drive API error: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.files && data.files.length > 0) {
      const file = data.files[0];
      currentBackupFileId = file.id;
      currentWebViewLink = file.webViewLink || null;
      return file as DriveFileInfo;
    }
    return null;
  } catch (err) {
    console.warn('Error searching for Drive backup file:', err);
    return null;
  }
}

/**
 * Clean application state for Google Drive backup export.
 */
function prepareDrivePayload(state: AppState) {
  const sanitizeTxns = (txns: AppState['personal']['txns']) => {
    return (txns || []).map((t) => {
      // Keep lightweight receipt previews if reasonable size
      if (t.receipt && t.receipt.length > 150000) {
        return { ...t, receipt: null };
      }
      return t;
    });
  };

  return {
    appName: 'PennyPop - Fun & Smart Expense Tracker',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    name: state.name,
    gstin: state.gstin,
    mode: state.mode,
    ym: state.ym,
    personal: {
      ...state.personal,
      txns: sanitizeTxns(state.personal.txns),
    },
    shop: {
      ...state.shop,
      txns: sanitizeTxns(state.shop.txns),
    },
    rseq: state.rseq,
    opts: state.opts,
  };
}

/**
 * Upload or update the FinSense backup in the user's Google Drive.
 */
export async function syncLedgerToGoogleDrive(
  state: AppState,
  explicitToken?: string
): Promise<{ fileId: string; modifiedTime: string; webViewLink?: string }> {
  const activeToken = explicitToken || inMemoryAccessToken;
  if (!activeToken) {
    throw new Error('Google Drive not connected. Please connect Google Drive first.');
  }

  driveStatus = { ...driveStatus, isSyncing: true, error: null };
  notifyListeners();

  try {
    let fileId = currentBackupFileId;
    if (!fileId) {
      const existing = await findDriveBackupFile(activeToken);
      if (existing) {
        fileId = existing.id;
        currentBackupFileId = existing.id;
      }
    }

    const payload = prepareDrivePayload(state);
    const jsonContent = JSON.stringify(payload, null, 2);
    const nowIso = new Date().toISOString();

    let resultFileId = fileId;
    let webViewLink = currentWebViewLink || undefined;

    if (fileId) {
      // Update existing file using multipart or media upload
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'Content-Type': 'application/json',
          },
          body: jsonContent,
        }
      );

      if (!updateRes.ok) {
        if (updateRes.status === 404) {
          // File was deleted in Drive, create new one
          currentBackupFileId = null;
          return syncLedgerToGoogleDrive(state, activeToken);
        }
        if (updateRes.status === 401) {
          setCachedDriveToken(null);
          throw new Error('Google Drive session expired. Please re-authenticate.');
        }
        throw new Error(`Google Drive update failed: ${updateRes.statusText}`);
      }

      const updateData = await updateRes.json();
      resultFileId = updateData.id || fileId;
    } else {
      // Create new file via multipart upload
      const metadata = {
        name: DRIVE_FILE_NAME,
        mimeType: 'application/json',
        description: 'FinSense Automated Ledger & ML Expense Tracker Backup',
      };

      const boundary = '-------FinSenseBoundary7MA4YWxkTrZu0gW';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        jsonContent +
        closeDelimiter;

      const createRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );

      if (!createRes.ok) {
        if (createRes.status === 401) {
          setCachedDriveToken(null);
          throw new Error('Google Drive session expired. Please re-authenticate.');
        }
        throw new Error(`Google Drive file creation failed: ${createRes.statusText}`);
      }

      const createData = await createRes.json();
      resultFileId = createData.id;
      webViewLink = createData.webViewLink;
      currentBackupFileId = resultFileId;
      currentWebViewLink = webViewLink || null;
    }

    driveStatus = {
      ...driveStatus,
      isConnected: true,
      isSyncing: false,
      lastSyncedAt: nowIso,
      fileId: resultFileId || null,
      webViewLink: webViewLink || currentWebViewLink,
      error: null,
    };
    notifyListeners();

    return {
      fileId: resultFileId || '',
      modifiedTime: nowIso,
      webViewLink,
    };
  } catch (err: any) {
    console.error('Failed to sync to Google Drive:', err);
    driveStatus = {
      ...driveStatus,
      isSyncing: false,
      error: err.message || 'Failed to sync with Google Drive',
    };
    notifyListeners();
    throw err;
  }
}

/**
 * Fetch and download backup state from user's Google Drive.
 */
export async function fetchLedgerFromGoogleDrive(
  explicitToken?: string,
  targetFileId?: string
): Promise<{ state: Partial<AppState>; modifiedTime: string } | null> {
  const activeToken = explicitToken || inMemoryAccessToken;
  if (!activeToken) {
    throw new Error('Google Drive not connected. Please connect Google Drive first.');
  }

  let fileId = targetFileId || currentBackupFileId;
  if (!fileId) {
    const existing = await findDriveBackupFile(activeToken);
    if (!existing) {
      return null;
    }
    fileId = existing.id;
    currentBackupFileId = existing.id;
  }

  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        setCachedDriveToken(null);
        throw new Error('Google Drive session expired. Please re-authenticate.');
      }
      throw new Error(`Failed to read file from Google Drive: ${res.statusText}`);
    }

    const json = await res.json();
    return {
      state: {
        name: json.name,
        gstin: json.gstin,
        personal: json.personal,
        shop: json.shop,
        rseq: json.rseq,
        opts: json.opts,
      },
      modifiedTime: json.exportedAt || new Date().toISOString(),
    };
  } catch (err: any) {
    console.error('Failed to restore from Google Drive:', err);
    throw err;
  }
}
