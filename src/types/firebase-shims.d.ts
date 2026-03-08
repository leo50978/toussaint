declare module "firebase/app" {
  export type FirebaseOptions = {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
  };

  export type FirebaseApp = {
    name: string;
    options?: FirebaseOptions;
    isStub?: boolean;
  };

  export function getApps(): FirebaseApp[];
  export function initializeApp(
    options: FirebaseOptions,
    name?: string,
  ): FirebaseApp;
}

declare module "firebase/auth" {
  import type { FirebaseApp } from "firebase/app";

  export type User = {
    uid: string;
    email: string | null;
    getIdToken: (forceRefresh?: boolean) => Promise<string>;
  };

  export type UserCredential = {
    user: User;
  };

  export type Auth = {
    app?: FirebaseApp;
    currentUser?: User | null;
    isStub?: boolean;
  };

  export function getAuth(app?: FirebaseApp): Auth;
  export function createUserWithEmailAndPassword(
    auth: Auth,
    email: string,
    password: string,
  ): Promise<UserCredential>;
  export function signInWithEmailAndPassword(
    auth: Auth,
    email: string,
    password: string,
  ): Promise<UserCredential>;
  export function signOut(auth: Auth): Promise<void>;
}

declare module "firebase/firestore" {
  import type { FirebaseApp } from "firebase/app";

  export function getFirestore(app?: FirebaseApp): unknown;
}

declare module "firebase/storage" {
  import type { FirebaseApp } from "firebase/app";

  export function getStorage(app?: FirebaseApp): unknown;
}

declare module "firebase-admin/app" {
  export type App = {
    name: string;
    options?: unknown;
    isStub?: boolean;
  };

  export type ServiceAccount = {
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
  };

  export function getApps(): App[];
  export function initializeApp(options?: unknown, name?: string): App;
  export function cert(serviceAccount: ServiceAccount): unknown;
}

declare module "firebase-admin/auth" {
  import type { App } from "firebase-admin/app";

  export type DecodedIdToken = {
    uid: string;
    email?: string;
  };

  export type Auth = {
    app?: App;
    isStub?: boolean;
    verifyIdToken?: (
      token: string,
      checkRevoked?: boolean,
    ) => Promise<DecodedIdToken>;
  };

  export function getAuth(app?: App): Auth;
}

declare module "firebase-admin/firestore" {
  import type { App } from "firebase-admin/app";

  export function getFirestore(app?: App): unknown;
}

declare module "firebase-admin/storage" {
  import type { App } from "firebase-admin/app";

  export function getStorage(app?: App): unknown;
}
