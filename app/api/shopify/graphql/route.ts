import { getAccessToken } from "@/lib/shopify-session"
import { sanitizeShop } from "@/lib/shopify-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  return Response.json({ message: "GraphQL endpoint is ready" })
}

export async function POST(req: Request) {
  // Force output to stderr immediately
  process.stderr.write("🚀 ========== GRAPHQL API ROUTE CALLED ==========\n")
  process.stderr.write(`Timestamp: ${new Date().toISOString()}\n`)
  process.stderr.write(`URL: ${req.url}\n`)
  
  console.error("🚀 ========== GRAPHQL API ROUTE CALLED ==========")
  console.error("Timestamp:", new Date().toISOString())
  console.error("URL:", req.url)
  try {
    const body = await req.json()
    const { query } = body

    console.error("GraphQL Query received:", query ? "YES" : "NO")

    if (!query) {
      console.error("❌ ERROR: Query is required")
      return Response.json({ error: "Query is required" }, { status: 400 })
    }

    // Extract shop from query params or headers
    const url = new URL(req.url)
    let shop = url.searchParams.get("shop")
    
    console.error("Shop from query params:", shop || "NOT FOUND")
    
    // Fallback to header if not in query params
    if (!shop) {
      shop = req.headers.get("x-shopify-shop-domain") || ""
      console.error("Shop from header:", shop || "NOT FOUND")
    }

    // Remove protocol if present
    if (shop) {
      shop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")
      console.error("Shop after cleanup:", shop)
    }

    if (!shop) {
      console.error("❌ ERROR: Shop parameter is required")
      return Response.json({ error: "Shop parameter is required" }, { status: 400 })
    }

    // Validate shop format
    if (!sanitizeShop(shop)) {
      console.error("❌ ERROR: Invalid shop domain format:", shop)
      return Response.json({ error: "Invalid shop domain format" }, { status: 400 })
    }

    // Get access token from database
    console.error("🔍 Getting access token for shop:", shop)
    const accessToken = await getAccessToken(shop)
    if (!accessToken) {
      console.error("❌ ========== ERROR: NO ACCESS TOKEN AVAILABLE ==========")
      console.error("Shop:", shop)
      console.error("Timestamp:", new Date().toISOString())
      console.error("This means the shop has not been authenticated yet.")
      console.error("User should be redirected to:", `/api/auth?shop=${encodeURIComponent(shop)}`)
      console.error("=========================================================")
      return Response.json(
        { error: "No valid access token found. Please authenticate first.", redirect: `/api/auth?shop=${encodeURIComponent(shop)}` },
        { status: 401 }
      )
    }

    console.error("🚀 ========== USING ACCESS TOKEN FOR GRAPHQL REQUEST ==========")
    console.error("Shop:", shop)
    console.error("Access Token:", accessToken)
    console.error("Query Preview:", query.substring(0, 100) + (query.length > 100 ? "..." : ""))
    console.error("=================================================================")

    // Build shop-specific GraphQL URL
    const graphqlUrl = `https://${shop}/admin/api/2025-10/graphql.json`

    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query,
        variables: body.variables || {},
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      
      // Check if token expired (401 Unauthorized)
      if (response.status === 401) {
        return Response.json(
          { error: "Access token expired or invalid. Please re-authenticate.", redirect: `/api/auth?shop=${encodeURIComponent(shop)}` },
          { status: 401 }
        )
      }

      return Response.json(
        { error: "GraphQL request failed", details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Check for GraphQL errors that might indicate token issues
    if (data.errors) {
      const hasAuthError = data.errors.some((err: any) => 
        err.message?.includes("Unauthorized") || 
        err.message?.includes("access token") ||
        err.extensions?.code === "UNAUTHENTICATED"
      )
      
      if (hasAuthError) {
        return Response.json(
          { error: "Authentication failed. Please re-authenticate.", redirect: `/api/auth?shop=${encodeURIComponent(shop)}`, graphqlErrors: data.errors },
          { status: 401 }
        )
      }
    }

    return Response.json(data)
  } catch (error) {
    console.error("GraphQL API error:", error)
    return Response.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
