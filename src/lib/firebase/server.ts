import "server-only";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";

import { getFirebasePublicConfig } from "./config";

const serverAppName = "vitchly-server";

export function createFirebaseServerApp(): FirebaseApp {
  const existingApp = getApps().find((app) => app.name === serverAppName);

  if (existingApp) {
    return existingApp;
  }

  return initializeApp(getFirebasePublicConfig(), serverAppName);
}
