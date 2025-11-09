import PageHeader from "@/components/page-header"
import StatusIndicator from "@/components/status-indicator"
import EndpointCard from "@/components/endpoint-card"
import TokenConfigCard from "@/components/token-config-card"
import ActivityLogCard from "@/components/activity-log-card"
import { ConnectWalletButton } from "@/components/connect-wallet-button"

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader 
        title="Dashboard" 
        description="Manage your Web2-to-Web3 loyalty bridge"
        actions={<ConnectWalletButton />}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <StatusIndicator />
        </div>

        <div className="space-y-6">
          <EndpointCard />
          <TokenConfigCard />
          <ActivityLogCard />
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-center text-sm text-muted-foreground">Secure connection powered by Polkadot Asset Hub</p>
        </div>
      </div>
    </div>
  )
}
