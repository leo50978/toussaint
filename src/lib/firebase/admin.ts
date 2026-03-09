import "server-only";

import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

import { getResolvedFirebaseStorageBucket } from "./config";

const adminAppName = "vitchly-admin";

export type FirebaseAdminServices = {
  app: App;
  auth: Auth;
  db: Firestore;
  storage: Storage;
};

function getFirebaseAdminEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const storageBucket = getResolvedFirebaseStorageBucket();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase admin env vars. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey,
    storageBucket,
  };
}

export function hasFirebaseAdminConfig(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

export function createFirebaseAdminApp(): App {
  const existingApp = getApps().find((app) => app.name === adminAppName);

  if (existingApp) {
    return existingApp;
  }

  const { projectId, clientEmail, privateKey, storageBucket } =
    getFirebaseAdminEnv();

  const serviceAccount: ServiceAccount = {
    projectId,
    clientEmail,
    privateKey,
  };

  return initializeApp(
    {
      credential: cert(serviceAccount),
      storageBucket,
    },
    adminAppName,
  );
}

export function getFirebaseAdminServices(): FirebaseAdminServices {
  const app = createFirebaseAdminApp();

  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
  };
}
