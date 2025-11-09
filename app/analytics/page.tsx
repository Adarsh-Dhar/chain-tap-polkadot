"use client"

import PageHeader from "@/components/page-header"
import { ConnectWalletButton } from "@/components/connect-wallet-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const stats = [
  { label: "Total Rewards Issued", value: "125,420", change: "+12%" },
  { label: "Active Users", value: "3,847", change: "+5%" },
  { label: "Conversion Rate", value: "42.5%", change: "+2.3%" },
  { label: "Avg. Redemption Value", value: "$156", change: "+8%" },
]

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader 
        title="Analytics" 
        description="Performance metrics and insights"
        actions={<ConnectWalletButton />}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-green-500 mt-2">{stat.change} from last month</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Coming Soon</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Advanced analytics charts and detailed performance breakdowns will be available in the next update.
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
