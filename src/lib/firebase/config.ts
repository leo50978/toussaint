export type FirebasePublicConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const firebasePublicDefaults = {
  apiKey: "AIzaSyANkKGDkA-t8Ijce4SNwqNcL8ArP9jPVqE",
  authDomain: "allin-f65df.firebaseapp.com",
  projectId: "allin-f65df",
  storageBucket: "allin-f65df.firebasestorage.app",
  messagingSenderId: "955152530266",
  appId: "1:955152530266:web:19952842f4559b10af9163",
} satisfies FirebasePublicConfig;

const firebasePublicEnv = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const firebasePublicEnvMap = {
  apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
  authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  storageBucket: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
} as const;

function getPublicEnvOrDefault(key: keyof typeof firebasePublicEnvMap): string {
  const value = firebasePublicEnv[key];

  return value || firebasePublicDefaults[key] || "";
}

export function getFirebasePublicConfig(): FirebasePublicConfig {
  return {
    apiKey: getPublicEnvOrDefault("apiKey"),
    authDomain: getPublicEnvOrDefault("authDomain"),
    projectId: getPublicEnvOrDefault("projectId"),
    storageBucket: getPublicEnvOrDefault("storageBucket"),
    messagingSenderId: getPublicEnvOrDefault("messagingSenderId"),
    appId: getPublicEnvOrDefault("appId"),
  };
}

export function getFirebasePublicConfigStatus() {
  const keys = Object.keys(firebasePublicEnvMap) as Array<
    keyof typeof firebasePublicEnvMap
  >;

  const overrides = keys.filter((key) => Boolean(firebasePublicEnv[key]));

  return {
    overrides,
    usingFallbackDefaults: overrides.length !== keys.length,
  };
}

export function getResolvedFirebaseStorageBucket(): string {
  return process.env.FIREBASE_STORAGE_BUCKET || getFirebasePublicConfig().storageBucket || "";
}
