"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types'

interface WalletContextType {
  accounts: InjectedAccountWithMeta[]
  selectedAccount: InjectedAccountWithMeta | null
  isConnected: boolean
  isConnecting: boolean
  connect: () => Promise<InjectedAccountWithMeta>
  disconnect: () => void
  selectAccount: (account: InjectedAccountWithMeta) => void
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

const STORAGE_KEY = 'chainTap_wallet_address'

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<InjectedAccountWithMeta[]>([])
  const [selectedAccount, setSelectedAccount] = useState<InjectedAccountWithMeta | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  const reconnectToSavedAccount = useCallback(async (address: string) => {
    if (typeof window === 'undefined') return
    
    try {
      const { web3Enable, web3Accounts } = await import('@polkadot/extension-dapp')
      const extensions = await web3Enable('ChainTap')
      if (extensions.length === 0) return

      const allAccounts = await web3Accounts()
      const savedAccount = allAccounts.find((acc) => acc.address === address)

      if (savedAccount) {
        setAccounts(allAccounts)
        setSelectedAccount(savedAccount)
      } else {
        // Saved account not found, clear storage
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch (error) {
      console.error('Error reconnecting to wallet:', error)
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  // Load saved account on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    const savedAddress = localStorage.getItem(STORAGE_KEY)
    if (savedAddress) {
      // Try to reconnect to saved account
      reconnectToSavedAccount(savedAddress)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // reconnectToSavedAccount is stable (empty deps), safe to omit

  // Helper function to send wallet address to backend
  const sendWalletToBackend = useCallback(async (walletAddress: string, cartId?: string, customerId?: string, shop?: string) => {
    try {
      // Use the Next.js app URL (same origin as the main app)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 
        (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
      
      // If shop not provided, try to get it from URL or session
      let shopDomain = shop;
      if (!shopDomain && typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        shopDomain = urlParams.get('shop') || undefined;
        
        // If still no shop, try to get from session API
        if (!shopDomain) {
          try {
            const sessionResponse = await fetch(`${backendUrl}/api/shop/session`);
            if (sessionResponse.ok) {
              const sessionData = await sessionResponse.json();
              if (sessionData.shop) {
                shopDomain = sessionData.shop;
              } else if (sessionData.sessions && sessionData.sessions.length > 0) {
                const validSession = sessionData.sessions.find(
                  (s: { isExpired: boolean }) => !s.isExpired
                ) || sessionData.sessions[0];
                shopDomain = validSession?.shop;
              }
            }
          } catch (e) {
            console.warn('Could not fetch shop from session:', e);
          }
        }
      }
      
      const response = await fetch(`${backendUrl}/api/store-wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for session
        body: JSON.stringify({
          walletAddress,
          ...(cartId && { cartId }),
          ...(customerId && { customerId }),
          ...(shopDomain && { shop: shopDomain }),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to store wallet' }))
        console.warn('Failed to store wallet in backend:', errorData)
        // Don't throw - this is not critical for wallet connection
      } else {
        console.log('Wallet address stored in backend successfully')
      }
    } catch (error) {
      console.warn('Error sending wallet to backend:', error)
      // Don't throw - this is not critical for wallet connection
    }
  }, [])

  const connect = useCallback(async (): Promise<InjectedAccountWithMeta> => {
    if (typeof window === 'undefined') {
      throw new Error('Wallet connection is only available in the browser')
    }

    setIsConnecting(true)
    try {
      // Dynamically import Polkadot extension functions (client-side only)
      const { web3Enable, web3Accounts } = await import('@polkadot/extension-dapp')
      
      // Request wallet permissions
      const extensions = await web3Enable('ChainTap')

      if (extensions.length === 0) {
        throw new Error('No wallet extension found. Please install a Polkadot-compatible wallet like SubWallet.')
      }

      // Get all accounts
      const allAccounts = await web3Accounts()

      if (allAccounts.length === 0) {
        throw new Error('No accounts found. Please create an account in your wallet extension.')
      }

      setAccounts(allAccounts)

      // Select the first account by default, or try to restore saved account
      const savedAddress = localStorage.getItem(STORAGE_KEY)
      const accountToSelect = savedAddress
        ? allAccounts.find((acc) => acc.address === savedAddress) || allAccounts[0]
        : allAccounts[0]

      setSelectedAccount(accountToSelect)
      localStorage.setItem(STORAGE_KEY, accountToSelect.address)
      
      // Send wallet address to backend (non-blocking)
      // Try to get cart/customer ID and shop from URL params or localStorage if available
      const urlParams = new URLSearchParams(window.location.search)
      const cartId = urlParams.get('cart') || localStorage.getItem('cartId') || undefined
      const customerId = urlParams.get('customer') || localStorage.getItem('customerId') || undefined
      const shop = urlParams.get('shop') || undefined
      
      sendWalletToBackend(accountToSelect.address, cartId, customerId, shop).catch(err => {
        console.warn('Background wallet sync failed:', err)
      })
      
      return accountToSelect
    } catch (error) {
      console.error('Error connecting to wallet:', error)
      throw error
    } finally {
      setIsConnecting(false)
    }
  }, [sendWalletToBackend])

  const disconnect = useCallback(() => {
    setSelectedAccount(null)
    setAccounts([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const selectAccount = useCallback((account: InjectedAccountWithMeta) => {
    setSelectedAccount(account)
    localStorage.setItem(STORAGE_KEY, account.address)
    
    // Send updated wallet address to backend when account is switched
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const cartId = urlParams?.get('cart') || (typeof window !== 'undefined' ? localStorage.getItem('cartId') : null) || undefined
    const customerId = urlParams?.get('customer') || (typeof window !== 'undefined' ? localStorage.getItem('customerId') : null) || undefined
    const shop = urlParams?.get('shop') || undefined
    
    sendWalletToBackend(account.address, cartId, customerId, shop).catch(err => {
      console.warn('Background wallet sync failed:', err)
    })
  }, [sendWalletToBackend])

  const value: WalletContextType = {
    accounts,
    selectedAccount,
    isConnected: selectedAccount !== null,
    isConnecting,
    connect,
    disconnect,
    selectAccount,
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

