"use client"

import PageHeader from "@/components/page-header"
import { ConnectWalletButton } from "@/components/connect-wallet-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Package, Coins, Eye, ShoppingCart, Plus, Minus, Trash2 } from "lucide-react"
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
  const [cart, setCart] = useState<CartItem[]>([])
  const [buyQuantities, setBuyQuantities] = useState<Map<string, number>>(new Map()) // productId -> quantity for buy
  const [creatingCheckout, setCreatingCheckout] = useState(false)

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
          throw new Error(`Failed to fetch products: ${response.statusText}`)
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
      alert(`Asset Balance for ${product.title}:\n\nAsset ID: ${data.assetId}\nBalance: ${data.balanceFormatted} tokens\nAddress: ${data.address}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch balance"
      alert(`Error: ${errorMessage}`)
    } finally {
      setLoadingBalances((prev) => {
        const next = new Set(prev)
        next.delete(product.id)
        return next
      })
    }
  }

  const handleBuy = async (product: Product, quantity: number = 1) => {
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
      // Create checkout with line items
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shop,
          lineItems: [
            {
              variantId: selectedVariant.id,
              quantity: quantity,
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
      // Format line items for checkout
      const lineItems = cart.map((item) => ({
        variantId: item.variantId!,
        quantity: item.quantity,
      }))

      // Create checkout with all cart items
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          shop,
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
    const assetId = productTokens.get(product.id)

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
            {products.map((product) => (
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
                        disabled={creatingCheckout || (() => {
                          const inv = getAvailableInventory(product)
                          return inv !== null && inv === 0
                        })()}
                      >
                        {creatingCheckout ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating Checkout...
                          </>
                        ) : (
                          "Buy"
                        )}
                      </Button>
                      <Button
                        onClick={() => handleAddToCart(product)}
                        className="w-full"
                        variant="outline"
                        size="sm"
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Add to Cart
                      </Button>
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

