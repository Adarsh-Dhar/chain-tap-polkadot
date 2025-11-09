"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import PageHeader from "@/components/page-header"
import { Spinner } from "@/components/ui/spinner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle2 } from "lucide-react"

export default function AuthPage() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "redirecting" | "error" | "success">("loading")
  const [error, setError] = useState<string | null>(null)
  const [shop, setShop] = useState<string | null>(null)

  useEffect(() => {
    // Small delay to ensure component is fully mounted and searchParams are available
    const timer = setTimeout(() => {
      // Try to get params from useSearchParams first, fallback to window.location
      let shopParam = searchParams.get("shop")
      let embedded = searchParams.get("embedded")
      let host = searchParams.get("host")
      let hmac = searchParams.get("hmac")
      let timestamp = searchParams.get("timestamp")

      // Fallback: read from window.location if useSearchParams didn't work
      if (!shopParam && typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search)
        shopParam = shopParam || urlParams.get("shop")
        embedded = embedded || urlParams.get("embedded")
        host = host || urlParams.get("host")
        hmac = hmac || urlParams.get("hmac")
        timestamp = timestamp || urlParams.get("timestamp")
      }

      console.log("🔍 [AUTH PAGE] URL Parameters:", {
        shop: shopParam,
        embedded,
        host,
        hasHmac: !!hmac,
        hasTimestamp: !!timestamp,
        fullUrl: typeof window !== "undefined" ? window.location.href : "N/A",
        searchParamsAvailable: !!searchParams
      })

      if (!shopParam) {
        console.error("❌ [AUTH PAGE] Missing shop parameter")
        setStatus("error")
        setError("Missing shop parameter. Please provide a valid Shopify store domain.")
        return
      }

      // Validate shop format (basic check)
      const cleanShop = shopParam.replace(/^https?:\/\//, "").replace(/\/$/, "")
      if (!cleanShop.includes(".myshopify.com")) {
        setStatus("error")
        setError("Invalid shop domain format. Please provide a valid Shopify store (e.g., example.myshopify.com).")
        return
      }

      setShop(cleanShop)

      // Build redirect URL to /api/auth with all parameters
      const authUrl = new URL("/api/auth", window.location.origin)
      authUrl.searchParams.set("shop", cleanShop)
      if (embedded) authUrl.searchParams.set("embedded", embedded)
      if (host) authUrl.searchParams.set("host", host)
      if (hmac) authUrl.searchParams.set("hmac", hmac)
      if (timestamp) authUrl.searchParams.set("timestamp", timestamp)

      console.log("🚀 [AUTH PAGE] Redirecting to:", authUrl.toString())

      // Small delay to show loading state, then redirect
      setStatus("redirecting")
      setTimeout(() => {
        console.log("🔄 [AUTH PAGE] Executing redirect now...")
        window.location.href = authUrl.toString()
      }, 500)
    }, 100) // Small delay to ensure searchParams are available

    return () => clearTimeout(timer)
  }, [searchParams])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader 
        title="Shopify Authentication" 
        description="Connecting to your Shopify store"
      />

      <div className="max-w-2xl mx-auto px-6 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Authenticating with Shopify</CardTitle>
            <CardDescription>
              {shop ? `Connecting to ${shop}` : "Preparing authentication..."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === "loading" && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Spinner className="size-8 text-primary" />
                <p className="text-sm text-muted-foreground">Initializing authentication...</p>
              </div>
            )}

            {status === "redirecting" && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Spinner className="size-8 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Redirecting to Shopify to authorize access...
                </p>
                {shop && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Store: <span className="font-mono">{shop}</span>
                  </p>
                )}
              </div>
            )}

            {status === "error" && (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Authentication Error</AlertTitle>
                  <AlertDescription>
                    {error}
                    {typeof window !== "undefined" && (
                      <div className="mt-2 text-xs">
                        Current URL: <code className="bg-muted px-1 rounded">{window.location.href}</code>
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Or enter shop manually:</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="example.myshopify.com"
                      className="flex-1 px-3 py-2 border rounded-md"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const input = e.currentTarget as HTMLInputElement
                          const shopValue = input.value.trim()
                          if (shopValue) {
                            const authUrl = new URL("/api/auth", window.location.origin)
                            authUrl.searchParams.set("shop", shopValue)
                            setStatus("redirecting")
                            setTimeout(() => {
                              window.location.href = authUrl.toString()
                            }, 300)
                          }
                        }
                      }}
                    />
                    <Button
                      onClick={(e) => {
                        const input = e.currentTarget.previousElementSibling as HTMLInputElement
                        const shopValue = input?.value.trim()
                        if (shopValue) {
                          const authUrl = new URL("/api/auth", window.location.origin)
                          authUrl.searchParams.set("shop", shopValue)
                          setStatus("redirecting")
                          setTimeout(() => {
                            window.location.href = authUrl.toString()
                          }, 300)
                        }
                      }}
                    >
                      Connect
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => window.location.href = "/"}
                  >
                    Go to Dashboard
                  </Button>
                  {shop && (
                    <Button
                      onClick={() => {
                        const authUrl = new URL("/api/auth", window.location.origin)
                        authUrl.searchParams.set("shop", shop)
                        const embedded = searchParams.get("embedded")
                        const host = searchParams.get("host")
                        if (embedded) authUrl.searchParams.set("embedded", embedded)
                        if (host) authUrl.searchParams.set("host", host)
                        setStatus("redirecting")
                        setTimeout(() => {
                          window.location.href = authUrl.toString()
                        }, 300)
                      }}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            )}

            {status === "success" && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Authentication Successful</AlertTitle>
                <AlertDescription>
                  You will be redirected to the app shortly...
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            This process is secure and handled by Shopify's OAuth system.
          </p>
        </div>
      </div>
    </div>
  )
}

