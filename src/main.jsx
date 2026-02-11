import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registerSW } from 'virtual:pwa-register'
import './index.css';

//import { registerServiceWorkers } from "./registerSW";
//import { subscribeUserToPush } from "./lib/pushClient";

//window.subscribeUserToPush = subscribeUserToPush;   
// import { registerSW } from 'virtual:pwa-register';
// registerSW({ immediate: true })

// if ("serviceWorker" in navigator) {
//   window.addEventListener("load", async () => {
//     const reg = await navigator.serviceWorker.register("/sw.js");
//     console.log("SW registered:", reg.scope);
//   });
// }
// if ("serviceWorker" in navigator) {
//   window.addEventListener("load", () => {
//     navigator.serviceWorker
//       .register("/firebase-messaging-sw.js", {
//     scope: "/",
//   })
//       .then((registration) => {
//         console.log("FCM Service Worker registered:", registration.scope);
//       })
//       .catch((err) => {
//         console.error("FCM SW registration failed:", err);
//       });
//   });
// }

// This registers the Service Worker automatically
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New content available. Reload?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
})

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

