import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInAnonymously,
  ConfirmationResult,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './config';
import { AppState } from '../utils/ledgerCore';
import { setCachedDriveToken } from '../services/googleDriveService';

export interface CloudSyncStatus {
  user: User | null;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  isOnline: boolean;
}

export interface AuthUserProfile {
  uid: string;
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  provider: 'google' | 'phone' | 'anonymous';
}

// Deep clean any object so no `undefined` values ever reach Firestore
function cleanForFirestore<T>(val: T): T {
  if (val === undefined || val === null) {
    return null as any;
  }
  if (Array.isArray(val)) {
    return val.map(cleanForFirestore) as any;
  }
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as any)) {
      if (v !== undefined) {
        out[k] = cleanForFirestore(v);
      }
    }
    return out as any;
  }
  return val;
}

// Subscribe to auth state
export function subscribeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    callback(user);
    if (user) {
      saveUserProfile(user).catch((err) => {
        console.warn('Could not save user profile (non-fatal):', err);
      });
    } else {
      setCachedDriveToken(null);
    }
  });
}

// Google Sign-In with popup
export async function loginWithGoogle(): Promise<{ user: User }> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    await saveUserProfile(cred.user).catch(() => {});
    return { user: cred.user };
  } catch (err: any) {
    console.error('Google Sign-in failed:', err);
    throw err;
  }
}

// Instant Guest / Cloud ID Sign-In (no popup required, works 100% in all environments)
export async function loginAsGuest(): Promise<User> {
  try {
    const cred = await signInAnonymously(auth);
    await saveUserProfile(cred.user).catch(() => {});
    return cred.user;
  } catch (err: any) {
    console.error('Guest cloud login failed:', err);
    throw err;
  }
}

// Initialize Recaptcha for Phone Auth
export function setupRecaptcha(containerId: string): RecaptchaVerifier {
  const existing = (window as any).recaptchaVerifier;
  if (existing) {
    try {
      existing.clear();
    } catch {}
  }

  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {},
    'expired-callback': () => {
      console.warn('reCAPTCHA expired');
    },
  });
  (window as any).recaptchaVerifier = verifier;
  return verifier;
}

// Send SMS verification code to phone number
export async function sendPhoneCode(
  phoneNumber: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  try {
    return await signInWithPhoneNumber(auth, phoneNumber, verifier);
  } catch (err: any) {
    console.error('Phone sign-in code request failed:', err);
    throw err;
  }
}

// Confirm SMS code
export async function confirmPhoneCode(
  confirmationResult: ConfirmationResult,
  code: string
): Promise<User> {
  try {
    const cred = await confirmationResult.confirm(code);
    await saveUserProfile(cred.user).catch(() => {});
    return cred.user;
  } catch (err: any) {
    console.error('Phone verification failed:', err);
    throw err;
  }
}

// Sign out
export async function logoutUser(): Promise<void> {
  await signOut(auth);
  setCachedDriveToken(null);
}

// Save basic user profile document in Firestore
async function saveUserProfile(user: User) {
  const userDocPath = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    await setDoc(
      userRef,
      cleanForFirestore({
        uid: user.uid,
        email: user.email || null,
        phone: user.phoneNumber || null,
        displayName: user.displayName || (user.isAnonymous ? 'PennyPop Guest' : (user.phoneNumber || 'PennyPop User')),
        photoURL: user.photoURL || null,
        provider: user.isAnonymous ? 'anonymous' : (user.phoneNumber ? 'phone' : 'google'),
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (error) {
    console.warn('saveUserProfile notice:', error);
  }
}

function sanitizeBookForCloud(book: AppState['personal']) {
  if (!book) return { txns: [], goals: [], policy: { limit: 0, flags: [] }, monthlyTarget: 0 };
  return {
    ...book,
    txns: (book.txns || []).map((t) => {
      // Prevent exceeding Firestore document size limit if large receipt image
      if (t.receipt && t.receipt.length > 30000) {
        return { ...t, receipt: null };
      }
      return t;
    }),
  };
}

// Upload full ledger state to Firestore cloud
export async function pushLedgerToCloud(userId: string, state: AppState): Promise<string> {
  const syncDocPath = `users/${userId}/sync/main`;
  try {
    const syncRef = doc(db, 'users', userId, 'sync', 'main');
    const nowIso = new Date().toISOString();

    const payload = cleanForFirestore({
      userId,
      appName: 'PennyPop',
      personal: sanitizeBookForCloud(state.personal),
      shop: sanitizeBookForCloud(state.shop),
      rseq: state.rseq ?? 0,
      name: state.name || 'Personal Ledger',
      gstin: state.gstin || '',
      opts: state.opts || {},
      mode: state.mode || 'personal',
      ym: state.ym || '',
      updatedAt: nowIso,
      serverTime: serverTimestamp(),
    });

    await setDoc(syncRef, payload);
    return nowIso;
  } catch (error) {
    console.error('Cloud push failed:', error);
    try {
      handleFirestoreError(error, OperationType.WRITE, syncDocPath);
    } catch {}
    return new Date().toISOString();
  }
}

// Download ledger state from Firestore cloud
export async function pullLedgerFromCloud(
  userId: string
): Promise<{ state: Partial<AppState>; updatedAt: string } | null> {
  const syncDocPath = `users/${userId}/sync/main`;
  try {
    const syncRef = doc(db, 'users', userId, 'sync', 'main');
    const snap = await getDoc(syncRef);
    if (!snap.exists()) {
      return null;
    }
    const data = snap.data();
    return {
      state: {
        personal: data.personal,
        shop: data.shop,
        rseq: data.rseq,
        name: data.name,
        gstin: data.gstin,
        opts: data.opts,
        mode: data.mode,
        ym: data.ym,
      },
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
  } catch (error) {
    console.error('Cloud pull failed:', error);
    return null;
  }
}

// Real-time synchronization listener
export function subscribeCloudLedger(
  userId: string,
  onRemoteUpdate: (remoteState: Partial<AppState>, updatedAt: string) => void
): () => void {
  const syncRef = doc(db, 'users', userId, 'sync', 'main');
  return onSnapshot(
    syncRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data) {
          onRemoteUpdate(
            {
              personal: data.personal,
              shop: data.shop,
              rseq: data.rseq,
              name: data.name,
              gstin: data.gstin,
              opts: data.opts,
            },
            data.updatedAt || new Date().toISOString()
          );
        }
      }
    },
    (err) => {
      console.warn('Real-time sync listener info:', err);
    }
  );
}
