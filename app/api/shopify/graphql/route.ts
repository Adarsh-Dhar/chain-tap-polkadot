export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json({ message: "GraphQL endpoint is ready" })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { query } = body

    if (!query) {
      return Response.json({ error: "Query is required" }, { status: 400 })
    }

    const SHOPIFY_GRAPHQL_URL = process.env.SHOPIFY_GRAPHQL_URL || "http://localhost:3457/graphiql/graphql.json"

    const response = await fetch(SHOPIFY_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: body.variables || {},
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return Response.json(
        { error: "GraphQL request failed", details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return Response.json(data)
  } catch (error) {
    console.error("GraphQL API error:", error)
    return Response.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
