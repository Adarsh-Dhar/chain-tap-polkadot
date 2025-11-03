import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { phalaEndpoint, merchantName } = body

    if (!phalaEndpoint || typeof phalaEndpoint !== "string") {
      return NextResponse.json({ error: "phalaEndpoint is required" }, { status: 400 })
    }

    const contract = await prisma.contract.create({
      data: {
        phalaEndpoint,
        merchantName: merchantName || null,
      },
    })

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

