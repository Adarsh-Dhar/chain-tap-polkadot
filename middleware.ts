import { NextRequest, NextResponse } from "next/server"

/**
 * Next.js Middleware for auto-authentication
 * Redirects to OAuth flow if shop parameter is present but no auth is in progress
 * Note: Token validation happens in /api/auth route (Node.js runtime) since middleware runs in Edge runtime
 */
export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Handle CORS for VIP token API (called from local-fest-website)
  // This MUST be checked BEFORE the general API skip check
  if (pathname.startsWith("/api/vip/token")) {
    // Handle preflight OPTIONS request
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400", // 24 hours
        },
      })
    }
    // For other methods, use rewrite to intercept the response
    // This ensures CORS headers are added even if the route handler crashes
    const response = NextResponse.next({
      request: {
        headers: new Headers(request.headers),
      },
    })
    // Set CORS headers on the response - these will be preserved even on errors
    response.headers.set("Access-Control-Allow-Origin", "*")
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type")
    response.headers.set("Vary", "Origin")
    return response
  }

  // Skip middleware for:
  // - Auth routes (they handle their own logic)
  // - API routes (they handle auth themselves)
  // - Static files
  // - Public assets
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|css|js|woff|woff2|ttf|eot)$/)
  ) {
    return NextResponse.next()
  }

  // Extract shop parameter from query string
  const shop = searchParams.get("shop")

  // If no shop parameter, allow request to proceed
  // (some pages might not require shop context)
  if (!shop) {
    return NextResponse.next()
  }

  // Basic shop format validation (full validation happens in /api/auth)
  const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")
  if (!cleanShop.includes(".myshopify.com")) {
    return NextResponse.next() // Invalid format, but let the page handle it
  }

  // If we're on the root page with a shop param, redirect to /auth
  // This handles initial app installation/authentication
  // Once authenticated, sessions are stored in DB and shop param is not needed
  if (pathname === "/") {
    // Redirect to /auth page which will:
    // 1. Show loading/redirecting UI
    // 2. Redirect to /api/auth which handles token check and OAuth flow
    const authUrl = new URL("/auth", request.url)
    authUrl.searchParams.set("shop", cleanShop)
    
    // Preserve other query params that might be needed for OAuth
    const embedded = searchParams.get("embedded")
    const host = searchParams.get("host")
    const hmac = searchParams.get("hmac")
    const timestamp = searchParams.get("timestamp")
    
    if (embedded) authUrl.searchParams.set("embedded", embedded)
    if (host) authUrl.searchParams.set("host", host)
    if (hmac) authUrl.searchParams.set("hmac", hmac)
    if (timestamp) authUrl.searchParams.set("timestamp", timestamp)

    return NextResponse.redirect(authUrl)
  }

  // For other pages with shop param, allow them to proceed
  // (they might need shop context for their own logic)
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     * 
     * IMPORTANT: We explicitly include /api/vip/token routes for CORS
     * The pattern matches all paths, and we handle VIP token routes specially
     */
    "/((?!api/auth|auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)).*)",
  ],
}

