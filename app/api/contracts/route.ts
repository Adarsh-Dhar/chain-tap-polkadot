import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { phalaEndpoint, merchantName, tokensPerOrder, webhookUrl, signerAddress } = body

    if (!phalaEndpoint || typeof phalaEndpoint !== "string") {
      return NextResponse.json({ error: "phalaEndpoint is required" }, { status: 400 })
    }

    const contract = await prisma.contract.create({
      data: ({
        phalaEndpoint,
        merchantName: merchantName || null,
        tokensPerOrder: typeof tokensPerOrder === "number" ? tokensPerOrder : null,
        webhookUrl: webhookUrl || null,
        signerAddress: signerAddress || null,
      } as any),
    })

    // Auto-create Asset on forwarder (best-effort)
    try {
      const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""
      if (phalaEndpoint && forwardToken) {
        const name = merchantName ? `${merchantName} Loyalty` : "Loyalty Token"
        const symbol = merchantName ? merchantName.replace(/[^A-Za-z]/g, "").slice(0, 6).toUpperCase() || "LOYAL" : "LOYAL"
        const resp = await fetch(`${phalaEndpoint.replace(/\/$/, "")}/assets/create`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forward-token": forwardToken },
          body: JSON.stringify({ name, symbol })
        })
        if (resp.ok) {
          const json = await resp.json()
          const updated = await prisma.contract.update({
            where: { id: contract.id },
            data: ({ assetId: json.assetId ?? null, signerAddress: json.signerAddress ?? null } as any),
          })
          return NextResponse.json(updated, { status: 201 })
        }
      }
    } catch (e) {
      console.warn("Auto asset creation failed:", (e as Error).message)
    }

    return NextResponse.json(contract, { status: 201 })
  } catch (error) {
    console.error("Error creating contract:", error)
    return NextResponse.json({ error: "Failed to create contract" }, { status: 500 })
  }
}

export async function GET() {
  try {
    const contracts = await prisma.contract.findMany({
      orderBy: {
        id: "asc",
      },
    })

    return NextResponse.json(contracts)
  } catch (error) {
    console.error("Error fetching contracts:", error)
    return NextResponse.json({ error: "Failed to fetch contracts" }, { status: 500 })
  }
}

