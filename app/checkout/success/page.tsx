"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Loader2, CheckCircle2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    // Check if this is a successful checkout
    const orderId = searchParams.get("order_id")
    const checkoutToken = searchParams.get("checkout_token")
    const orderNumber = searchParams.get("order_number")
    
    console.log("✅ Checkout success page - Order details:", {
      orderId,
      checkoutToken,
      orderNumber,
    })

    // Countdown before redirect
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          router.push("/products")
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [searchParams, router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center justify-center py-12 px-6">
          <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Order Successful!</h1>
          <p className="text-muted-foreground text-center mb-6">
            Thank you for your purchase. Your tokens will be minted shortly.
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Redirecting to products in {countdown} seconds...</span>
          </div>
          <button
            onClick={() => router.push("/products")}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Go to products now
          </button>
        </CardContent>
      </Card>
    </div>
  )
}

