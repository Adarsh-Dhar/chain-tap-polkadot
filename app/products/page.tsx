"use client"

import PageHeader from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { Loader2, Package, Coins } from "lucide-react"

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
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creatingTokens, setCreatingTokens] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetchProducts() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch("/api/shopify/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: PRODUCTS_QUERY,
          }),
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch products: ${response.statusText}`)
        }

        const data: ProductsResponse = await response.json()

        if (data.errors && data.errors.length > 0) {
          console.error("GraphQL Errors:", data.errors)
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
        console.error("Error fetching products:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [])

  const handleCreateToken = async (product: Product) => {
    // Log all product details (only fields with values)
    console.log("=== Product Details ===")
    
    // Always log basic fields
    console.log("Product ID:", product.id)
    console.log("Title:", product.title)
    console.log("Handle:", product.handle)
    if (product.description) console.log("Description:", product.description)
    
    // Log optional fields only if they have values
    if (product.vendor) console.log("Vendor:", product.vendor)
    if (product.productType) console.log("Product Type:", product.productType)
    if (product.tags && product.tags.length > 0) console.log("Tags:", product.tags)
    if (product.status) console.log("Status:", product.status)
    if (product.createdAt) console.log("Created At:", product.createdAt)
    if (product.updatedAt) console.log("Updated At:", product.updatedAt)
    if (product.totalInventory !== undefined && product.totalInventory !== null) {
      console.log("Total Inventory:", product.totalInventory)
    }
    if (product.priceRangeV2) {
      console.log("Price Range:", {
        min: `${product.priceRangeV2.minVariantPrice.amount} ${product.priceRangeV2.minVariantPrice.currencyCode}`,
        max: `${product.priceRangeV2.maxVariantPrice.amount} ${product.priceRangeV2.maxVariantPrice.currencyCode}`
      })
    }
    if (product.images && product.images.edges.length > 0) {
      console.log("Images:", product.images.edges.map(e => ({
        url: e.node.url,
        altText: e.node.altText,
        dimensions: e.node.width && e.node.height ? `${e.node.width}x${e.node.height}` : undefined
      })))
    }
    if (product.variants && product.variants.edges.length > 0) {
      console.log("Variants:", product.variants.edges.map(e => ({
        title: e.node.title,
        price: e.node.price,
        sku: e.node.sku,
        inventory: e.node.inventoryQuantity,
        available: e.node.availableForSale
      })))
    }
    
    // Log full product object for debugging
    console.log("Full Product Object:", JSON.stringify(product, null, 2))
    console.log("======================")

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
        throw new Error(errorData.error || `Failed to create token: ${response.statusText}`)
      }

      const data = await response.json()
      alert(`Token created successfully! Asset ID: ${data.assetId || "N/A"}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create token"
      alert(`Error: ${errorMessage}`)
      console.error("Error creating token:", err)
    } finally {
      setCreatingTokens((prev) => {
        const next = new Set(prev)
        next.delete(product.id)
        return next
      })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader title="Products" description="Browse your Shopify product catalog" />

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

