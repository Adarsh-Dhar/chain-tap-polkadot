import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params
    const body = await req.json()
    const { name, symbol, productMetadata } = body

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 })
    }

    // Get phalaEndpoint from contracts
    let prisma
    try {
      const prismaModule = await import("@/lib/prisma")
      prisma = prismaModule.prisma
    } catch (prismaError) {
      console.error("Error importing Prisma:", prismaError)
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      )
    }

    const contracts = await prisma.contract.findMany({
      orderBy: { id: "asc" },
      take: 1,
    })

    const phalaEndpoint = contracts[0]?.phalaEndpoint || process.env.PHAT_ENDPOINT_URL
    if (!phalaEndpoint) {
      return NextResponse.json(
        { error: "Phala endpoint not configured. Please set up a contract first." },
        { status: 400 }
      )
    }

    const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""
    if (!forwardToken) {
      return NextResponse.json(
        { error: "Forward token not configured" },
        { status: 500 }
      )
    }

    const endpoint = phalaEndpoint.replace(/\/$/, "")
    const response = await fetch(`${endpoint}/assets/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forward-token": forwardToken,
      },
      body: JSON.stringify({ name, symbol }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorData.error || `Failed to create token: ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    const assetId = data?.assetId || data?.id // Try both assetId and id

    // Store product metadata in database (non-blocking)
    if (productMetadata && assetId) {
      try {
        // Safely check if productToken model exists in Prisma client
        const productTokenModel = (prisma as any).productToken
        if (productTokenModel) {
          await productTokenModel.upsert({
            where: { productId: productMetadata.id },
            create: {
              productId: productMetadata.id,
              assetId: assetId,
              title: productMetadata.title,
              handle: productMetadata.handle,
              description: productMetadata.description || null,
              vendor: productMetadata.vendor || null,
              productType: productMetadata.productType || null,
              tags: productMetadata.tags || [],
              metadata: productMetadata as any, // Store full metadata as JSON
            },
            update: {
              assetId: assetId,
              title: productMetadata.title,
              handle: productMetadata.handle,
              description: productMetadata.description || null,
              vendor: productMetadata.vendor || null,
              productType: productMetadata.productType || null,
              tags: productMetadata.tags || [],
              metadata: productMetadata as any,
            },
          })
          console.log("Product metadata stored successfully")
        } else {
          console.warn("ProductToken model not available in Prisma client. Run 'prisma generate' to update.")
        }
      } catch (dbError) {
        console.error("Error storing product metadata:", dbError)
        // Log the full error for debugging
        if (dbError instanceof Error) {
          console.error("Error message:", dbError.message)
          console.error("Error stack:", dbError.stack)
        }
        // Don't fail the request if DB storage fails
      }
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error("Error creating token:", error)
    // Log more details about the error
    if (error instanceof Error) {
      console.error("Error message:", error.message)
      console.error("Error stack:", error.stack)
    }
    return NextResponse.json(
      { 
        error: "Failed to create token",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}

