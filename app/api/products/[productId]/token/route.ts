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

    // Check if token already exists for this product
    if (productMetadata) {
      try {
        const productTokenModel = (prisma as any).productToken
        if (productTokenModel) {
          const existingToken = await productTokenModel.findUnique({
            where: { productId: productMetadata.id },
          })
          
          if (existingToken && existingToken.assetId) {
            return NextResponse.json(
              { 
                error: "Token already exists for this product",
                assetId: existingToken.assetId,
                existing: true
              },
              { status: 409 } // Conflict status code
            )
          }
        }
      } catch (checkError) {
        console.error("Error checking for existing token:", checkError)
        // Continue with creation if check fails
      }
    }

    const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""
    if (!forwardToken) {
      return NextResponse.json(
        { error: "Forward token not configured" },
        { status: 500 }
      )
    }

    const endpoint = phalaEndpoint.replace(/\/$/, "")
    
    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 120 second timeout
    
    try {
      const response = await fetch(`${endpoint}/assets/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forward-token": forwardToken,
        },
        body: JSON.stringify({ name, symbol }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.message || errorData.error || `Failed to create token: ${response.statusText}`
        console.error("Forwarder error:", errorMessage)
        return NextResponse.json(
          { error: errorMessage },
          { status: response.status }
        )
      }

      const data = await response.json()
      // Forwarder returns { status: 'success', assetId: id, signerAddress: ... }
      let assetId = data?.assetId || data?.id // Try both assetId and id
      
      if (!assetId) {
        console.error("No assetId in response:", data)
        return NextResponse.json(
          { error: "Token creation succeeded but no asset ID returned" },
          { status: 500 }
        )
      }

      // Store product metadata in database (REQUIRED - don't make it non-blocking)
      if (productMetadata && assetId) {
        try {
          // Safely check if productToken model exists in Prisma client
          const productTokenModel = (prisma as any).productToken
          if (productTokenModel) {
            // Check if this assetId is already assigned to a different product
            let existingWithAssetId = await productTokenModel.findFirst({
              where: {
                assetId: assetId,
                productId: {
                  not: productMetadata.id, // Different product
                },
              },
            })
            
            // If conflict found, create a new asset (without specifying ID) to get the current nextAssetId
            if (existingWithAssetId) {
              console.warn(`⚠️  Asset ID ${assetId} is already assigned to product ${existingWithAssetId.productId} (${existingWithAssetId.title}). Creating new asset with current nextAssetId...`)
              
              // Create a new asset without specifying ID - forwarder will use current nextAssetId
              try {
                const retryController = new AbortController()
                const retryTimeoutId = setTimeout(() => retryController.abort(), 120000)
                
                const retryResponse = await fetch(`${endpoint}/assets/create`, {
                  method: "POST",
                  headers: {
                    "content-Type": "application/json",
                    "x-forward-token": forwardToken,
                  },
                  body: JSON.stringify({ 
                    name, 
                    symbol,
                    // Don't specify assetId - let forwarder use current nextAssetId
                  }),
                  signal: retryController.signal,
                })
                
                clearTimeout(retryTimeoutId)
                
                if (!retryResponse.ok) {
                  const errorData = await retryResponse.json().catch(() => ({}))
                  const errorMessage = errorData.message || errorData.error || `Failed to create new token: ${retryResponse.statusText}`
                  console.error("Retry forwarder error:", errorMessage)
                  return NextResponse.json(
                    { 
                      error: `Asset ID ${assetId} conflict detected, and failed to create new asset: ${errorMessage}`,
                      details: `Existing product: ${existingWithAssetId.title} (${existingWithAssetId.productId})`
                    },
                    { status: 500 }
                  )
                }
                
                const retryData = await retryResponse.json()
                const retryAssetId = retryData?.assetId || retryData?.id
                
                if (!retryAssetId) {
                  console.error("Retry succeeded but no assetId returned")
                  return NextResponse.json(
                    { 
                      error: `Asset ID ${assetId} conflict detected, and new asset creation returned no ID.`,
                      details: `Existing product: ${existingWithAssetId.title} (${existingWithAssetId.productId})`
                    },
                    { status: 500 }
                  )
                }
                
                // Check if the new assetId also conflicts (shouldn't happen, but check anyway)
                const newConflict = await productTokenModel.findFirst({
                  where: {
                    assetId: retryAssetId,
                    productId: {
                      not: productMetadata.id,
                    },
                  },
                })
                
                if (newConflict) {
                  console.error(`⚠️  New asset ID ${retryAssetId} also conflicts with product ${newConflict.productId}`)
                  // This is very unlikely - the chain's nextAssetId should have advanced
                  // But if it happens, we'll use it anyway and let the unique constraint handle it
                  console.warn(`Using conflicted asset ID ${retryAssetId} - database constraint will prevent duplicate`)
                }
                
                console.log(`Successfully created new asset with ID ${retryAssetId} (was ${assetId})`)
                assetId = retryAssetId
              } catch (retryError) {
                console.error("Error retrying asset creation:", retryError)
                return NextResponse.json(
                  { 
                    error: `Asset ID ${assetId} conflict detected, and failed to create new asset: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`,
                    details: `Existing product: ${existingWithAssetId.title} (${existingWithAssetId.productId})`
                  },
                  { status: 500 }
                )
              }
            }
            
            console.log(`Storing product token: productId=${productMetadata.id}, assetId=${assetId}`)
            const result = await productTokenModel.upsert({
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
            console.log("Product metadata stored successfully:", result)
          } else {
            console.warn("ProductToken model not available in Prisma client. Run 'prisma generate' to update.")
            // This is a critical error - we should fail if we can't store
            return NextResponse.json(
              { error: "Database model not available. Please run 'prisma generate'." },
              { status: 500 }
            )
          }
        } catch (dbError) {
          console.error("Error storing product metadata:", dbError)
          // Log the full error for debugging
          if (dbError instanceof Error) {
            console.error("Error message:", dbError.message)
            console.error("Error stack:", dbError.stack)
          }
          // This is critical - fail if we can't store the token
          return NextResponse.json(
            { 
              error: "Token created but failed to store in database",
              details: dbError instanceof Error ? dbError.message : "Unknown error"
            },
            { status: 500 }
          )
        }
      } else {
        console.warn("Missing productMetadata or assetId - cannot store in database")
      }

      return NextResponse.json({ assetId, ...data }, { status: 201 })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error("Token creation request timed out after 120 seconds")
        return NextResponse.json(
          { 
            error: "Token creation timed out. The forwarder may be taking too long to create the asset.",
            details: "Please check the forwarder logs and try again later."
          },
          { status: 504 } // Gateway Timeout
        )
      }
      
      console.error("Error calling forwarder:", fetchError)
      throw fetchError // Re-throw to be caught by outer catch
    }
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

