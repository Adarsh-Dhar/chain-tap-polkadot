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
            
            // If conflict found, find next available assetId that's not in our database
            if (existingWithAssetId) {
              console.warn(`⚠️  Asset ID ${assetId} is already assigned to product ${existingWithAssetId.productId} (${existingWithAssetId.title}). Finding next available asset ID...`)
              
              // Get all used assetIds from database
              const usedAssetIds = await productTokenModel.findMany({
                where: {
                  assetId: {
                    not: null,
                  },
                },
                select: {
                  assetId: true,
                },
              })
              
              const usedIdsSet = new Set(usedAssetIds.map((t: { assetId: number | null }) => t.assetId).filter((id: number | null): id is number => id !== null))
              
              // Find next available ID starting from the conflicted one
              let nextAvailableId = assetId
              let attempts = 0
              const maxAttempts = 100
              
              while (usedIdsSet.has(nextAvailableId) && attempts < maxAttempts) {
                nextAvailableId++
                attempts++
              }
              
              if (attempts >= maxAttempts) {
                console.error(`Could not find available asset ID after ${maxAttempts} attempts`)
                return NextResponse.json(
                  { 
                    error: `Asset ID ${assetId} is already assigned to another product, and could not find next available ID.`,
                    details: `Existing product: ${existingWithAssetId.title} (${existingWithAssetId.productId})`
                  },
                  { status: 409 }
                )
              }
              
              console.log(`Found next available asset ID: ${nextAvailableId} (was ${assetId})`)
              
              // Retry asset creation with the next available ID
              try {
                const retryResponse = await fetch(`${endpoint}/assets/create`, {
                  method: "POST",
                  headers: {
                    "content-Type": "application/json",
                    "x-forward-token": forwardToken,
                  },
                  body: JSON.stringify({ 
                    name, 
                    symbol,
                    assetId: nextAvailableId, // Request specific ID
                  }),
                  signal: controller.signal,
                })
                
                if (!retryResponse.ok) {
                  const errorData = await retryResponse.json().catch(() => ({}))
                  const errorMessage = errorData.message || errorData.error || `Failed to create token with ID ${nextAvailableId}: ${retryResponse.statusText}`
                  console.error("Retry forwarder error:", errorMessage)
                  
                  // If retry fails, fall back to original assetId (maybe it was created successfully)
                  console.warn(`Retry failed, using original assetId ${assetId}`)
                } else {
                  const retryData = await retryResponse.json()
                  const retryAssetId = retryData?.assetId || retryData?.id
                  if (retryAssetId) {
                    console.log(`Successfully created asset with ID ${retryAssetId} (retry)`)
                    assetId = retryAssetId
                  } else {
                    console.warn(`Retry succeeded but no assetId returned, using original ${assetId}`)
                  }
                }
              } catch (retryError) {
                console.error("Error retrying asset creation:", retryError)
                // Continue with original assetId - maybe the forwarder already created it
                console.warn(`Retry failed, using original assetId ${assetId}`)
              }
              
              // Check again after retry
              existingWithAssetId = await productTokenModel.findFirst({
                where: {
                  assetId: assetId,
                  productId: {
                    not: productMetadata.id,
                  },
                },
              })
              
              if (existingWithAssetId) {
                // Still a conflict - this shouldn't happen but handle it
                console.error(`⚠️  Still have conflict after retry. Asset ID ${assetId} is assigned to ${existingWithAssetId.productId}`)
                return NextResponse.json(
                  { 
                    error: `Asset ID ${assetId} is already assigned to another product. Please try again.`,
                    details: `Existing product: ${existingWithAssetId.title} (${existingWithAssetId.productId})`
                  },
                  { status: 409 }
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

