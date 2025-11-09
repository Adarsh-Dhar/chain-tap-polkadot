"use client"

import PageHeader from "@/components/page-header"
import { ConnectWalletButton } from "@/components/connect-wallet-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useMemo, useRef, useState } from "react"

type Reward = {
  id: number
  contractId: number
  orderId: string
  wallet?: string | null
  amount?: string | null
  assetId?: number | null
  status: string
  txHash?: string | null
  createdAt: string
}

function truncate(s: string | null | undefined, left = 8, right = 6) {
  if (!s) return "—"
  if (s.length <= left + right) return s
  return `${s.slice(0, left)}...${s.slice(-right)}`
}

export default function ActivityPage() {
  const [contractId, setContractId] = useState<number | null>(null)
  const [rows, setRows] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const statusColor = useMemo(() => ({
    pending: "bg-amber-100 text-amber-700",
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-rose-100 text-rose-700",
  } as Record<string, string>), [])

  useEffect(() => {
    const url = new URL(window.location.href)
    const cid = url.searchParams.get("contractId")
    let id: number | null = null
    if (cid) {
      const parsed = parseInt(cid, 10)
      id = isNaN(parsed) ? null : parsed
    } else {
      const stored = localStorage.getItem("contractId")
      if (stored) {
        const parsed = parseInt(stored, 10)
        id = isNaN(parsed) ? null : parsed
      }
    }
    setContractId(id)
  }, [])

  useEffect(() => {
    async function load() {
      if (!contractId) { setLoading(false); return }
      try {
        const res = await fetch(`/api/rewards?contractId=${contractId}`, { cache: "no-store" })
        const data = await res.json()
        setRows(Array.isArray(data) ? data : [])
      } finally {
        setLoading(false)
      }
    }
    load()
    if (timerRef.current) clearInterval(timerRef.current)
    if (contractId) {
      timerRef.current = setInterval(load, 12000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [contractId])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader 
        title="Activity" 
        description="Recent mints and webhook processing"
        actions={<ConnectWalletButton />}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left">Time</th>
                    <th className="px-4 py-2 text-left">Order ID</th>
                    <th className="px-4 py-2 text-left">Wallet</th>
                    <th className="px-4 py-2 text-left">Amount</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Tx Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td className="px-4 py-3 text-muted-foreground" colSpan={6}>Loading...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td className="px-4 py-3 text-muted-foreground" colSpan={6}>No activity yet</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-mono text-xs">{new Date(r.createdAt).toISOString().replace('T',' ').slice(0,19)}</td>
                      <td className="px-4 py-3">{r.orderId}</td>
                      <td className="px-4 py-3 font-mono">{truncate(r.wallet)}</td>
                      <td className="px-4 py-3">{r.amount ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${statusColor[r.status] || "bg-gray-100 text-gray-700"}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">{truncate(r.txHash)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
