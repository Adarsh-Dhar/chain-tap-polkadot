import { NextRequest, NextResponse } from "next/server"
import {
  validateCallback,
  exchangeCodeForToken,
  getNonceCookie,
  clearNonceCookie,
  getEmbeddedAppUrl,
  sanitizeShop,
} from "@/lib/shopify-oauth"
import { saveShopifySession } from "@/lib/shopify-session"
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
 * OAuth Callback Route
 * Step 3: Validate authorization code
 * Step 4: Get an access token
 * Step 5: Redirect to your app's UI
 */
export async function GET(req: NextRequest) {
  console.log("📥 OAuth Callback Route Called")
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get("code")
    const shop = searchParams.get("shop")
    const host = searchParams.get("host")
    const embedded = searchParams.get("embedded")

    console.log("📥 OAuth Callback - Parameters:", { code: code ? "present" : "missing", shop, host, embedded })
    
    // 🔍 LOG: Check if client secret is set
    console.error("🔍 SHOPIFY_CLIENT_SECRET:", SHOPIFY_CLIENT_SECRET ? `${SHOPIFY_CLIENT_SECRET.substring(0, 10)}...` : "NOT SET")

    // Get nonce from cookie
    const expectedNonce = await getNonceCookie()
    console.log("📥 OAuth Callback - Nonce:", expectedNonce ? "present" : "missing")
    if (!expectedNonce) {
      return NextResponse.json({ error: "Missing or expired state parameter" }, { status: 400 })
    }

    // Step 3: Validate callback
    const queryParams = new URL(req.url).searchParams
    console.error("🔍 Validating callback with HMAC...")
    const validation = validateCallback(queryParams, SHOPIFY_CLIENT_SECRET, expectedNonce)
    console.error("🔍 Validation result:", validation.valid ? "VALID" : `INVALID: ${validation.error}`)

    if (!validation.valid || !validation.shop) {
      await clearNonceCookie()
      return NextResponse.json({ error: validation.error || "Invalid callback" }, { status: 400 })
    }

    if (!code) {
      await clearNonceCookie()
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 })
    }

    // Step 4: Exchange code for access token
    console.log("🔄 Exchanging authorization code for access token...")
    let tokenData
    try {
      tokenData = await exchangeCodeForToken(validation.shop, code)
      console.log("✅ Token exchange successful")
    } catch (error) {
      await clearNonceCookie()
      console.error("❌ Token exchange error:", error)
      return NextResponse.json(
        { error: "Failed to exchange code for token", details: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      )
    }

    // Log access token (for debugging) - using console.error for better visibility
    console.error("🔑 ========== ACCESS TOKEN RECEIVED ==========")
    console.error("Shop:", validation.shop)
    console.error("Access Token:", tokenData.access_token)
    console.error("Scope:", tokenData.scope)
    console.error("Expires In:", tokenData.expires_in, "seconds")
    console.error("Is Online:", true)
    console.error("Associated User ID:", tokenData.associated_user?.id || null)
    console.error("Associated User Email:", tokenData.associated_user?.email || null)
    console.error("=============================================")

    // Calculate expiry date for online tokens
    let expiresAt: Date | null = null
    if (tokenData.expires_in) {
      expiresAt = new Date(Date.now() + tokenData.expires_in * 1000)
    }

    // Step 5: Store session in database
    console.log("💾 Saving session to database...")
    const session = await saveShopifySession({
      shop: validation.shop,
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
      expiresAt,
      associatedUserId: tokenData.associated_user?.id || null,
      associatedUserEmail: tokenData.associated_user?.email || null,
      isOnline: true, // We're using online tokens
    })

    console.error("💾 ========== ACCESS TOKEN SAVED TO DATABASE ==========")
    console.error("Shop:", validation.shop)
    console.error("Session ID:", session.id)
    console.error("Access Token:", session.accessToken)
    console.error("Expires At:", session.expiresAt)
    console.error("Scope:", session.scope)
    console.error("=====================================================")

    // Clear nonce cookie
    await clearNonceCookie()

    // Step 6: Redirect to app UI
    if (embedded !== "1" && host) {
      // Embedded app - redirect to embedded URL
      try {
        const embeddedUrl = getEmbeddedAppUrl(host)
        return NextResponse.redirect(embeddedUrl)
      } catch (error) {
        console.error("Failed to get embedded URL:", error)
        // Fall through to non-embedded redirect
      }
    }

    // Non-embedded or fallback - redirect to app root (without shop param to avoid middleware loop)
    const redirectUrl = new URL("/", req.url)
    // Don't add shop param - session is already in database, no need to pass it
    return NextResponse.redirect(redirectUrl.toString())
  } catch (error) {
    console.error("OAuth callback error:", error)
    await clearNonceCookie()
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

