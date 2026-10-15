import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  loginWithGoogle,
  loginAsGuest,
  logoutUser,
  pushLedgerToCloud,
  pullLedgerFromCloud,
} from '../firebase/syncService';
import {
  subscribeDriveStatus,
  getDriveStatus,
  connectGoogleDrive,
  disconnectGoogleDrive,
  syncLedgerToGoogleDrive,
  fetchLedgerFromGoogleDrive,
  setDriveAutoSync,
  DriveSyncStatus,
} from '../services/googleDriveService';
import { AppState } from '../utils/ledgerCore';
import { ICON } from './Icons';
import { sound } from '../utils/soundEffects';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  appState: AppState;
  onStateRestored: (newState: Partial<AppState>) => void;
  onSyncSuccess: (timestamp: string) => void;
  showToast: (msg: string) => void;
  onTriggerConfetti?: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  lastSyncedAt,
  isSyncing,
  appState,
  onStateRestored,
  onSyncSuccess,
  showToast,
  onTriggerConfetti,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showDriveDetails, setShowDriveDetails] = useState(false);
  const [driveStatus, setDriveStatus] = useState<DriveSyncStatus>(getDriveStatus());
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState<{
    state: Partial<AppState>;
    modifiedTime: string;
    source: 'firestore' | 'drive';
  } | null>(null);

  useEffect(() => {
    const unsub = subscribeDriveStatus((status) => {
      setDriveStatus(status);
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    sound.playPop();
    setLoading(true);
    setErrorMsg('');
    try {
      const { user } = await loginWithGoogle();
      showToast(`Welcome, ${user.displayName || user.email || 'Friend'}! ☁️`);

      // Immediately pull or push
      const remote = await pullLedgerFromCloud(user.uid);
      if (remote && remote.state && Object.keys(remote.state).length > 0) {
        onStateRestored(remote.state);
        showToast('Restored financial ledger from cloud! ✨');
      } else {
        const ts = await pushLedgerToCloud(user.uid, appState);
        onSyncSuccess(ts);
        showToast('Backed up active ledger to cloud! 🚀');
      }

      if (onTriggerConfetti) onTriggerConfetti();
      sound.playCelebration();
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Sign-in popup closed. Tap again whenever you are ready.');
      } else if (err.code === 'auth/popup-blocked') {
        setErrorMsg('Browser blocked the sign-in popup. Allow popups or use Guest Cloud Sync below.');
      } else {
        setErrorMsg(err.message || 'Google sign-in could not be completed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    sound.playPop();
    setLoading(true);
    setErrorMsg('');
    try {
      const user = await loginAsGuest();
      showToast('Guest Cloud Sync enabled! ☁️');
      const ts = await pushLedgerToCloud(user.uid, appState);
      onSyncSuccess(ts);
      if (onTriggerConfetti) onTriggerConfetti();
      sound.playCelebration();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not initialize guest cloud sync.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSyncNow = async () => {
    if (!currentUser) return;
    sound.playPop();
    setLoading(true);
    setErrorMsg('');
    try {
      const ts = await pushLedgerToCloud(currentUser.uid, appState);
      onSyncSuccess(ts);
      if (driveStatus.isConnected) {
        await syncLedgerToGoogleDrive(appState).catch(() => {});
      }
      showToast('Saved to cloud just now! 🚀');
      sound.playCelebration();
      if (onTriggerConfetti) onTriggerConfetti();
    } catch (err: any) {
      setErrorMsg('Failed to sync. Please check internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateCloudRestore = async () => {
    if (!currentUser) return;
    sound.playPop();
    setLoading(true);
    try {
      const remote = await pullLedgerFromCloud(currentUser.uid);
      if (remote && remote.state && Object.keys(remote.state).length > 0) {
        setRestoreCandidate({
          state: remote.state,
          modifiedTime: remote.updatedAt,
          source: 'firestore',
        });
        setShowRestoreConfirm(true);
      } else {
        showToast('No prior cloud backup found on this account.');
      }
    } catch (err: any) {
      setErrorMsg('Failed to check cloud backup.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmRestore = () => {
    if (!restoreCandidate) return;
    sound.playCelebration();
    onStateRestored(restoreCandidate.state);
    setShowRestoreConfirm(false);
    setRestoreCandidate(null);
    showToast('Ledger restored successfully! ✨');
    if (onTriggerConfetti) onTriggerConfetti();
    onClose();
  };

  const handleConnectDrive = async () => {
    sound.playPop();
    setLoading(true);
    setErrorMsg('');
    try {
      const { accessToken } = await connectGoogleDrive();
      showToast('Google Drive linked! 📁');
      await syncLedgerToGoogleDrive(appState, accessToken);
      sound.playCelebration();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    sound.playWhoosh();
    setLoading(true);
    try {
      disconnectGoogleDrive();
      await logoutUser();
      showToast('Signed out. Local offline mode active.');
      onClose();
    } catch (err: any) {
      setErrorMsg('Sign out failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="backdrop"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !showRestoreConfirm) {
          sound.playWhoosh();
          onClose();
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-sync-title"
        tabIndex={-1}
        style={{
          maxWidth: '460px',
          width: '92%',
          margin: '0 auto',
          borderRadius: '24px',
          maxHeight: '90dvh',
          overflowY: 'auto',
          boxShadow: '0 20px 40px rgba(0,0,0,0.22)',
        }}
      >
        {/* Header */}
        <div className="sheet-h" style={{ padding: '18px 20px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>☁️</span>
            <div>
              <h2 id="cloud-sync-title" style={{ fontSize: '18px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                PennyPop Cloud Sync
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
                Keep your budget &amp; receipts backed up everywhere
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={() => {
              sound.playWhoosh();
              onClose();
            }}
          >
            {ICON.x}
          </button>
        </div>

        <div className="sheet-b" style={{ padding: '16px 20px 24px' }}>
          {errorMsg && (
            <div className="alertbox" style={{ marginBottom: '16px', borderRadius: '14px' }}>
              {ICON.alert}
              <div>
                <b>Sync Alert</b>
                <span>{errorMsg}</span>
              </div>
            </div>
          )}

          {currentUser ? (
            /* Logged-In Account Card */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  background: 'var(--surface-2)',
                  padding: '14px 16px',
                  borderRadius: '18px',
                  border: '1px solid var(--line)',
                }}
              >
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt="User"
                    style={{ width: '46px', height: '46px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent)' }}
                  />
                ) : (
                  <div
                    style={{
                      width: '46px',
                      height: '46px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--accent), #FF8B94)',
                      color: '#fff',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 800,
                      fontSize: '19px',
                      boxShadow: '0 4px 10px rgba(59, 47, 214, 0.25)',
                    }}
                  >
                    {(currentUser.displayName || currentUser.email || 'P').charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <b style={{ fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {currentUser.displayName || (currentUser.isAnonymous ? 'Guest Account' : 'PennyPop Member')}
                    </b>
                    <span className="pill pos" style={{ fontSize: '10.5px', padding: '2px 8px' }}>
                      Active
                    </span>
                  </div>
                  <span style={{ fontSize: '12.5px', color: 'var(--muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentUser.email || (currentUser.isAnonymous ? 'Temporary Cloud ID' : currentUser.uid.slice(0, 12))}
                  </span>
                </div>
              </div>

              {/* Status Box */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  background: 'var(--surface)',
                  border: '1.5px solid var(--ok)',
                  boxShadow: '0 4px 14px rgba(14, 122, 79, 0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: isSyncing ? 'var(--warn)' : 'var(--ok)',
                        boxShadow: `0 0 10px ${isSyncing ? 'var(--warn)' : 'var(--ok)'}`,
                        display: 'inline-block',
                      }}
                    />
                    <b style={{ fontSize: '14px' }}>
                      {isSyncing ? 'Syncing changes…' : 'Everything Synced to Cloud'}
                    </b>
                  </div>
                  <span className="num" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    Real-time
                  </span>
                </div>

                <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: 'var(--muted)', lineHeight: '1.45' }}>
                  Changes are auto-saved securely. Your finances stay in sync across tabs and devices.
                </p>

                {lastSyncedAt && (
                  <div className="num" style={{ fontSize: '11.5px', color: 'var(--muted)', marginTop: '8px' }}>
                    Last saved: {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    type="button"
                    className="btn sm"
                    style={{ flex: 1, background: 'var(--accent)', color: '#fff' }}
                    disabled={loading || isSyncing}
                    onClick={handleManualSyncNow}
                  >
                    {isSyncing ? 'Saving…' : 'Sync Now ⚡'}
                  </button>
                  <button
                    type="button"
                    className="btn sm out"
                    style={{ flex: 1 }}
                    disabled={loading || isSyncing}
                    onClick={handleInitiateCloudRestore}
                  >
                    Restore Backup
                  </button>
                </div>
              </div>

              {/* Optional Google Drive section */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '14px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowDriveDetails((prev) => !prev)}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 0,
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>📁</span>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Google Drive Secondary Backup</span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--accent)' }}>
                    {showDriveDetails ? 'Hide' : driveStatus.isConnected ? 'Connected' : 'Setup'}
                  </span>
                </button>

                {showDriveDetails && (
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--line)' }}>
                    {driveStatus.isConnected ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--ok)' }}>
                          ✓ Connected to Google Drive
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn sm"
                            disabled={loading || driveStatus.isSyncing}
                            onClick={() => syncLedgerToGoogleDrive(appState)}
                          >
                            Export to Drive
                          </button>
                          {driveStatus.webViewLink && (
                            <a
                              href={driveStatus.webViewLink}
                              target="_blank"
                              rel="noreferrer"
                              className="btn sm out"
                              style={{ textDecoration: 'none', display: 'grid', placeItems: 'center' }}
                            >
                              View File
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--muted)' }}>
                          Store an additional JSON file directly inside your personal Google Drive storage.
                        </p>
                        <button
                          type="button"
                          className="btn sm out"
                          disabled={loading}
                          onClick={handleConnectDrive}
                        >
                          Connect Google Drive
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sign Out Button */}
              <button
                type="button"
                className="btn out sm"
                style={{ width: '100%', marginTop: '4px' }}
                disabled={loading}
                onClick={handleSignOut}
              >
                Sign Out (Use Offline Only)
              </button>
            </div>
          ) : (
            /* Signed-Out Simple Options */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '22px',
                  background: 'linear-gradient(135deg, var(--accent-soft), #FFEFC7)',
                  color: 'var(--accent)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '32px',
                  margin: '4px auto 8px',
                  boxShadow: '0 6px 16px rgba(59, 47, 214, 0.14)',
                }}
              >
                🪙
              </div>

              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                  Never Lose Your Money Trail
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5' }}>
                  Save your budgets, receipts, and smart ML predictions to the cloud so you can access them anywhere.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                {/* 1-Click Google Sign In */}
                <button
                  type="button"
                  className="btn"
                  style={{
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    border: '1.5px solid var(--line)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                    height: '50px',
                    fontWeight: 700,
                    borderRadius: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                  }}
                  disabled={loading}
                  onClick={handleGoogleLogin}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>

                {/* Instant Guest Cloud Sync */}
                <button
                  type="button"
                  className="btn"
                  style={{
                    background: 'var(--accent-soft)',
                    color: 'var(--on-accent-soft)',
                    height: '48px',
                    fontWeight: 700,
                    borderRadius: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                  disabled={loading}
                  onClick={handleGuestLogin}
                >
                  <span>⚡ Instant Cloud Sync (No Sign-In Required)</span>
                </button>
              </div>

              <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: 'var(--muted)' }}>
                🔒 100% private. Data is isolated to your secure user session.
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Restore Confirmation Alert */}
      <AnimatePresence>
        {showRestoreConfirm && (
          <div
            className="backdrop"
            style={{ zIndex: 1200 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowRestoreConfirm(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="sheet"
              role="alertdialog"
              aria-modal="true"
              style={{ maxWidth: '420px', margin: 'auto', padding: '24px', borderRadius: '22px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <span style={{ fontSize: '30px' }}>⚠️</span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Restore Cloud Backup?
                </h3>
              </div>
              <p style={{ fontSize: '13.5px', color: 'var(--ink)', lineHeight: '1.5', margin: '0 0 16px' }}>
                This will replace your current entries with the backup from{' '}
                <b>{restoreCandidate?.modifiedTime ? new Date(restoreCandidate.modifiedTime).toLocaleString() : 'the cloud'}</b>.
              </p>
              <div className="btnrow" style={{ justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn out sm"
                  onClick={() => setShowRestoreConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn sm"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                  onClick={handleConfirmRestore}
                >
                  Confirm &amp; Restore
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
