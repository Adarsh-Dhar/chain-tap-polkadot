"use client"

import PageHeader from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useState } from "react"
import { Loader2, Package } from "lucide-react"

type Product = {
  id: string
  title: string
  handle: string
  description: string
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
        }
      }
    }
  }
`

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-mono text-muted-foreground">
                      ID: <span className="text-foreground">{product.id.split("/").pop()}</span>
                    </p>
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

