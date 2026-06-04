import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import {
  getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// Storage: tam çözünürlüklü orijinaller users/{uid}/{placeId}/{photoId}'e yüklenir
// (Blaze plan). Thumbnail RTDB'de kalır. Senkron/yükleme yalnız giriş sonrası.

// ============================================================
// Gezi-Pro Firebase (proje: gezi-pro-97d0d, RTDB: europe-west1).
// apiKey istemci tarafıdır (gizli değil); asıl güvenlik RTDB kurallarında.
// ============================================================
const firebaseConfig = {
  apiKey:            "AIzaSyAWgmFxia8r8dc-Cp_pVZoqgoPucJ-mCmc",
  authDomain:        "gezi-pro-97d0d.firebaseapp.com",
  databaseURL:       "https://gezi-pro-97d0d-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "gezi-pro-97d0d",
  storageBucket:     "gezi-pro-97d0d.firebasestorage.app",
  messagingSenderId: "287923478001",
  appId:             "1:287923478001:web:6352f575b4a99487593850",
  measurementId:     "G-C80KJJQ927"
};

const app = initializeApp(firebaseConfig);
export const db      = getDatabase(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);

// Oturum cihazda kalsın (reload sonrası giriş sürsün) — best-effort.
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Placeholder mı? (UI'da uyarı göstermek için login kullanır.)
export const isConfigured = !firebaseConfig.apiKey.startsWith('PLACEHOLDER');

export function getFirebaseErrorMessage(error) {
  const msgs = {
    'auth/email-already-in-use':   'Bu e-posta zaten kayıtlı',
    'auth/invalid-email':          'Geçersiz e-posta adresi',
    'auth/weak-password':          'Şifre en az 6 karakter olmalı',
    'auth/user-not-found':         'Kullanıcı bulunamadı',
    'auth/wrong-password':         'Yanlış şifre',
    'auth/invalid-credential':     'E-posta veya şifre hatalı',
    'auth/network-request-failed': 'İnternet bağlantısı yok',
    'auth/too-many-requests':      'Çok fazla hatalı giriş. Lütfen bekle.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
                                   'Firebase config eksik (placeholder). js/firebase-config.js doldur.',
  };
  return msgs[error.code] || `Hata: ${error.code}`;
}

export const registerUser      = (email, password) => createUserWithEmailAndPassword(auth, email, password);
export const loginUser         = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logoutUser        = ()                 => signOut(auth);
export const sendPasswordReset = (email)            => sendPasswordResetEmail(auth, email);
export const onAuthChange      = (cb)               => onAuthStateChanged(auth, cb);
