import { NextRequest, NextResponse } from "next/server"
import {
  verifyInstallationRequest,
  generateNonce,
  buildAuthUrl,
  setNonceCookie,
  sanitizeShop,
} from "@/lib/shopify-oauth"
import { getShopifySession, isTokenExpired } from "@/lib/shopify-session"
import fs from "fs"
import path from "path"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Read application_url from shopify.app.toml if not in env
function getAppUrlFromToml(): string {
  try {
    const tomlPath = path.join(process.cwd(), "shopify.app.toml")
    if (fs.existsSync(tomlPath)) {
      const tomlContent = fs.readFileSync(tomlPath, "utf-8")
      const appUrlMatch = tomlContent.match(/application_url\s*=\s*["']([^"']+)["']/)
      if (appUrlMatch) {
        return appUrlMatch[1]
      }
    }
  } catch (error) {
    console.error("Could not read application_url from shopify.app.toml:", error)
  }
  return ""
}

const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || ""
const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || getAppUrlFromToml() || "http://localhost:3000"

/**
 * OAuth Initiation Route
 * Step 1: Verify installation request
 * Step 2: Request authorization code
 */
export async function GET(req: NextRequest) {
  console.error("📥 ========== OAuth Initiation Route Called ==========")
  console.error("Timestamp:", new Date().toISOString())
  
  // 🔍 LOG: Read shopify.app.toml configuration
  try {
    const tomlPath = path.join(process.cwd(), "shopify.app.toml")
    if (fs.existsSync(tomlPath)) {
      const tomlContent = fs.readFileSync(tomlPath, "utf-8")
      console.error("🔍 ========== shopify.app.toml Configuration ==========")
      console.error(tomlContent)
      
      // Extract application_url and redirect_urls
      const appUrlMatch = tomlContent.match(/application_url\s*=\s*["']([^"']+)["']/)
      const redirectUrlsMatch = tomlContent.match(/redirect_urls\s*=\s*\[([^\]]+)\]/)
      
      if (appUrlMatch) {
        console.error("🔍 application_url from TOML:", appUrlMatch[1])
      } else {
        console.error("⚠️ application_url not found in TOML")
      }
      if (redirectUrlsMatch) {
        console.error("🔍 redirect_urls from TOML:", redirectUrlsMatch[1])
      } else {
        console.error("⚠️ redirect_urls not found in TOML")
      }
      console.error("=====================================================")
    } else {
      console.error("⚠️ shopify.app.toml file not found at:", tomlPath)
    }
  } catch (error) {
    console.error("⚠️ Could not read shopify.app.toml:", error)
  }
  
  try {
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get("shop")
    const embedded = searchParams.get("embedded")
    const hmac = searchParams.get("hmac")
    const timestamp = searchParams.get("timestamp")

    console.error("Parameters:", { shop, embedded, hasHmac: !!hmac, hasTimestamp: !!timestamp })

    // Validate shop parameter (required)
    if (!shop) {
      console.error("❌ ERROR: Missing shop parameter")
      return NextResponse.json({ error: "Missing shop parameter" }, { status: 400 })
    }

    // Validate shop domain format
    if (!sanitizeShop(shop)) {
      console.error("❌ ERROR: Invalid shop domain:", shop)
      return NextResponse.json({ error: "Invalid shop domain" }, { status: 400 })
    }

    // If HMAC and timestamp are present, this is an installation request - verify it
    if (hmac && timestamp) {
      console.error("🔐 Verifying HMAC signature...")
      const queryParams = new URL(req.url).searchParams
      if (!verifyInstallationRequest(queryParams, SHOPIFY_CLIENT_SECRET)) {
        console.error("❌ ERROR: Invalid HMAC signature")
        return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 401 })
      }
      console.error("✅ HMAC signature verified")
    }

    // Check if we already have a valid token
    console.error("🔍 Checking for existing session for shop:", shop)
    const existingSession = await getShopifySession(shop)
    console.error("Existing session:", existingSession ? "FOUND" : "NOT FOUND")
    
    if (existingSession && !isTokenExpired(existingSession)) {
      console.error("✅ Valid token exists, redirecting to app")
      // Token exists and is valid, redirect to app
      if (embedded === "1") {
        // Embedded app - redirect to embedded URL
        const host = searchParams.get("host")
        if (host) {
          const { getEmbeddedAppUrl } = await import("@/lib/shopify-oauth")
          const embeddedUrl = getEmbeddedAppUrl(host)
          return NextResponse.redirect(embeddedUrl)
        }
      }
      // Non-embedded or no host - redirect to app root
      const redirectUrl = new URL(APP_URL)
      redirectUrl.searchParams.set("shop", shop)
      const host = searchParams.get("host")
      if (host) {
        redirectUrl.searchParams.set("host", host)
      }
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Handle iframe escape for embedded apps
    if (embedded === "1") {
      // Render iframe escape page
      const host = searchParams.get("host") || ""
      const redirectUri = `${APP_URL}/api/auth?${searchParams.toString()}`
      
      return new NextResponse(
        `<!DOCTYPE html>
<html>
<head>
  <title>Redirecting...</title>
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
</head>
<body>
  <script>
    if (window.appBridge) {
      window.appBridge.dispatch(
        window.appBridge.actions.Redirect.create({
          url: "${redirectUri}"
        })
      );
    } else {
      window.location.href = "${redirectUri}";
    }
  </script>
</body>
</html>`,
        {
          headers: {
            "Content-Type": "text/html",
          },
        }
      )
    }

    // Step 2: Generate nonce and redirect to Shopify OAuth
    const nonce = generateNonce()
    await setNonceCookie(nonce)

    const redirectUri = `${APP_URL}/api/auth/callback`
    
    // 🔍 LOG: Configuration values before building auth URL
    console.error("🔍 ========== OAuth Configuration ==========")
    console.error("APP_URL (from env):", APP_URL)
    console.error("process.env.APP_URL:", process.env.APP_URL || "NOT SET")
    console.error("process.env.NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL || "NOT SET")
    console.error("Redirect URI (constructed):", redirectUri)
    console.error("Shop:", shop)
    console.error("============================================")
    
    const authUrl = buildAuthUrl(shop, redirectUri, nonce, true) // true = online token

    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error("OAuth initiation error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

