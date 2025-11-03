import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const ACTIVITY_DATA = [
  {
    timestamp: "2024-11-03 14:32:00",
    orderId: "#ORD-001847",
    wallet: "13...y7pA",
    tokensMinted: 100,
    txHash: "0x45a...bcf2",
  },
  {
    timestamp: "2024-11-03 13:15:22",
    orderId: "#ORD-001846",
    wallet: "1A...nQ9K",
    tokensMinted: 100,
    txHash: "0x92d...aef1",
  },
  {
    timestamp: "2024-11-03 12:08:45",
    orderId: "#ORD-001845",
    wallet: "14...mP3x",
    tokensMinted: 100,
    txHash: "0x71c...2e94",
  },
  {
    timestamp: "2024-11-03 11:42:10",
    orderId: "#ORD-001844",
    wallet: "1F...kL8M",
    tokensMinted: 100,
    txHash: "0x38b...f7c6",
  },
]

export default function ActivityLogCard() {
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
              {ACTIVITY_DATA.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-700 font-mono text-xs">{row.timestamp}</td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{row.orderId}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{row.wallet}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-full font-semibold text-xs">
                      {row.tokensMinted}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{row.txHash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
