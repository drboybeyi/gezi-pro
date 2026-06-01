import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import {
  getAuth, onAuthStateChanged,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// ============================================================
// TODO(config): Gezi-Pro Firebase Console > Project Settings'ten
// alınan gerçek değerlerle değiştir. Aşağısı PLACEHOLDER'dır;
// Auth/DB/Storage bu değerlerle çalışmaz.
//   - databaseURL  : Realtime DB  europe-west1
//   - storageBucket: Storage      europe-west3 (bucket adı yeterli;
//                    bölge bucket oluşturulurken seçilir)
// ============================================================
const firebaseConfig = {
  apiKey:            "PLACEHOLDER_API_KEY",
  authDomain:        "gezi-pro.firebaseapp.com",
  databaseURL:       "https://gezi-pro-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "gezi-pro",
  storageBucket:     "gezi-pro.firebasestorage.app",
  messagingSenderId: "PLACEHOLDER_SENDER_ID",
  appId:             "PLACEHOLDER_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db      = getDatabase(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);

// Placeholder mı? (UI'da uyarı göstermek için app.js kullanır.)
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
