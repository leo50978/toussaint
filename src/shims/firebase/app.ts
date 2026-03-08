type FirebaseOptions = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

export type FirebaseApp = {
  name: string;
  options: FirebaseOptions;
  isStub: true;
};

const apps: FirebaseApp[] = [];

export function getApps(): FirebaseApp[] {
  return apps;
}

export function initializeApp(
  options: FirebaseOptions,
  name = "[DEFAULT]",
): FirebaseApp {
  const existingApp = apps.find((app) => app.name === name);

  if (existingApp) {
    return existingApp;
  }

  const app: FirebaseApp = {
    name,
    options,
    isStub: true,
  };

  apps.push(app);

  return app;
}
