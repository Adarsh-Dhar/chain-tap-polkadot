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
    const { name, symbol } = body

    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    if (!symbol || typeof symbol !== "string") {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 })
    }

    // Get phalaEndpoint from contracts
    const { prisma } = await import("@/lib/prisma")
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
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error("Error creating token:", error)
    return NextResponse.json(
      { error: "Failed to create token" },
      { status: 500 }
    )
  }
}

