"use client"

import PageHeader from "@/components/page-header"
import { ConnectWalletButton } from "@/components/connect-wallet-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Package, Coins, Eye, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, XCircle, Info } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useWallet } from "@/components/wallet-provider"

type Product = {
  id: string
  title: string
  handle: string
  description: string
  vendor?: string
  productType?: string
  tags?: string[]
  status?: string
  createdAt?: string
  updatedAt?: string
  totalInventory?: number
  priceRangeV2?: {
    minVariantPrice: {
      amount: string
      currencyCode: string
    }
    maxVariantPrice: {
      amount: string
      currencyCode: string
    }
  }
  images?: {
    edges: Array<{
      node: {
        id: string
        url: string
        altText?: string
        width?: number
        height?: number
      }
    }>
  }
  variants?: {
    edges: Array<{
      node: {
        id: string
        title: string
        price: string
        sku?: string
        inventoryQuantity?: number
        availableForSale?: boolean
      }
    }>
  }
}

type ProductsResponse = {
  data: {
    products: {
      edges: Array<{
        node: Product
      }>
    }
  }
  errors?: Array<{ message: string }>
}

type CartItem = {
  productId: string
  product: Product
  variantId?: string
  variant?: {
    id: string
    title: string
    price: string
    sku?: string
    inventoryQuantity?: number
    availableForSale?: boolean
  }
  quantity: number
  assetId?: number
  addedAt: Date
}

type TokenBalanceInfo = {
  assetId: number
  balance: string
  balanceFormatted: string
  exists?: boolean
  error?: string
}

const PRODUCTS_QUERY = `
  query {
    products(first: 250) {
      edges {
        node {
          id
          title
          handle
          description
          vendor
          productType
          tags
          status
          createdAt
          updatedAt
          totalInventory
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          images(first: 3) {
            edges {
              node {
                id
                url
                altText
                width
                height
              }
            }
          }
          variants(first: 5) {
            edges {
              node {
                id
                title
                price
                sku
                inventoryQuantity
                availableForSale
              }
            }
          }
        }
      }
    }
  }
`

export default function ProductsPage() {
  const { isConnected, selectedAccount } = useWallet()
  const searchParams = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creatingTokens, setCreatingTokens] = useState<Set<string>>(new Set())
  const [productTokens, setProductTokens] = useState<Map<string, number>>(new Map()) // productId -> assetId
  const [loadingBalances, setLoadingBalances] = useState<Set<string>>(new Set())
  const [tokenBalances, setTokenBalances] = useState<Map<string, TokenBalanceInfo>>(new Map())
  const [cart, setCart] = useState<CartItem[]>([])
  const [buyQuantities, setBuyQuantities] = useState<Map<string, number>>(new Map()) // productId -> quantity for buy
  const [creatingCheckout, setCreatingCheckout] = useState(false)
  const [mintingOrder, setMintingOrder] = useState(false)
  const [mintStatus, setMintStatus] = useState<{
    type: "success" | "error" | "info" | null
    message: string
  } | null>(null)
  const [totalTokens, setTotalTokens] = useState<number>(0)
  const [totalStock, setTotalStock] = useState<number>(0)

  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true)
        setError(null)

        // Get shop parameter from URL first
        let shop = searchParams.get("shop")
        console.log("🔍 [CLIENT] Shop from URL:", shop || "Not found")
        
        // If no shop in URL, try to get it from session
        if (!shop) {
          console.log("🔍 [CLIENT] No shop in URL, fetching from session...")
          try {
            const sessionResponse = await fetch("/api/shop/session")
            if (sessionResponse.ok) {
              const sessionData = await sessionResponse.json()
              
              // If we have sessions, use the most recent one
              if (sessionData.sessions && sessionData.sessions.length > 0) {
                // Get the most recent non-expired session
                const validSession = sessionData.sessions.find(
                  (s: { isExpired: boolean }) => !s.isExpired
                ) || sessionData.sessions[0]
                
                shop = validSession.shop
                console.log("✅ [CLIENT] Found shop from session:", shop)
              } else if (sessionData.shop) {
                // Single session response
                shop = sessionData.shop
                console.log("✅ [CLIENT] Found shop from session:", shop)
              }
            }
          } catch (sessionErr) {
            console.error("❌ [CLIENT] Error fetching session:", sessionErr)
          }
        }
        
        if (!shop) {
          console.error("❌ [CLIENT] ERROR: Shop parameter is missing")
          setError("No authenticated shop found. Please authenticate your Shopify store first.")
          setLoading(false)
          return
        }

        // Build GraphQL API URL with shop parameter
        const graphqlUrl = new URL("/api/shopify/graphql", window.location.origin)
        graphqlUrl.searchParams.set("shop", shop)

        console.log("🚀 [CLIENT] Calling GraphQL API:", graphqlUrl.toString())
        console.log("🚀 [CLIENT] Shop parameter:", shop)

        const response = await fetch(graphqlUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: PRODUCTS_QUERY,
          }),
        })

        console.log("📥 [CLIENT] Response status:", response.status, response.statusText)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error("❌ [CLIENT] GraphQL request failed:", {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          })
          
          // Handle 401 Unauthorized - redirect to authentication
          if (response.status === 401 && errorData.redirect) {
            console.log("🔐 [CLIENT] Authentication required, redirecting to:", errorData.redirect)
            window.location.href = errorData.redirect
            return
          }
          
          throw new Error(errorData.error || `Failed to fetch products: ${response.statusText}`)
        }

        const data: ProductsResponse = await response.json()
        console.log("✅ [CLIENT] Products fetched successfully:", data.data?.products?.edges?.length || 0, "products")

        if (data.errors && data.errors.length > 0) {
          throw new Error(data.errors[0].message)
        }

        if (data.data?.products?.edges) {
          const productList = data.data.products.edges.map((edge) => edge.node)
          setProducts(productList)
        } else {
          setProducts([])
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load products"
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [searchParams])

  useEffect(() => {
    async function fetchProductTokens() {
      try {
        // Fetch existing product tokens from database
        const response = await fetch("/api/products/tokens")
        if (response.ok) {
          const tokens = await response.json()
          const tokenMap = new Map<string, number>()
          tokens.forEach((token: { productId: string; assetId: number | null }) => {
            if (token.assetId) {
              tokenMap.set(token.productId, token.assetId)
            }
          })
          setProductTokens(tokenMap)
        }
      } catch (err) {
        // Don't fail if we can't fetch tokens
      }
    }

    fetchProductTokens()
  }, [])

  useEffect(() => {
    if (!isConnected || !selectedAccount?.address) {
      setTokenBalances((prev) => (prev.size === 0 ? prev : new Map()))
      setLoadingBalances((prev) => (prev.size === 0 ? prev : new Set()))
      return
    }

    if (products.length === 0 || productTokens.size === 0) {
      setTokenBalances((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }

    const walletAddress = selectedAccount.address
    const entries = Array.from(productTokens.entries())
    if (entries.length === 0) {
      setTokenBalances((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }

    const productMap = new Map(products.map((product) => [product.id, product]))
    let cancelled = false

    setLoadingBalances((prev) => {
      const next = new Set(prev)
      entries.forEach(([productId]) => next.add(productId))
      return next
    })

    const loadBalances = async () => {
      const nextBalances = new Map<string, TokenBalanceInfo>()

      await Promise.all(
        entries.map(async ([productId, assetId]) => {
          const product = productMap.get(productId)
          if (!product || assetId == null) {
            return
          }

          const productKey = product.id.split("/").pop() || product.id

          try {
            const response = await fetch(
              `/api/products/${encodeURIComponent(productKey)}/token/balance?address=${encodeURIComponent(walletAddress)}`
            )

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              const errorMessage =
                errorData.error || errorData.message || response.statusText || "Failed to fetch balance"

              nextBalances.set(product.id, {
                assetId,
                balance: "0",
                balanceFormatted: "0",
                exists: false,
                error: errorMessage,
              })
              return
            }

            const data = await response.json()
            nextBalances.set(product.id, {
              assetId,
              balance: data.balance ?? data.balanceFormatted ?? "0",
              balanceFormatted: data.balanceFormatted ?? data.balance ?? "0",
              exists: data.exists ?? true,
            })
          } catch (fetchError) {
            const errorMessage =
              fetchError instanceof Error ? fetchError.message : "Failed to fetch balance"

            nextBalances.set(product.id, {
              assetId,
              balance: "0",
              balanceFormatted: "0",
              exists: false,
              error: errorMessage,
            })
          }
        })
      )

      if (cancelled) {
        return
      }

      setTokenBalances(nextBalances)
      setLoadingBalances((prev) => {
        const next = new Set(prev)
        entries.forEach(([productId]) => next.delete(productId))
        return next
      })
    }

    loadBalances()

    return () => {
      cancelled = true
    }
  }, [isConnected, selectedAccount?.address, productTokens, products])

  // Calculate total stock when products change
  useEffect(() => {
    if (products.length === 0) {
      setTotalStock(0)
      return
    }

    let totalInventory = 0
    products.forEach((product) => {
      // First try to use totalInventory at product level
      if (product.totalInventory !== undefined && product.totalInventory !== null) {
        totalInventory += product.totalInventory
      } else if (product.variants?.edges && product.variants.edges.length > 0) {
        // If not available, sum up variant inventory quantities
        const variantTotal = product.variants.edges.reduce((sum, edge) => {
          const variant = edge.node
          if (variant.inventoryQuantity !== undefined && variant.inventoryQuantity !== null) {
            return sum + variant.inventoryQuantity
          }
          return sum
        }, 0)
        totalInventory += variantTotal
      }
    })

    setTotalStock(totalInventory)
    console.log("📦 [STOCK] Total stock across all products:", totalInventory, "items")
  }, [products])

  // Calculate total tokens from all balances
  useEffect(() => {
    if (!isConnected || !selectedAccount?.address) {
      setTotalTokens(0)
      return
    }

    // Sum up all token balances
    let total = 0
    tokenBalances.forEach((balanceInfo) => {
      if (balanceInfo.balanceFormatted && !balanceInfo.error) {
        const balance = parseFloat(balanceInfo.balanceFormatted)
        if (!isNaN(balance)) {
          total += balance
        }
      }
    })
    setTotalTokens(total)
  }, [tokenBalances, isConnected, selectedAccount?.address])

  // Calculate and log discount percentage (y) using total tokens and total stock
  useEffect(() => {
    if (!isConnected || !selectedAccount?.address) {
      return
    }

    // x = total tokens owned across all products
    const x = totalTokens
    
    // X = total stock/inventory across all products
    const X = totalStock

    // Skip if we don't have valid values
    if (x === 0 && X === 0) {
      return // No data yet
    }

    if (X === 0 || X === null) {
      console.log("🎯 [DISCOUNT] Cannot calculate discount: No inventory data available")
      return
    }

    // Calculate y = 0.90 * (x / X)^2
    const p = x / X // Percentage owned
    const y = 0.90 * Math.pow(p, 2) // Discount percentage
    const yPercent = (y * 100).toFixed(2) // Convert to percentage for display

    console.log("🎯 [DISCOUNT] Calculating discount percentage (y):", {
      x: `${x} tokens (total tokens owned across all products)`,
      X: `${X} inventory (total stock across all products)`,
      p: `${(p * 100).toFixed(2)}% owned`,
      y: `${yPercent}% discount`,
      formula: `y = 0.90 * (${x} / ${X})^2 = ${yPercent}%`
    })
  }, [totalTokens, totalStock, isConnected, selectedAccount?.address])

  // Auto-mint tokens when confirmationId is present and wallet is connected
  useEffect(() => {
    const confirmationId = searchParams.get("confirmationId")
    
    console.log("🔄 [AUTO-MINT] Effect triggered:", {
      confirmationId,
      isConnected,
      hasSelectedAccount: !!selectedAccount,
      walletAddress: selectedAccount?.address,
      mintingOrder,
    })
    
    // Only proceed if we have a confirmationId and haven't already processed it
    if (!confirmationId) {
      console.log("🔄 [AUTO-MINT] No confirmationId found, skipping")
      return
    }
    
    if (mintingOrder) {
      console.log("🔄 [AUTO-MINT] Already minting, skipping")
      return
    }

    // Check if wallet is connected
    if (!isConnected || !selectedAccount?.address) {
      console.log("🔄 [AUTO-MINT] Wallet not connected, showing info message")
      setMintStatus({
        type: "info",
        message: "Please connect your wallet to receive tokens for your order.",
      })
      return
    }

    // Get shop from URL or session
    async function triggerMinting() {
      try {
        console.log("🚀 [AUTO-MINT] Starting minting process...")
        setMintingOrder(true)
        setMintStatus(null)

        // Get shop
        let shop = searchParams.get("shop")
        if (!shop) {
          try {
            const sessionResponse = await fetch("/api/shop/session")
            if (sessionResponse.ok) {
              const sessionData = await sessionResponse.json()
              if (sessionData.sessions && sessionData.sessions.length > 0) {
                const validSession = sessionData.sessions.find(
                  (s: { isExpired: boolean }) => !s.isExpired
                ) || sessionData.sessions[0]
                shop = validSession.shop
              } else if (sessionData.shop) {
                shop = sessionData.shop
              }
            }
          } catch (err) {
            console.error("❌ [AUTO-MINT] Error fetching session:", err)
          }
        }

        console.log("🔄 [AUTO-MINT] Shop:", shop)

        if (!shop) {
          console.error("❌ [AUTO-MINT] No shop found")
          setMintStatus({
            type: "error",
            message: "Shop information not available. Please refresh the page.",
          })
          setMintingOrder(false)
          return
        }

        // Call mint endpoint (confirmationId is guaranteed to be non-null here due to early return)
        if (!confirmationId) return
        
        console.log("🔄 [AUTO-MINT] Calling mint API:", {
          confirmationId,
          walletAddress: selectedAccount.address,
          shop,
        })
        
        const response = await fetch(`/api/orders/${encodeURIComponent(confirmationId)}/mint`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            walletAddress: selectedAccount.address,
            shop,
          }),
        })

        console.log("🔄 [AUTO-MINT] API response status:", response.status)

        const data = await response.json()

        if (!response.ok) {
          console.error("❌ [AUTO-MINT] API error:", data)
          // Check if already minted
          if (response.status === 409 && data.existingReward) {
            setMintStatus({
              type: "info",
              message: `Tokens for this order have already been minted. Transaction: ${data.existingReward.txHash || "N/A"}`,
            })
          } else {
            setMintStatus({
              type: "error",
              message: data.error || `Failed to mint tokens: ${response.statusText}`,
            })
          }
          setMintingOrder(false)
          return
        }

        // Success
        if (data.success) {
          console.log("✅ [AUTO-MINT] Minting successful:", data)
          setMintStatus({
            type: "success",
            message: `✅ Successfully minted ${data.totalTokens} tokens! Transaction${data.txHashes?.length > 1 ? "s" : ""}: ${data.txHashes?.join(", ") || "N/A"}`,
          })

          // Remove confirmationId from URL to prevent re-triggering
          const newUrl = new URL(window.location.href)
          newUrl.searchParams.delete("confirmationId")
          window.history.replaceState({}, "", newUrl.toString())
        } else {
          console.error("❌ [AUTO-MINT] Minting failed:", data)
          setMintStatus({
            type: "error",
            message: data.error || "Failed to mint tokens",
          })
        }
      } catch (error) {
        console.error("❌ [AUTO-MINT] Error minting tokens:", error)
        setMintStatus({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to mint tokens",
        })
      } finally {
        setMintingOrder(false)
      }
    }

    triggerMinting()
  }, [searchParams, isConnected, selectedAccount, mintingOrder])

  const handleCreateToken = async (product: Product) => {
    setCreatingTokens((prev) => new Set(prev).add(product.id))

    try {
      // Generate token name and symbol from product
      const name = `${product.title} Token`
      const symbol = product.title
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 6)
        .toUpperCase() || "TOKEN"

      const productId = product.id.split("/").pop() || product.id
      const response = await fetch(`/api/products/${productId}/token`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ 
          name, 
          symbol,
          productMetadata: product // Send full product object with all metadata
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        // Handle case where token already exists
        if (response.status === 409 && errorData.existing) {
          // Token already exists, update local state
          if (errorData.assetId) {
            setProductTokens((prev) => {
              const next = new Map(prev)
              next.set(product.id, errorData.assetId)
              return next
            })
          }
          alert(`Token already exists for this product! Asset ID: ${errorData.assetId || "N/A"}`)
          return
        }
        
        throw new Error(errorData.error || `Failed to create token: ${response.statusText}`)
      }

      const data = await response.json()
      const assetId = data?.assetId || data?.id
      
      // Update local state with new token
      if (assetId) {
        setProductTokens((prev) => {
          const next = new Map(prev)
          next.set(product.id, assetId)
          return next
        })
      }
      
      alert(`Token created successfully! Asset ID: ${assetId || "N/A"}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create token"
      alert(`Error: ${errorMessage}`)
    } finally {
      setCreatingTokens((prev) => {
        const next = new Set(prev)
        next.delete(product.id)
        return next
      })
    }
  }

  const handleShowAssets = async (product: Product) => {
    // Check if wallet is connected
    if (!isConnected || !selectedAccount) {
      alert("Please connect your wallet first to view token balances.")
      return
    }

    const assetId = productTokens.get(product.id)
    if (!assetId) {
      alert("No token created for this product yet.")
      return
    }

    const productId = product.id.split("/").pop() || product.id
    const walletAddress = selectedAccount.address
    setLoadingBalances((prev) => new Set(prev).add(product.id))

    try {
      const response = await fetch(`/api/products/${productId}/token/balance?address=${encodeURIComponent(walletAddress)}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || `Failed to fetch balance: ${response.statusText}`
        alert(`Error: ${errorMessage}`)
        return
      }

      const data = await response.json()
      
      // Show an alert with the key info
      setTokenBalances((prev) => {
        const next = new Map(prev)
        if (assetId) {
          next.set(product.id, {
            assetId,
            balance: data.balance ?? data.balanceFormatted ?? "0",
            balanceFormatted: data.balanceFormatted ?? data.balance ?? "0",
            exists: data.exists ?? true,
          })
        }
        return next
      })

      alert(`Asset Balance for ${product.title}:\n\nAsset ID: ${data.assetId}\nBalance: ${data.balanceFormatted} tokens\nAddress: ${data.address}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch balance"
      if (assetId) {
        setTokenBalances((prev) => {
          const next = new Map(prev)
          next.set(product.id, {
            assetId,
            balance: "0",
            balanceFormatted: "0",
            exists: false,
            error: errorMessage,
          })
          return next
        })
      }
      alert(`Error: ${errorMessage}`)
    } finally {
      setLoadingBalances((prev) => {
        const next = new Set(prev)
        next.delete(product.id)
        return next
      })
    }
  }

  const ensureProductToken = (product: Product): { hasToken: boolean; assetId?: number } => {
    const assetId = productTokens.get(product.id)

    if (!assetId) {
      alert("You need to create a token for this product before you can add it to the cart or purchase it.")
      return { hasToken: false }
    }

    return { hasToken: true, assetId }
  }

  const handleBuy = async (product: Product, quantity: number = 1) => {
    if (!isConnected || !selectedAccount?.address) {
      alert("Please connect your wallet before purchasing.")
      return
    }

    const { hasToken, assetId } = ensureProductToken(product)
    if (!hasToken) {
      return
    }

    // Validate inventory
    const availableInventory = getAvailableInventory(product)
    if (availableInventory !== null && quantity > availableInventory) {
      alert(`Cannot purchase ${quantity} items. Only ${availableInventory} available in stock.`)
      return
    }

    // Get first available variant or first variant
    const selectedVariant = product.variants?.edges?.[0]?.node

    if (!selectedVariant?.id) {
      alert("Product variant not available. Please try another product.")
      return
    }

    // Get shop from URL or session
    let shop = searchParams.get("shop")
    if (!shop) {
      try {
        const sessionResponse = await fetch("/api/shop/session")
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json()
          if (sessionData.sessions && sessionData.sessions.length > 0) {
            const validSession = sessionData.sessions.find(
              (s: { isExpired: boolean }) => !s.isExpired
            ) || sessionData.sessions[0]
            shop = validSession.shop
          } else if (sessionData.shop) {
            shop = sessionData.shop
          }
        }
      } catch (err) {
        console.error("Error fetching session:", err)
      }
    }

    if (!shop) {
      alert("Shop information not available. Please refresh the page.")
      return
    }

    setCreatingCheckout(true)

    try {
      // TESTING: Hardcoded 10% discount for testing purposes
      const discountPercentage: number = 0.10 // 10% hardcoded for testing
      console.log("🎯 [BUY] Using hardcoded discount percentage for testing:", {
        discountPercentage: `${(discountPercentage * 100).toFixed(0)}%`,
        note: "Hardcoded for testing - will use calculated value in production"
      })

      // Create checkout with line items
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shop,
          walletAddress: selectedAccount.address,
          discountPercentage,
          lineItems: [
            {
              variantId: selectedVariant.id,
              quantity: quantity,
              assetId,
            },
          ],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create checkout: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      if (data.webUrl) {
        // Redirect to Shopify checkout
        window.location.href = data.webUrl
      } else {
        throw new Error("No checkout URL returned")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create checkout"
      alert(`Error: ${errorMessage}`)
      console.error("Checkout creation error:", error)
    } finally {
      setCreatingCheckout(false)
    }
  }

  const handleBuyCart = async () => {
    if (cart.length === 0) {
      alert("Your cart is empty!")
      return
    }

    if (!isConnected || !selectedAccount?.address) {
      alert("Please connect your wallet before checking out.")
      return
    }

    // Validate inventory for all cart items
    const inventoryErrors: string[] = []
    cart.forEach((item) => {
      const availableInventory = getVariantInventory(item.product, item.variantId)
      if (availableInventory !== null && item.quantity > availableInventory) {
        inventoryErrors.push(
          `${item.product.title}: Only ${availableInventory} available, but ${item.quantity} in cart`
        )
      }
    })

    if (inventoryErrors.length > 0) {
      alert(`Inventory errors:\n\n${inventoryErrors.join("\n")}`)
      return
    }

    // Ensure all cart items still have tokens
    const missingTokenItems = cart.filter((item) => !item.assetId)
    if (missingTokenItems.length > 0) {
      alert(
        "Each product needs an associated token before checkout. " +
          "Please create tokens for the following products and re-add them to the cart:\n\n" +
          missingTokenItems.map((item) => item.product.title).join("\n")
      )
      return
    }

    // Validate all items have variant IDs
    const itemsWithoutVariants = cart.filter((item) => !item.variantId)
    if (itemsWithoutVariants.length > 0) {
      alert("Some items in your cart don't have valid variants. Please remove them and try again.")
      return
    }

    // Get shop from URL or session
    let shop = searchParams.get("shop")
    if (!shop) {
      try {
        const sessionResponse = await fetch("/api/shop/session")
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json()
          if (sessionData.sessions && sessionData.sessions.length > 0) {
            const validSession = sessionData.sessions.find(
              (s: { isExpired: boolean }) => !s.isExpired
            ) || sessionData.sessions[0]
            shop = validSession.shop
          } else if (sessionData.shop) {
            shop = sessionData.shop
          }
        }
      } catch (err) {
        console.error("Error fetching session:", err)
      }
    }

    if (!shop) {
      alert("Shop information not available. Please refresh the page.")
      return
    }

    setCreatingCheckout(true)

    try {
      // TESTING: Hardcoded 10% discount for testing purposes
      const discountPercentage: number = 0.10 // 10% hardcoded for testing
      console.log("🎯 [BUY CART] Using hardcoded discount percentage for testing:", {
        discountPercentage: `${(discountPercentage * 100).toFixed(0)}%`,
        note: "Hardcoded for testing - will use calculated value in production"
      })

      // Format line items for checkout
      const lineItems = cart.map((item) => ({
        variantId: item.variantId!,
        quantity: item.quantity,
        assetId: item.assetId,
      }))

      // Create checkout with all cart items
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shop,
          walletAddress: selectedAccount.address,
          discountPercentage,
          lineItems,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create checkout: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      if (data.webUrl) {
        // Redirect to Shopify checkout
        window.location.href = data.webUrl
      } else {
        throw new Error("No checkout URL returned")
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create checkout"
      alert(`Error: ${errorMessage}`)
      console.error("Checkout creation error:", error)
    } finally {
      setCreatingCheckout(false)
    }
  }

  const handleRemoveFromCart = (productId: string, variantId?: string) => {
    setCart((prevCart) => 
      prevCart.filter(
        (item) => !(item.productId === productId && item.variantId === variantId)
      )
    )
  }

  const handleUpdateCartQuantity = (productId: string, variantId: string | undefined, newQuantity: number) => {
    if (newQuantity < 1) {
      handleRemoveFromCart(productId, variantId)
      return
    }

    // Find the product to check inventory
    const cartItem = cart.find(
      (item) => item.productId === productId && item.variantId === variantId
    )
    
    if (cartItem) {
      const availableInventory = getVariantInventory(cartItem.product, variantId)
      if (availableInventory !== null && newQuantity > availableInventory) {
        alert(`Cannot set quantity to ${newQuantity}. Only ${availableInventory} available in stock.`)
        return
      }
    }

    setCart((prevCart) => {
      const updatedCart = [...prevCart]
      const itemIndex = updatedCart.findIndex(
        (item) => item.productId === productId && item.variantId === variantId
      )
      if (itemIndex >= 0) {
        updatedCart[itemIndex] = {
          ...updatedCart[itemIndex],
          quantity: newQuantity,
        }
      }
      return updatedCart
    })
  }

  const updateBuyQuantity = (product: Product, delta: number) => {
    const availableInventory = getAvailableInventory(product)
    setBuyQuantities((prev) => {
      const next = new Map(prev)
      const current = next.get(product.id) || 1
      let newQuantity = Math.max(1, current + delta)
      
      // Limit to available inventory if inventory is tracked
      if (availableInventory !== null && newQuantity > availableInventory) {
        newQuantity = availableInventory
      }
      
      next.set(product.id, newQuantity)
      return next
    })
  }

  const getBuyQuantity = (productId: string): number => {
    return buyQuantities.get(productId) || 1
  }

  const getAvailableInventory = (product: Product): number | null => {
    // First try to use totalInventory at product level
    if (product.totalInventory !== undefined && product.totalInventory !== null) {
      return product.totalInventory
    }
    
    // If not available, sum up variant inventory quantities
    if (product.variants?.edges && product.variants.edges.length > 0) {
      const total = product.variants.edges.reduce((sum, edge) => {
        const variant = edge.node
        if (variant.inventoryQuantity !== undefined && variant.inventoryQuantity !== null) {
          return sum + variant.inventoryQuantity
        }
        return sum
      }, 0)
      return total > 0 ? total : null
    }
    
    return null
  }

  const getVariantInventory = (product: Product, variantId?: string): number | null => {
    if (!variantId || !product.variants?.edges) {
      return getAvailableInventory(product)
    }
    
    const variant = product.variants.edges.find(
      (edge) => edge.node.id === variantId
    )?.node
    
    if (variant?.inventoryQuantity !== undefined && variant.inventoryQuantity !== null) {
      return variant.inventoryQuantity
    }
    
    return getAvailableInventory(product)
  }

  const handleAddToCart = (product: Product) => {
    const { hasToken, assetId } = ensureProductToken(product)
    if (!hasToken) {
      return
    }

    // Get first available variant or first variant
    const selectedVariant = product.variants?.edges?.[0]?.node
    const variantId = selectedVariant?.id

    // Check if item already exists in cart (same product and variant)
    const existingItemIndex = cart.findIndex(
      (item) => item.productId === product.id && item.variantId === variantId
    )

    if (existingItemIndex >= 0) {
      // Check inventory before incrementing
      const availableInventory = getVariantInventory(product, variantId)
      const currentCartQuantity = cart[existingItemIndex].quantity
      
      if (availableInventory !== null && currentCartQuantity >= availableInventory) {
        alert(`Cannot add more. Only ${availableInventory} available in stock.`)
        return
      }

      // Increment quantity if item exists
      setCart((prevCart) => {
        const updatedCart = [...prevCart]
        updatedCart[existingItemIndex] = {
          ...updatedCart[existingItemIndex],
          assetId: updatedCart[existingItemIndex].assetId ?? assetId,
          quantity: updatedCart[existingItemIndex].quantity + 1,
        }
        return updatedCart
      })
    } else {
      // Add new item to cart
      const newCartItem: CartItem = {
        productId: product.id,
        product: product,
        variantId: variantId,
        variant: selectedVariant ? {
          id: selectedVariant.id,
          title: selectedVariant.title,
          price: selectedVariant.price,
          sku: selectedVariant.sku,
          inventoryQuantity: selectedVariant.inventoryQuantity,
          availableForSale: selectedVariant.availableForSale,
        } : undefined,
        quantity: 1,
        assetId: assetId,
        addedAt: new Date(),
      }
      setCart((prevCart) => [...prevCart, newCartItem])
    }

    // Log the cart addition
    const cartData = {
      action: "add_to_cart",
      timestamp: new Date().toISOString(),
      product: {
        id: product.id,
        title: product.title,
        handle: product.handle,
        description: product.description,
        vendor: product.vendor,
        productType: product.productType,
        tags: product.tags,
        status: product.status,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        totalInventory: product.totalInventory,
        priceRangeV2: product.priceRangeV2,
        images: product.images,
        variants: product.variants,
      },
      assetId: assetId,
      variant: selectedVariant ? {
        id: selectedVariant.id,
        title: selectedVariant.title,
        price: selectedVariant.price,
        sku: selectedVariant.sku,
        inventoryQuantity: selectedVariant.inventoryQuantity,
        availableForSale: selectedVariant.availableForSale,
      } : undefined,
      variantId: variantId,
    }

    console.log("🛒 [ADD TO CART] Cart Addition:", cartData)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader 
        title="Products" 
        description="Browse your Shopify product catalog"
        actions={<ConnectWalletButton />}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Total Tokens Card */}
        {isConnected && selectedAccount?.address && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Coins className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Tokens Owned</p>
                    <p className="text-2xl font-bold text-foreground">
                      {loadingBalances.size > 0 ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </span>
                      ) : (
                        totalTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })
                      )}
                    </p>
                  </div>
                </div>
                {tokenBalances.size > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      Across {tokenBalances.size} token{tokenBalances.size !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        {/* Mint Status Banner */}
        {(mintStatus || mintingOrder) && (
          <Alert
            className={`mb-6 ${
              mintStatus?.type === "success"
                ? "border-green-500 bg-green-50 dark:bg-green-950"
                : mintStatus?.type === "error"
                ? "border-red-500 bg-red-50 dark:bg-red-950"
                : "border-blue-500 bg-blue-50 dark:bg-blue-950"
            }`}
          >
            {mintingOrder ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Minting Tokens</AlertTitle>
                <AlertDescription>
                  Processing your order and minting tokens. Please wait...
                </AlertDescription>
              </>
            ) : mintStatus?.type === "success" ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertTitle>Tokens Minted Successfully</AlertTitle>
                <AlertDescription>{mintStatus.message}</AlertDescription>
              </>
            ) : mintStatus?.type === "error" ? (
              <>
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertTitle>Minting Failed</AlertTitle>
                <AlertDescription>{mintStatus.message}</AlertDescription>
              </>
            ) : mintStatus ? (
              <>
                <Info className="h-4 w-4 text-blue-600" />
                <AlertTitle>Order Detected</AlertTitle>
                <AlertDescription>{mintStatus.message}</AlertDescription>
              </>
            ) : null}
          </Alert>
        )}
        {cart.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Shopping Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)} items)
                </span>
                <Button
                  onClick={handleBuyCart}
                  variant="default"
                  size="sm"
                  disabled={creatingCheckout}
                >
                  {creatingCheckout ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Checkout...
                    </>
                  ) : (
                    "Buy Cart"
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {cart.map((item, index) => {
                  const availableInventory = getVariantInventory(item.product, item.variantId)
                  const exceedsInventory = availableInventory !== null && item.quantity > availableInventory
                  
                  return (
                    <div
                      key={`${item.productId}-${item.variantId}-${index}`}
                      className={`flex items-center justify-between p-3 border rounded-lg ${
                        exceedsInventory ? "border-destructive bg-destructive/5" : ""
                      }`}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{item.product.title}</p>
                        {item.variant && (
                          <p className="text-xs text-muted-foreground">
                            {item.variant.title} - {item.variant.price}
                          </p>
                        )}
                        {item.assetId && (
                          <p className="text-xs text-muted-foreground font-mono">
                            Asset ID: {item.assetId}
                          </p>
                        )}
                        {availableInventory !== null && (
                          <p className={`text-xs mt-1 ${
                            exceedsInventory 
                              ? "text-destructive font-medium" 
                              : availableInventory < 10 
                                ? "text-orange-500" 
                                : "text-muted-foreground"
                          }`}>
                            {exceedsInventory 
                              ? `⚠️ Only ${availableInventory} available` 
                              : `${availableInventory} in stock`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleUpdateCartQuantity(item.productId, item.variantId, item.quantity - 1)}
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-medium w-8 text-center">
                            {item.quantity}
                          </span>
                          <Button
                            onClick={() => handleUpdateCartQuantity(item.productId, item.variantId, item.quantity + 1)}
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={availableInventory !== null && item.quantity >= availableInventory}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Button
                          onClick={() => handleRemoveFromCart(item.productId, item.variantId)}
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading products...</p>
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <p className="text-sm text-destructive font-medium mb-2">Error loading products</p>
                <p className="text-xs text-muted-foreground">{error}</p>
              </div>
            </CardContent>
          </Card>
        ) : products.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Package className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No products found</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => {
              const assetId = productTokens.get(product.id)
              const balanceInfo = tokenBalances.get(product.id)
              const isBalanceLoading = loadingBalances.has(product.id)

              return (
                <Card key={product.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle className="line-clamp-2">{product.title}</CardTitle>
                  <CardDescription className="font-mono text-xs text-muted-foreground">
                    {product.handle}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {product.description || "No description available"}
                  </p>
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    {assetId && (
                      <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-muted-foreground">Asset #{assetId}</span>
                          {!isConnected || !selectedAccount?.address ? (
                            <span className="text-muted-foreground">Connect wallet to view</span>
                          ) : isBalanceLoading ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Checking...
                            </span>
                          ) : balanceInfo?.error ? (
                            <span className="text-destructive font-medium">Error</span>
                          ) : (
                            <span className="font-semibold text-foreground">
                              {balanceInfo?.balanceFormatted ?? "0"} tokens
                              {balanceInfo && balanceInfo.exists === false ? " (none yet)" : ""}
                            </span>
                          )}
                        </div>
                        {balanceInfo?.error && isConnected && selectedAccount?.address && !isBalanceLoading && (
                          <p className="text-[10px] text-destructive/80">{balanceInfo.error}</p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-mono text-muted-foreground">
                        ID: <span className="text-foreground">{product.id.split("/").pop()}</span>
                      </p>
                      {(() => {
                        const availableInventory = getAvailableInventory(product)
                        if (availableInventory !== null) {
                          return (
                            <span className={`text-xs font-medium ${
                              availableInventory === 0 
                                ? "text-destructive" 
                                : availableInventory < 10 
                                  ? "text-orange-500" 
                                  : "text-muted-foreground"
                            }`}>
                              {availableInventory === 0 
                                ? "Out of stock" 
                                : `${availableInventory} in stock`}
                            </span>
                          )
                        }
                        return null
                      })()}
                    </div>
                    <div className="space-y-2">
                      {(() => {
                        const availableInventory = getAvailableInventory(product)
                        const currentQuantity = getBuyQuantity(product.id)
                        const canIncrease = availableInventory === null || currentQuantity < availableInventory
                        
                        return (
                          <>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => updateBuyQuantity(product, -1)}
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0"
                                disabled={currentQuantity <= 1}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="flex-1 text-center text-sm font-medium">
                                Qty: {currentQuantity}
                              </span>
                              <Button
                                onClick={() => updateBuyQuantity(product, 1)}
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0"
                                disabled={!canIncrease}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            {availableInventory !== null && (
                              <p className="text-xs text-muted-foreground text-center">
                                {availableInventory > 0 
                                  ? `${availableInventory} left in stock`
                                  : "Out of stock"}
                              </p>
                            )}
                          </>
                        )
                      })()}
                      <Button
                        onClick={() => handleBuy(product, getBuyQuantity(product.id))}
                        className="w-full"
                        variant="default"
                        size="sm"
                        disabled={creatingCheckout || !assetId || (() => {
                          const inv = getAvailableInventory(product)
                          return inv !== null && inv === 0
                        })()}
                      >
                        {creatingCheckout ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating Checkout...
                          </>
                        ) : assetId ? "Buy" : "Create Token First"}
                      </Button>
                      <Button
                        onClick={() => handleAddToCart(product)}
                        className="w-full"
                        variant="outline"
                        size="sm"
                        disabled={!assetId}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        {assetId ? "Add to Cart" : "Create Token First"}
                      </Button>
                      {assetId && isConnected && selectedAccount?.address && (
                        <Button
                          onClick={async () => {
                            if (!selectedAccount?.address) {
                              alert("Please connect your wallet first")
                              return
                            }
                            const qty = getBuyQuantity(product.id)
                            try {
                              const response = await fetch("/api/mint/manual", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  productId: product.id,
                                  walletAddress: selectedAccount.address,
                                  assetId,
                                  quantity: qty,
                                }),
                              })
                              if (response.ok) {
                                const data = await response.json()
                                const txHash = data.txHash || data.result?.txHash
                                if (txHash) {
                                  alert(`✅ Token minted successfully!\n\nTransaction Hash: ${txHash}\n\nCheck your wallet balance.`)
                                } else {
                                  alert(`✅ Token minting initiated! Check your wallet balance in a few moments.`)
                                }
                                
                                // Wait a bit then refresh balance
                                setTimeout(async () => {
                                  const productKey = product.id.split("/").pop() || product.id
                                  const balanceResponse = await fetch(
                                    `/api/products/${encodeURIComponent(productKey)}/token/balance?address=${encodeURIComponent(selectedAccount.address)}`
                                  )
                                  if (balanceResponse.ok) {
                                    const balanceData = await balanceResponse.json()
                                    setTokenBalances((prev) => {
                                      const next = new Map(prev)
                                      next.set(product.id, {
                                        assetId,
                                        balance: balanceData.balance ?? "0",
                                        balanceFormatted: balanceData.balanceFormatted ?? "0",
                                        exists: balanceData.exists ?? true,
                                      })
                                      return next
                                    })
                                  }
                                }, 3000) // Wait 3 seconds for transaction to process
                              } else {
                                const error = await response.json().catch(() => ({}))
                                const errorMsg = error.error || error.details || error.message || "Unknown error"
                                alert(`❌ Minting failed: ${errorMsg}\n\nPlease check:\n1. Forwarder is running (port 5000)\n2. PHAT_ENDPOINT_URL is set to http://localhost:5000\n3. Wallet has sufficient balance for fees`)
                                console.error("Minting error details:", error)
                              }
                            } catch (err) {
                              console.error("Manual mint failed:", err)
                              alert(`Failed to trigger minting: ${err instanceof Error ? err.message : "Unknown error"}\n\nMake sure PHAT_ENDPOINT_URL is set to http://localhost:5000`)
                            }
                          }}
                          className="w-full"
                          variant="outline"
                          size="sm"
                        >
                          <Coins className="h-4 w-4 mr-2" />
                          Mint Token Now
                        </Button>
                      )}
                      {productTokens.has(product.id) && (
                        <Button
                          onClick={() => handleShowAssets(product)}
                          disabled={loadingBalances.has(product.id)}
                          className="w-full"
                          variant="outline"
                          size="sm"
                        >
                          {loadingBalances.has(product.id) ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4" />
                              Show Assets
                            </>
                          )}
                        </Button>
                      )}
                      {!productTokens.has(product.id) && (
                        <Button
                          onClick={() => handleCreateToken(product)}
                          disabled={creatingTokens.has(product.id)}
                          className="w-full"
                          variant="outline"
                          size="sm"
                        >
                          {creatingTokens.has(product.id) ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Creating Token...
                            </>
                          ) : (
                            <>
                              <Coins className="h-4 w-4" />
                              Create Token
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

