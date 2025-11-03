"use client"

import PageHeader from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowUpRight, ArrowDownLeft, Zap } from "lucide-react"

const activities = [
  {
    id: 1,
    type: "reward_issued",
    user: "Sarah Chen",
    description: "Issued 500 loyalty points",
    timestamp: "2 minutes ago",
    icon: ArrowUpRight,
    color: "text-green-500",
  },
  {
    id: 2,
    type: "bridge_transfer",
    user: "Marcus Johnson",
    description: "Converted to blockchain rewards",
    timestamp: "15 minutes ago",
    icon: Zap,
    color: "text-blue-500",
  },
  {
    id: 3,
    type: "reward_redeemed",
    user: "Alex Rivera",
    description: "Redeemed 1000 points for discount",
    timestamp: "1 hour ago",
    icon: ArrowDownLeft,
    color: "text-orange-500",
  },
  {
    id: 4,
    type: "sync_complete",
    user: "System",
    description: "Daily rewards sync completed",
    timestamp: "3 hours ago",
    icon: Zap,
    color: "text-purple-500",
  },
]

export default function ActivityPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader title="Activity" description="Real-time updates from your loyalty bridge" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activities.map((activity) => {
                const Icon = activity.icon
                return (
                  <div key={activity.id} className="flex items-center gap-4 pb-4 border-b last:border-0 last:pb-0">
                    <div className={`rounded-full p-2 bg-secondary ${activity.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{activity.user}</p>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{activity.timestamp}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
