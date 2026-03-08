import { existsSync } from "fs";
import { join } from "path";

import type { NextConfig } from "next";

function hasInstalledModule(moduleName: string) {
  return existsSync(join(process.cwd(), "node_modules", moduleName, "package.json"));
}

const nextConfig: NextConfig = {
  webpack: (config) => {
    const hasFirebaseClientSdk = hasInstalledModule("firebase");
    const hasFirebaseAdminSdk = hasInstalledModule("firebase-admin");

    config.resolve ??= {};
    config.resolve.alias ??= {};

    if (!hasFirebaseClientSdk) {
      config.resolve.alias["firebase/app"] = join(
        process.cwd(),
        "src/shims/firebase/app.ts",
      );
      config.resolve.alias["firebase/auth"] = join(
        process.cwd(),
        "src/shims/firebase/auth.ts",
      );
      config.resolve.alias["firebase/firestore"] = join(
        process.cwd(),
        "src/shims/firebase/firestore.ts",
      );
      config.resolve.alias["firebase/storage"] = join(
        process.cwd(),
        "src/shims/firebase/storage.ts",
      );
    } else {
      delete config.resolve.alias["firebase/app"];
      delete config.resolve.alias["firebase/auth"];
      delete config.resolve.alias["firebase/firestore"];
      delete config.resolve.alias["firebase/storage"];
    }

    if (!hasFirebaseAdminSdk) {
      config.resolve.alias["firebase-admin/app"] = join(
        process.cwd(),
        "src/shims/firebase-admin/app.ts",
      );
      config.resolve.alias["firebase-admin/auth"] = join(
        process.cwd(),
        "src/shims/firebase-admin/auth.ts",
      );
      config.resolve.alias["firebase-admin/firestore"] = join(
        process.cwd(),
        "src/shims/firebase-admin/firestore.ts",
      );
      config.resolve.alias["firebase-admin/storage"] = join(
        process.cwd(),
        "src/shims/firebase-admin/storage.ts",
      );
    } else {
      delete config.resolve.alias["firebase-admin/app"];
      delete config.resolve.alias["firebase-admin/auth"];
      delete config.resolve.alias["firebase-admin/firestore"];
      delete config.resolve.alias["firebase-admin/storage"];
    }

    return config;
  },
};

export default nextConfig;
