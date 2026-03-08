import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  OWNER_SESSION_COOKIE,
  createOwnerSessionToken,
  getOwnerSessionCookieOptions,
  inspectOwnerSessionToken,
} from "@/lib/auth/owner-session";

const OWNER_LOGIN_PAGE = "/owner/login";
const OWNER_HOME_PAGE = "/owner";
const OWNER_LOGIN_API = "/api/owner/login";
const OWNER_AUTH_API_PREFIX = "/api/owner/auth/";

function requestUsesSecureTransport(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");

  return request.nextUrl.protocol === "https:" || forwardedProto === "https";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isOwnerApiRoute = pathname.startsWith("/api/owner");
  const isLoginPage = pathname === OWNER_LOGIN_PAGE;
  const isOwnerHomePage = pathname === OWNER_HOME_PAGE;
  const isLoginApi = pathname === OWNER_LOGIN_API;
  const isOwnerAuthApi = pathname.startsWith(OWNER_AUTH_API_PREFIX);

  if (isLoginApi || isOwnerAuthApi) {
    return NextResponse.next();
  }

  const token = request.cookies.get(OWNER_SESSION_COOKIE)?.value;
  const inspection = await inspectOwnerSessionToken(token);
  const isAuthenticated = inspection.isValid;
  const secureCookie = requestUsesSecureTransport(request);

  const attachRefreshedCookie = async (response: NextResponse) => {
    if (!inspection.payload || !inspection.needsRotation) {
      return response;
    }

    try {
      const refreshedToken = await createOwnerSessionToken({
        uid: inspection.payload.uid,
        email: inspection.payload.email,
      });

      response.cookies.set(
        OWNER_SESSION_COOKIE,
        refreshedToken,
        getOwnerSessionCookieOptions(secureCookie),
      );
    } catch {
      return response;
    }

    return response;
  };

  if (isLoginPage) {
    if (!isAuthenticated) {
      return NextResponse.next();
    }

    return attachRefreshedCookie(NextResponse.redirect(new URL(OWNER_HOME_PAGE, request.url)));
  }

  if (isOwnerHomePage) {
    return attachRefreshedCookie(NextResponse.next());
  }

  if (isAuthenticated) {
    return attachRefreshedCookie(NextResponse.next());
  }

  if (isOwnerApiRoute) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const ownerUrl = new URL(OWNER_HOME_PAGE, request.url);
  ownerUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(ownerUrl);
}

export const config = {
  matcher: ["/owner/:path*", "/dashboard/:path*", "/api/owner/:path*"],
};
