"use client"

import PageHeader from "@/components/page-header"
import { ConnectWalletButton } from "@/components/connect-wallet-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Package, Coins, Eye } from "lucide-react"
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

const PRODUCTS_QUERY = `
  query {
    products(first: 5) {
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

  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true)
        setError(null)

        // Get shop parameter from URL
        const shop = searchParams.get("shop")
        console.log("🔍 [CLIENT] Fetching products for shop:", shop)
        
        if (!shop) {
          console.error("❌ [CLIENT] ERROR: Shop parameter is missing")
          setError("Shop parameter is required. Please access this page with a shop parameter in the URL.")
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader 
        title="Products" 
        description="Browse your Shopify product catalog"
        actions={<ConnectWalletButton />}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
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
                    <p className="text-xs font-mono text-muted-foreground">
                      ID: <span className="text-foreground">{product.id.split("/").pop()}</span>
                    </p>
                    {(() => {
                      const hasToken = productTokens.has(product.id)
                      const assetId = productTokens.get(product.id)
                      return hasToken ? (
                        <div className="space-y-2">
                          <Button
                            disabled
                            className="w-full"
                            variant="secondary"
                            size="sm"
                          >
                            <Coins className="h-4 w-4" />
                            Token Created (ID: {assetId})
                          </Button>
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
                        </div>
                      ) : (
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
                      )
                    })()}
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

