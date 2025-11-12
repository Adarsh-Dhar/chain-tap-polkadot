import crypto from "crypto"
import { cookies } from "next/headers"
import fs from "fs"
import path from "path"

// Read client_id from shopify.app.toml if not in env
function getClientIdFromToml(): string {
  try {
    const tomlPath = path.join(process.cwd(), "shopify.app.toml")
    if (fs.existsSync(tomlPath)) {
      const tomlContent = fs.readFileSync(tomlPath, "utf-8")
      const clientIdMatch = tomlContent.match(/client_id\s*=\s*["']([^"']+)["']/)
      if (clientIdMatch) {
        return clientIdMatch[1]
      }
    }
  } catch (error) {
    console.error("Could not read client_id from shopify.app.toml:", error)
  }
  return ""
}

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

// Prioritize TOML over environment variables
const SHOPIFY_CLIENT_ID = getClientIdFromToml() || process.env.SHOPIFY_CLIENT_ID || ""
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || ""
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || "read_products,write_products,read_orders,write_price_rules"
const APP_URL = getAppUrlFromToml() || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

/**
 * Verify installation request HMAC signature
 * Step 1: Remove hmac parameter, sort remaining params, and verify signature
 */
export function verifyInstallationRequest(queryParams: URLSearchParams, secret: string): boolean {
  const hmac = queryParams.get("hmac")
  if (!hmac) {
    return false
  }

  // Remove hmac and create sorted query string
  const params: Array<[string, string]> = []
  queryParams.forEach((value, key) => {
    if (key !== "hmac") {
      params.push([key, value])
    }
  })

  // Sort alphabetically by key
  params.sort((a, b) => a[0].localeCompare(b[0]))

  // Build query string
  const message = params.map(([key, value]) => `${key}=${value}`).join("&")

  // Compute HMAC
  const computed = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex")

  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmac))
  } catch {
    return false
  }
}

/**
 * Generate a secure random nonce for OAuth state parameter
 */
export function generateNonce(): string {
  return crypto.randomBytes(16).toString("hex")
}

/**
 * Build Shopify OAuth authorization URL
 */
export function buildAuthUrl(shop: string, redirectUri: string, state: string, isOnline: boolean = true): string {
  const scopes = SHOPIFY_SCOPES.split(",").map((s) => s.trim()).join(",")
  
  // 🔍 LOG: Application URL and Redirect URI
  console.error("🔍 ========== OAuth URL Building ==========")
  console.error("APP_URL (resolved):", APP_URL)
  console.error("process.env.APP_URL:", process.env.APP_URL || "NOT SET")
  console.error("process.env.NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL || "NOT SET")
  console.error("Redirect URI (being used):", redirectUri)
  console.error("Shop:", shop)
  console.error("Scopes:", scopes)
  console.error("Client ID (from TOML/env):", SHOPIFY_CLIENT_ID)
  const tomlClientId = getClientIdFromToml()
  console.error("Client ID source:", tomlClientId ? "TOML" : (process.env.SHOPIFY_CLIENT_ID ? "ENV" : "NONE"))
  
  const params = new URLSearchParams({
    client_id: SHOPIFY_CLIENT_ID,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  })

  if (isOnline) {
    params.append("grant_options[]", "per-user")
  }

  const authUrl = `https://${shop}/admin/oauth/authorize?${params.toString()}`
  
  // 🔍 LOG: Final OAuth URL
  console.error("Final OAuth URL:", authUrl)
  console.error("=========================================")
  
  return authUrl
}

/**
 * Validate OAuth callback request
 * Step 3: Verify HMAC, validate nonce, and validate shop domain
 */
export function validateCallback(
  queryParams: URLSearchParams,
  secret: string,
  expectedNonce: string
): { valid: boolean; shop?: string; error?: string } {
  // Verify HMAC
  if (!verifyInstallationRequest(queryParams, secret)) {
    return { valid: false, error: "Invalid HMAC signature" }
  }

  // Validate nonce
  const state = queryParams.get("state")
  if (state !== expectedNonce) {
    return { valid: false, error: "Invalid state parameter" }
  }

  // Validate shop domain
  const shop = queryParams.get("shop")
  if (!shop) {
    return { valid: false, error: "Missing shop parameter" }
  }

  if (!sanitizeShop(shop)) {
    return { valid: false, error: "Invalid shop domain format" }
  }

  return { valid: true, shop }
}

/**
 * Sanitize and validate shop hostname
 * Must match format: {shop}.myshopify.com
 */
export function sanitizeShop(shop: string): boolean {
  // Remove protocol if present
  const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")

  // Validate format: alphanumeric, hyphens, dots, ending with .myshopify.com
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/
  return shopRegex.test(cleanShop)
}

/**
 * Exchange authorization code for access token
 * Step 4: POST to /admin/oauth/access_token
 */
export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<{
  access_token: string
  scope: string
  expires_in?: number
  associated_user_scope?: string
  associated_user?: {
    id: number
    first_name: string
    last_name: string
    email: string
    email_verified: boolean
    account_owner: boolean
    locale: string
    collaborator: boolean
  }
}> {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: SHOPIFY_CLIENT_ID,
      client_secret: SHOPIFY_CLIENT_SECRET,
      code,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to exchange code for token: ${response.status} ${errorText}`)
  }

  return await response.json()
}

/**
 * Get embedded app URL from host parameter
 * host is base64-encoded and may need padding
 */
export function getEmbeddedAppUrl(host: string): string {
  // Add padding if needed (base64 padding is '=')
  let paddedHost = host
  const remainder = paddedHost.length % 4
  if (remainder !== 0) {
    paddedHost += "=".repeat(4 - remainder)
  }

  try {
    const decoded = Buffer.from(paddedHost, "base64").toString("utf-8")
    return `https://${decoded}/apps/${SHOPIFY_CLIENT_ID}/`
  } catch (error) {
    throw new Error(`Failed to decode host parameter: ${error}`)
  }
}

/**
 * Store nonce in signed cookie
 */
export async function setNonceCookie(nonce: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set("shopify_oauth_state", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  })
}

/**
 * Get nonce from signed cookie
 */
export async function getNonceCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  const nonce = cookieStore.get("shopify_oauth_state")
  return nonce?.value || null
}

/**
 * Clear nonce cookie
 */
export async function clearNonceCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete("shopify_oauth_state")
}

