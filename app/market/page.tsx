"use client"

import PageHeader from "@/components/page-header"
import { ConnectWalletButton } from "@/components/connect-wallet-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useEffect, useState } from "react"
import {
  Loader2,
  Coins,
  ShoppingCart,
  Plus,
  Minus,
  Edit,
  X,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useWallet } from "@/components/wallet-provider"
import { Badge } from "@/components/ui/badge"

type TokenListing = {
  id: number
  sellerAddress: string
  assetId: number
  productId: string
  quantity: string
  pricePerToken: string
  totalPrice: string
  status: string
  buyerAddress?: string
  txHash?: string
  createdAt: string
  updatedAt: string
  productToken?: {
    id: number
    title: string
    handle: string
    description?: string
    assetId?: number
    metadata?: any
  }
}

type TokenBalanceInfo = {
  assetId: number
  balance: string
  balanceFormatted: string
  exists?: boolean
  error?: string
  productId?: string
  productTitle?: string
}

type ProductToken = {
  productId: string
  assetId: number
  title: string
  handle: string
}

export default function MarketPage() {
  const { isConnected, selectedAccount } = useWallet()
  const [listings, setListings] = useState<TokenListing[]>([])
  const [myListings, setMyListings] = useState<TokenListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"browse" | "my-listings" | "create">("browse")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"price" | "date" | "quantity">("date")
  const [filterAssetId, setFilterAssetId] = useState<string>("all")
  const [tokenBalances, setTokenBalances] = useState<Map<string, TokenBalanceInfo>>(new Map())
  const [loadingBalances, setLoadingBalances] = useState<Set<string>>(new Set())
  const [productTokens, setProductTokens] = useState<ProductToken[]>([])

  // Create listing state
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedToken, setSelectedToken] = useState<string>("")
  const [listingQuantity, setListingQuantity] = useState("")
  const [listingPrice, setListingPrice] = useState("")
  const [creatingListing, setCreatingListing] = useState(false)

  // Edit listing state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingListing, setEditingListing] = useState<TokenListing | null>(null)
  const [editQuantity, setEditQuantity] = useState("")
  const [editPrice, setEditPrice] = useState("")
  const [updatingListing, setUpdatingListing] = useState(false)

  // Buy state
  const [buyDialogOpen, setBuyDialogOpen] = useState(false)
  const [buyingListing, setBuyingListing] = useState<TokenListing | null>(null)
  const [purchasing, setPurchasing] = useState(false)

  // Fetch listings
  useEffect(() => {
    async function fetchListings() {
      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams()
        params.set("status", "active")
        if (filterAssetId && filterAssetId !== "all") {
          params.set("assetId", filterAssetId)
        }

        const response = await fetch(`/api/market/listings?${params.toString()}`)
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || "Failed to fetch listings")
        }

        const data = await response.json()
        setListings(data.listings || [])
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load listings"
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    fetchListings()
  }, [filterAssetId])

  // Fetch my listings
  useEffect(() => {
    if (!isConnected || !selectedAccount?.address) {
      setMyListings([])
      return
    }

    async function fetchMyListings() {
      try {
        const response = await fetch(
          `/api/market/my-listings?sellerAddress=${encodeURIComponent(selectedAccount.address)}`
        )
        if (response.ok) {
          const data = await response.json()
          setMyListings(data.listings || [])
        }
      } catch (err) {
        console.error("Error fetching my listings:", err)
      }
    }

    fetchMyListings()
  }, [isConnected, selectedAccount?.address])

  // Fetch product tokens
  useEffect(() => {
    async function fetchProductTokens() {
      try {
        const response = await fetch("/api/products/tokens")
        if (response.ok) {
          const tokens = await response.json()
          setProductTokens(tokens || [])
        }
      } catch (err) {
        console.error("Error fetching product tokens:", err)
      }
    }

    fetchProductTokens()
  }, [])

  // Fetch token balances
  useEffect(() => {
    if (!isConnected || !selectedAccount?.address || productTokens.length === 0) {
      setTokenBalances(new Map())
      return
    }

    async function fetchBalances() {
      const walletAddress = selectedAccount.address
      const balances = new Map<string, TokenBalanceInfo>()

      setLoadingBalances((prev) => {
        const next = new Set(prev)
        productTokens.forEach((token) => next.add(token.productId))
        return next
      })

      await Promise.all(
        productTokens.map(async (token) => {
          try {
            const productKey = token.productId.split("/").pop() || token.productId
            const response = await fetch(
              `/api/products/${encodeURIComponent(productKey)}/token/balance?address=${encodeURIComponent(walletAddress)}`
            )

            if (response.ok) {
              const data = await response.json()
              balances.set(token.productId, {
                assetId: token.assetId,
                balance: data.balance ?? "0",
                balanceFormatted: data.balanceFormatted ?? "0",
                exists: data.exists ?? true,
                productId: token.productId,
                productTitle: token.title,
              })
            }
          } catch (err) {
            console.error(`Error fetching balance for ${token.productId}:`, err)
          }
        })
      )

      setTokenBalances(balances)
      setLoadingBalances((prev) => {
        const next = new Set(prev)
        productTokens.forEach((token) => next.delete(token.productId))
        return next
      })
    }

    fetchBalances()
  }, [isConnected, selectedAccount?.address, productTokens])

  // Create listing
  const handleCreateListing = async () => {
    if (!isConnected || !selectedAccount?.address) {
      alert("Please connect your wallet first")
      return
    }

    if (!selectedToken || !listingQuantity || !listingPrice) {
      alert("Please fill in all fields")
      return
    }

    const quantityNum = parseFloat(listingQuantity)
    const priceNum = parseFloat(listingPrice)

    if (isNaN(quantityNum) || quantityNum <= 0) {
      alert("Quantity must be a positive number")
      return
    }

    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Price must be a positive number")
      return
    }

    const token = productTokens.find((t) => t.productId === selectedToken)
    if (!token) {
      alert("Selected token not found")
      return
    }

    const balance = tokenBalances.get(selectedToken)
    if (!balance || parseFloat(balance.balanceFormatted) < quantityNum) {
      alert(`Insufficient balance. Available: ${balance?.balanceFormatted || "0"}`)
      return
    }

    setCreatingListing(true)
    try {
      const response = await fetch("/api/market/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sellerAddress: selectedAccount.address,
          assetId: token.assetId,
          productId: selectedToken,
          quantity: quantityNum.toString(),
          pricePerToken: priceNum.toString(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to create listing")
      }

      const data = await response.json()
      alert("Listing created successfully!")
      setCreateDialogOpen(false)
      setSelectedToken("")
      setListingQuantity("")
      setListingPrice("")

      // Refresh listings
      const listingsResponse = await fetch("/api/market/listings?status=active")
      if (listingsResponse.ok) {
        const listingsData = await listingsResponse.json()
        setListings(listingsData.listings || [])
      }

      // Refresh my listings
      const myListingsResponse = await fetch(
        `/api/market/my-listings?sellerAddress=${encodeURIComponent(selectedAccount.address)}`
      )
      if (myListingsResponse.ok) {
        const myListingsData = await myListingsResponse.json()
        setMyListings(myListingsData.listings || [])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create listing"
      alert(`Error: ${errorMessage}`)
    } finally {
      setCreatingListing(false)
    }
  }

  // Update listing
  const handleUpdateListing = async () => {
    if (!editingListing) return

    if (!editQuantity || !editPrice) {
      alert("Please fill in all fields")
      return
    }

    const quantityNum = parseFloat(editQuantity)
    const priceNum = parseFloat(editPrice)

    if (isNaN(quantityNum) || quantityNum <= 0) {
      alert("Quantity must be a positive number")
      return
    }

    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Price must be a positive number")
      return
    }

    setUpdatingListing(true)
    try {
      const response = await fetch(`/api/market/listings/${editingListing.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quantity: quantityNum.toString(),
          pricePerToken: priceNum.toString(),
          sellerAddress: selectedAccount?.address,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to update listing")
      }

      alert("Listing updated successfully!")
      setEditDialogOpen(false)
      setEditingListing(null)

      // Refresh listings
      const listingsResponse = await fetch("/api/market/listings?status=active")
      if (listingsResponse.ok) {
        const listingsData = await listingsResponse.json()
        setListings(listingsData.listings || [])
      }

      // Refresh my listings
      if (selectedAccount?.address) {
        const myListingsResponse = await fetch(
          `/api/market/my-listings?sellerAddress=${encodeURIComponent(selectedAccount.address)}`
        )
        if (myListingsResponse.ok) {
          const myListingsData = await myListingsResponse.json()
          setMyListings(myListingsData.listings || [])
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to update listing"
      alert(`Error: ${errorMessage}`)
    } finally {
      setUpdatingListing(false)
    }
  }

  // Cancel listing
  const handleCancelListing = async (listingId: number) => {
    if (!confirm("Are you sure you want to cancel this listing?")) return

    try {
      const response = await fetch(
        `/api/market/listings/${listingId}?sellerAddress=${encodeURIComponent(selectedAccount?.address || "")}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to cancel listing")
      }

      alert("Listing cancelled successfully!")

      // Refresh listings
      const listingsResponse = await fetch("/api/market/listings?status=active")
      if (listingsResponse.ok) {
        const listingsData = await listingsResponse.json()
        setListings(listingsData.listings || [])
      }

      // Refresh my listings
      if (selectedAccount?.address) {
        const myListingsResponse = await fetch(
          `/api/market/my-listings?sellerAddress=${encodeURIComponent(selectedAccount.address)}`
        )
        if (myListingsResponse.ok) {
          const myListingsData = await myListingsResponse.json()
          setMyListings(myListingsData.listings || [])
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to cancel listing"
      alert(`Error: ${errorMessage}`)
    }
  }

  // Buy listing
  const handleBuyListing = async () => {
    if (!isConnected || !selectedAccount?.address || !buyingListing) {
      alert("Please connect your wallet first")
      return
    }

    setPurchasing(true)
    try {
      const response = await fetch(`/api/market/listings/${buyingListing.id}/buy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          buyerAddress: selectedAccount.address,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to purchase listing")
      }

      const data = await response.json()
      alert("Purchase initiated! Please complete the token transfer and payment via your wallet.")
      setBuyDialogOpen(false)
      setBuyingListing(null)

      // Refresh listings
      const listingsResponse = await fetch("/api/market/listings?status=active")
      if (listingsResponse.ok) {
        const listingsData = await listingsResponse.json()
        setListings(listingsData.listings || [])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to purchase listing"
      alert(`Error: ${errorMessage}`)
    } finally {
      setPurchasing(false)
    }
  }

  // Filter and sort listings
  const filteredListings = listings.filter((listing) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const title = listing.productToken?.title?.toLowerCase() || ""
      const description = listing.productToken?.description?.toLowerCase() || ""
      if (!title.includes(query) && !description.includes(query)) {
        return false
      }
    }
    return true
  })

  const sortedListings = [...filteredListings].sort((a, b) => {
    if (sortBy === "price") {
      return parseFloat(a.pricePerToken) - parseFloat(b.pricePerToken)
    } else if (sortBy === "quantity") {
      return parseFloat(b.quantity) - parseFloat(a.quantity)
    } else {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }
  })

  // Get available tokens for listing (tokens user owns)
  const availableTokens = Array.from(tokenBalances.entries())
    .filter(([_, balance]) => parseFloat(balance.balanceFormatted || "0") > 0)
    .map(([productId, balance]) => ({
      productId,
      assetId: balance.assetId,
      title: balance.productTitle || productId,
      balance: balance.balanceFormatted,
    }))

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader
        title="Token Marketplace"
        description="Buy and sell product tokens on the secondary market"
        actions={<ConnectWalletButton />}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b">
          <button
            onClick={() => setActiveTab("browse")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "browse"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Browse Listings
          </button>
          <button
            onClick={() => setActiveTab("my-listings")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "my-listings"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            My Listings
          </button>
          {isConnected && (
            <button
              onClick={() => setActiveTab("create")}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === "create"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Create Listing
            </button>
          )}
        </div>

        {/* Browse Tab */}
        {activeTab === "browse" && (
          <>
            {/* Filters */}
            <Card className="mb-6">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search listings..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Select value={filterAssetId} onValueChange={setFilterAssetId}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Filter by token" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tokens</SelectItem>
                      {productTokens.map((token) => (
                        <SelectItem key={token.assetId} value={token.assetId.toString()}>
                          {token.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Newest First</SelectItem>
                      <SelectItem value="price">Price: Low to High</SelectItem>
                      <SelectItem value="quantity">Quantity: High to Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Listings Grid */}
            {loading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </CardContent>
              </Card>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : sortedListings.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Coins className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No listings found</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedListings.map((listing) => (
                  <Card key={listing.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <CardTitle className="line-clamp-2">
                        {listing.productToken?.title || `Asset #${listing.assetId}`}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs">
                        Asset ID: {listing.assetId}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Quantity:</span>
                          <span className="font-medium">{parseFloat(listing.quantity).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Price per token:</span>
                          <span className="font-medium">{parseFloat(listing.pricePerToken).toFixed(6)} DOT</span>
                        </div>
                        <div className="flex justify-between text-sm font-semibold pt-2 border-t">
                          <span>Total Price:</span>
                          <span className="text-primary">{parseFloat(listing.totalPrice).toFixed(6)} DOT</span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          Seller: {listing.sellerAddress.slice(0, 8)}...{listing.sellerAddress.slice(-6)}
                        </div>
                        {isConnected && selectedAccount?.address !== listing.sellerAddress && (
                          <Button
                            onClick={() => {
                              setBuyingListing(listing)
                              setBuyDialogOpen(true)
                            }}
                            className="w-full"
                            variant="default"
                          >
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            Buy Now
                          </Button>
                        )}
                        {!isConnected && (
                          <Button className="w-full" variant="outline" disabled>
                            Connect Wallet to Buy
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* My Listings Tab */}
        {activeTab === "my-listings" && (
          <>
            {!isConnected ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Please connect your wallet to view your listings</p>
                  </div>
                </CardContent>
              </Card>
            ) : myListings.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Coins className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">You don't have any listings yet</p>
                    <Button onClick={() => setActiveTab("create")} variant="default">
                      Create Your First Listing
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {myListings.map((listing) => (
                  <Card key={listing.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{listing.productToken?.title || `Asset #${listing.assetId}`}</CardTitle>
                          <CardDescription className="font-mono text-xs mt-1">
                            Asset ID: {listing.assetId}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={
                            listing.status === "active"
                              ? "default"
                              : listing.status === "sold"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {listing.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Quantity</p>
                          <p className="font-medium">{parseFloat(listing.quantity).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Price per Token</p>
                          <p className="font-medium">{parseFloat(listing.pricePerToken).toFixed(6)} DOT</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Total Price</p>
                          <p className="font-medium text-primary">{parseFloat(listing.totalPrice).toFixed(6)} DOT</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Created</p>
                          <p className="font-medium text-xs">
                            {new Date(listing.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {listing.status === "active" && (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              setEditingListing(listing)
                              setEditQuantity(listing.quantity)
                              setEditPrice(listing.pricePerToken)
                              setEditDialogOpen(true)
                            }}
                            variant="outline"
                            size="sm"
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            onClick={() => handleCancelListing(listing.id)}
                            variant="outline"
                            size="sm"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      )}
                      {listing.status === "sold" && listing.buyerAddress && (
                        <div className="text-xs text-muted-foreground">
                          Sold to: {listing.buyerAddress.slice(0, 8)}...{listing.buyerAddress.slice(-6)}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Create Listing Tab */}
        {activeTab === "create" && (
          <>
            {!isConnected ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Please connect your wallet to create a listing</p>
                  </div>
                </CardContent>
              </Card>
            ) : availableTokens.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Coins className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">You don't own any tokens to list</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Create New Listing</CardTitle>
                  <CardDescription>List your tokens for sale on the marketplace</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="token">Select Token</Label>
                      <Select value={selectedToken} onValueChange={setSelectedToken}>
                        <SelectTrigger id="token">
                          <SelectValue placeholder="Choose a token to list" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTokens.map((token) => (
                            <SelectItem key={token.productId} value={token.productId}>
                              {token.title} (Available: {token.balance})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedToken && (
                      <>
                        <div>
                          <Label htmlFor="quantity">Quantity</Label>
                          <Input
                            id="quantity"
                            type="number"
                            min="0"
                            step="0.000001"
                            value={listingQuantity}
                            onChange={(e) => setListingQuantity(e.target.value)}
                            placeholder="Enter quantity to sell"
                          />
                          {selectedToken && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Available: {tokenBalances.get(selectedToken)?.balanceFormatted || "0"}
                            </p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="price">Price per Token (DOT)</Label>
                          <Input
                            id="price"
                            type="number"
                            min="0"
                            step="0.000001"
                            value={listingPrice}
                            onChange={(e) => setListingPrice(e.target.value)}
                            placeholder="Enter price per token"
                          />
                        </div>
                        {listingQuantity && listingPrice && (
                          <div className="p-4 bg-muted rounded-lg">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Total Price:</span>
                              <span className="font-semibold text-lg">
                                {(parseFloat(listingQuantity || "0") * parseFloat(listingPrice || "0")).toFixed(6)} DOT
                              </span>
                            </div>
                          </div>
                        )}
                        <Button
                          onClick={handleCreateListing}
                          disabled={creatingListing || !listingQuantity || !listingPrice}
                          className="w-full"
                        >
                          {creatingListing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4 mr-2" />
                              Create Listing
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Buy Dialog */}
        <Dialog open={buyDialogOpen} onOpenChange={setBuyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Purchase</DialogTitle>
              <DialogDescription>
                Review the details before completing your purchase
              </DialogDescription>
            </DialogHeader>
            {buyingListing && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Token</p>
                  <p className="text-sm text-muted-foreground">
                    {buyingListing.productToken?.title || `Asset #${buyingListing.assetId}`}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Quantity</p>
                  <p className="text-sm text-muted-foreground">{parseFloat(buyingListing.quantity).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">Price per Token</p>
                  <p className="text-sm text-muted-foreground">
                    {parseFloat(buyingListing.pricePerToken).toFixed(6)} DOT
                  </p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-medium">Total Price:</span>
                    <span className="font-semibold text-lg text-primary">
                      {parseFloat(buyingListing.totalPrice).toFixed(6)} DOT
                    </span>
                  </div>
                </div>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    After purchase, you'll need to complete the token transfer and payment via your wallet extension.
                  </AlertDescription>
                </Alert>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setBuyDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleBuyListing} disabled={purchasing}>
                {purchasing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Confirm Purchase"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Listing</DialogTitle>
              <DialogDescription>Update the quantity or price of your listing</DialogDescription>
            </DialogHeader>
            {editingListing && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-quantity">Quantity</Label>
                  <Input
                    id="edit-quantity"
                    type="number"
                    min="0"
                    step="0.000001"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-price">Price per Token (DOT)</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    min="0"
                    step="0.000001"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                  />
                </div>
                {editQuantity && editPrice && (
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">New Total Price:</span>
                      <span className="font-semibold">
                        {(parseFloat(editQuantity) * parseFloat(editPrice)).toFixed(6)} DOT
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateListing} disabled={updatingListing}>
                {updatingListing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Listing"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

