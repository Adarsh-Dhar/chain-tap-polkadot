import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useState } from "react"

function truncate(s: string | null, left = 6, right = 4) {
  if (!s) return "";
  if (s.length <= left + right) return s;
  return `${s.slice(0, left)}...${s.slice(-right)}`;
}

export default function ActivityLogCard() {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const contractsRes = await fetch('/api/contracts')
        const list = await contractsRes.json()
        if (!Array.isArray(list) || list.length === 0) return
        const cid = list[0].id
        const res = await fetch(`/api/rewards?contractId=${cid}`)
        const data = await res.json()
        if (!mounted) return
        setRows(data)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])
  return (
    <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 font-semibold text-sm">
            3
          </span>
          <CardTitle className="text-xl">Recent Activity Log</CardTitle>
        </div>
        <CardDescription className="mt-2">Latest transactions and token minting events</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Timestamp</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Shopify Order ID</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Customer Wallet</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-700">Tokens Minted</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Transaction Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td className="px-4 py-3 text-sm text-muted-foreground" colSpan={5}>Loading activity...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-4 py-3 text-sm text-muted-foreground" colSpan={5}>No activity yet</td></tr>
              ) : rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 font-mono text-xs">{new Date(row.createdAt).toISOString().replace('T',' ').slice(0,19)}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{row.orderId}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{truncate(row.wallet)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-full font-semibold text-xs">
                      {row.amount ? row.amount : '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{truncate(row.txHash, 10, 6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
