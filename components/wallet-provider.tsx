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
      return accountToSelect
    } catch (error) {
      console.error('Error connecting to wallet:', error)
      throw error
    } finally {
      setIsConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setSelectedAccount(null)
    setAccounts([])
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const selectAccount = useCallback((account: InjectedAccountWithMeta) => {
    setSelectedAccount(account)
    localStorage.setItem(STORAGE_KEY, account.address)
  }, [])

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

