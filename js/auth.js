/* Gezi Pro — Auth + Firebase senkron akışı (SPRINT SONU İÇİN KORUNUYOR).
   app.js'de AUTH_ENABLED=true olduğunda DİNAMİK import edilir; böylece
   Firebase yalnızca auth açıkken yüklenir, normal boot firebase'siz kalır.

   Etkinleştirmek için: js/app.js -> AUTH_ENABLED = true
   Ön koşul: js/firebase-config.js içine gerçek config girilmiş olmalı. */

import { onAuthChange, logoutUser } from './firebase-config.js';
import { setCurrentUser, hydrateFromLocal, startSync, stopSync } from './db.js';
import { setState } from './state.js';
import { LoginView } from './views/login.js';
import { navigate, showAppUI, hideAppUI, teardownView, initialView } from './app.js';

export function startAuthFlow() {
  document.getElementById('logoutBtn')?.addEventListener('click', () => logoutUser());

  onAuthChange(async user => {
    if (user) {
      setCurrentUser(user.uid);
      setState('user', { uid: user.uid, email: user.email });
      await hydrateFromLocal();   // offline-first: önce localden render
      startSync();
      showAppUI();
      navigate(initialView());
    } else {
      stopSync();
      setState('user', null);
      teardownView();
      hideAppUI();
      renderLogin();
    }
  });
}

function renderLogin() {
  const app  = document.getElementById('app');
  const view = new LoginView();
  app.innerHTML = view.render();
  view.afterRender();
}
