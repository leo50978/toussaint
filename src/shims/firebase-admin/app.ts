export type ServiceAccount = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

export type App = {
  name: string;
  options: unknown;
  isStub: true;
};

const apps: App[] = [];

export function cert(serviceAccount: ServiceAccount) {
  return {
    serviceAccount,
    isStub: true,
  };
}

export function getApps(): App[] {
  return apps;
}

export function initializeApp(options?: unknown, name = "[DEFAULT]"): App {
  const existingApp = apps.find((app) => app.name === name);

  if (existingApp) {
    return existingApp;
  }

  const app: App = {
    name,
    options,
    isStub: true,
  };

  apps.push(app);

  return app;
}
