// Service worker do Firebase Cloud Messaging — corre em segundo plano e é o
// responsável por mostrar a notificação do sistema quando o telemóvel está
// bloqueado ou o jogo não está em primeiro plano. Enquanto a app está aberta
// e visível, é o "onMessage" no index.html que trata da mensagem (não este
// ficheiro) — ver comentário ao lado desse handler.
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAl7Llo-tSteCy4FqoXjfoaPiH8oaqnNSI",
  authDomain: "battle-for-monte-gordo.firebaseapp.com",
  databaseURL: "https://battle-for-monte-gordo-default-rtdb.firebaseio.com",
  projectId: "battle-for-monte-gordo",
  storageBucket: "battle-for-monte-gordo.firebasestorage.app",
  messagingSenderId: "698307143733",
  appId: "1:698307143733:web:65fe7319e088779517e97c"
});

var messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  var data = payload.notification || {};
  self.registration.showNotification(data.title || 'Battle for Monte Gordo', {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg'
  });
});

// Clicar na notificação abre o jogo (ou foca a tab já aberta, se existir).
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if ('focus' in clientList[i]) return clientList[i].focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
