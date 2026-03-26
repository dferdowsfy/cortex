import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js Middleware to handle CORS for the Complyze Chrome Extension.
 *
 * This middleware intercepts requests to /api/ and adds the necessary
 * Access-Control-Allow-* headers to prevent the browser from blocking
 * requests from the extension's origin (chrome-extension://...).
 */
export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");

  // Handle preflight requests (OPTIONS)
  if (request.method === "OPTIONS") {
    const response = new NextResponse(null, { status: 204 });

    // Allow the Chrome extension origin
    if (origin?.startsWith("chrome-extension://")) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    } else {
      // Fallback for production domains if origin is missing or different
      response.headers.set("Access-Control-Allow-Origin", "*");
    }

    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Organization-ID, X-User-UID, X-User-Email, x-installation-id"
    );
    response.headers.set("Access-Control-Max-Age", "86400");

    return response;
  }

  // Handle actual requests
  const response = NextResponse.next();

  if (origin?.startsWith("chrome-extension://")) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  } else {
    response.headers.set("Access-Control-Allow-Origin", "*");
  }

  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Organization-ID, X-User-UID, X-User-Email, x-installation-id"
  );

  return response;
}

/**
 * Configure the middleware to only run on API routes.
 */
export const config = {
  matcher: "/api/:path*",
};
