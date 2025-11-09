"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import PageHeader from "@/components/page-header"
import StatusIndicator from "@/components/status-indicator"
import EndpointCard from "@/components/endpoint-card"
import TokenConfigCard from "@/components/token-config-card"
import ActivityLogCard from "@/components/activity-log-card"
import { ConnectWalletButton } from "@/components/connect-wallet-button"

export default function DashboardPage() {
  const searchParams = useSearchParams()

  useEffect(() => {
    async function logAllData() {
      console.log("🚀 ========== DASHBOARD MOUNTED ==========")
      console.log("Timestamp:", new Date().toISOString())
      console.log("Current URL:", typeof window !== "undefined" ? window.location.href : "N/A")
      
      // Get shop from URL if available
      const shopFromUrl = searchParams.get("shop")
      console.log("Shop from URL:", shopFromUrl || "Not provided")

      try {
        // Fetch all Shopify sessions
        const sessionUrl = shopFromUrl 
          ? `/api/shop/session?shop=${encodeURIComponent(shopFromUrl)}`
          : "/api/shop/session"
        
        console.log("📡 Fetching session data from:", sessionUrl)
        const sessionResponse = await fetch(sessionUrl)
        
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json()
          console.log("✅ ========== SHOPIFY SESSION DATA ==========")
          console.log(JSON.stringify(sessionData, null, 2))
          console.log("=============================================")
        } else {
          const errorData = await sessionResponse.json()
          console.error("❌ Failed to fetch session data:", errorData)
        }
      } catch (error) {
        console.error("❌ Error fetching session data:", error)
      }

      // Log environment info
      console.log("🌍 ========== ENVIRONMENT INFO ==========")
      console.log("User Agent:", typeof window !== "undefined" ? window.navigator.userAgent : "N/A")
      console.log("Window Location:", typeof window !== "undefined" ? {
        origin: window.location.origin,
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      } : "N/A")
      console.log("=========================================")

      // Log URL parameters
      if (typeof window !== "undefined") {
        const urlParams = new URL(window.location.href).searchParams
        const allParams: Record<string, string> = {}
        urlParams.forEach((value, key) => {
          allParams[key] = value
        })
        console.log("📋 ========== URL PARAMETERS ==========")
        console.log(JSON.stringify(allParams, null, 2))
        console.log("=======================================")
      }

      console.log("✅ ========== DASHBOARD DATA LOGGING COMPLETE ==========")
    }

    // Small delay to ensure component is fully mounted
    const timer = setTimeout(() => {
      logAllData()
    }, 100)

    return () => clearTimeout(timer)
  }, [searchParams])

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
