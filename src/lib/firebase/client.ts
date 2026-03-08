import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

import { getFirebasePublicConfig } from "./config";

const browserAppName = "vitchly-browser";

export function createFirebaseBrowserApp(): FirebaseApp {
  const existingApp = getApps().find((app) => app.name === browserAppName);

  if (existingApp) {
    return existingApp;
  }

  return initializeApp(getFirebasePublicConfig(), browserAppName);
}

export function getFirebaseBrowserServices() {
  const app = createFirebaseBrowserApp();

  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
  };
}
