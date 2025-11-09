import { prisma } from "./prisma"

export interface ShopifySessionData {
  id: number
  shop: string
  accessToken: string
  scope: string
  expiresAt: Date | null
  associatedUserId: bigint | null
  associatedUserEmail: string | null
  isOnline: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Get Shopify session for a shop
 */
export async function getShopifySession(shop: string): Promise<ShopifySessionData | null> {
  console.error("🔍 getShopifySession called for shop:", shop)
  try {
    const session = await prisma.shopifySession.findUnique({
      where: { shop },
    })

    console.error("Database query result:", session ? "SESSION FOUND" : "NO SESSION FOUND")
    
    if (!session) {
      console.error("⚠️  No session found in database for shop:", shop)
      return null
    }

    console.error("Session details:", {
      id: session.id,
      shop: session.shop,
      isOnline: session.isOnline,
      expiresAt: session.expiresAt,
      hasAccessToken: !!session.accessToken,
    })

    // Check if online token is expired
    if (session.isOnline && session.expiresAt && session.expiresAt < new Date()) {
      console.error("⚠️  Token is EXPIRED for shop:", shop)
      console.error("Expires At:", session.expiresAt)
      console.error("Current Time:", new Date())
      return null
    }

    console.error("✅ Valid session found for shop:", shop)
    return session
  } catch (error) {
    console.error("❌ ERROR fetching Shopify session:", error)
    console.error("Error details:", error instanceof Error ? error.stack : String(error))
    return null
  }
}

/**
 * Check if a session's token is expired
 */
export function isTokenExpired(session: ShopifySessionData | null): boolean {
  if (!session) {
    return true
  }

  // Offline tokens don't expire
  if (!session.isOnline) {
    return false
  }

  // Online tokens expire
  if (!session.expiresAt) {
    return false // No expiry set, assume valid
  }

  return session.expiresAt < new Date()
}

/**
 * Get valid access token for a shop
 * Returns null if no valid token exists
 */
export async function getAccessToken(shop: string): Promise<string | null> {
  // Force output to stderr immediately
  process.stderr.write("🔍 ========== getAccessToken CALLED ==========\n")
  process.stderr.write(`Shop: ${shop}\n`)
  process.stderr.write(`Timestamp: ${new Date().toISOString()}\n`)
  process.stderr.write("==============================================\n")
  
  console.error("🔍 ========== getAccessToken CALLED ==========")
  console.error("Shop:", shop)
  console.error("Timestamp:", new Date().toISOString())
  console.error("==============================================")
  
  const session = await getShopifySession(shop)
  
  if (!session) {
    console.error("❌ ========== NO SESSION FOUND ==========")
    console.error("Shop:", shop)
    console.error("Reason: Session does not exist in database")
    console.error("Action: User needs to authenticate")
    console.error("=========================================")
    return null
  }
  
  if (isTokenExpired(session)) {
    console.error("❌ ========== TOKEN EXPIRED ==========")
    console.error("Shop:", shop)
    console.error("Session ID:", session.id)
    console.error("Expires At:", session.expiresAt)
    console.error("Current Time:", new Date())
    console.error("Is Online:", session.isOnline)
    console.error("Action: User needs to re-authenticate")
    console.error("======================================")
    return null
  }
  
  console.error("✅ ========== ACCESS TOKEN RETRIEVED SUCCESSFULLY ==========")
  console.error("Shop:", shop)
  console.error("Session ID:", session.id)
  console.error("Access Token:", session.accessToken)
  console.error("Token Length:", session.accessToken.length)
  console.error("Expires At:", session.expiresAt)
  console.error("Is Expired:", isTokenExpired(session))
  console.error("Scope:", session.scope)
  console.error("Is Online:", session.isOnline)
  console.error("==========================================================")
  return session.accessToken
}

/**
 * Create or update Shopify session
 */
export async function saveShopifySession(data: {
  shop: string
  accessToken: string
  scope: string
  expiresAt?: Date | null
  associatedUserId?: number | bigint | null
  associatedUserEmail?: string | null
  isOnline: boolean
}): Promise<ShopifySessionData> {
  // Convert number to BigInt if provided
  const associatedUserId = data.associatedUserId 
    ? (typeof data.associatedUserId === 'bigint' ? data.associatedUserId : BigInt(data.associatedUserId))
    : null

  const session = await prisma.shopifySession.upsert({
    where: { shop: data.shop },
    update: {
      accessToken: data.accessToken,
      scope: data.scope,
      expiresAt: data.expiresAt || null,
      associatedUserId: associatedUserId,
      associatedUserEmail: data.associatedUserEmail || null,
      isOnline: data.isOnline,
      updatedAt: new Date(),
    },
    create: {
      shop: data.shop,
      accessToken: data.accessToken,
      scope: data.scope,
      expiresAt: data.expiresAt || null,
      associatedUserId: associatedUserId,
      associatedUserEmail: data.associatedUserEmail || null,
      isOnline: data.isOnline,
    },
  })

  return session
}

/**
 * Delete Shopify session
 */
export async function deleteShopifySession(shop: string): Promise<void> {
  await prisma.shopifySession.delete({
    where: { shop },
  }).catch(() => {
    // Ignore errors if session doesn't exist
  })
}

