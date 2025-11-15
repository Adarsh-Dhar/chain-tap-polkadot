'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/components/wallet-provider';

type VipAccessResult = {
  hasVipAccess: boolean;
  tokenBalance: number;
  tokenBalanceFormatted: string;
  loading: boolean;
  error: string | null;
  tokenTitle: string | null;
};

// Default threshold (will be overridden by database value)
export const VIP_TOKEN_THRESHOLD = 1;

export function useVipAccess(): VipAccessResult {
  const { isConnected, selectedAccount } = useWallet();
  const [hasVipAccess, setHasVipAccess] = useState(false);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [tokenBalanceFormatted, setTokenBalanceFormatted] = useState('0');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenTitle, setTokenTitle] = useState<string | null>(null);

  useEffect(() => {
    async function checkVipAccess() {
      // Reset state
      setHasVipAccess(false);
      setTokenBalance(0);
      setTokenBalanceFormatted('0');
      setError(null);
      setTokenTitle(null);

      // If wallet is not connected, no VIP access
      if (!isConnected || !selectedAccount?.address) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // local-fest-website is a separate Next.js app, so we need to call the main app's API
        // Use environment variable or detect port automatically
        let mainAppUrl = process.env.NEXT_PUBLIC_MAIN_APP_URL;
        
        if (!mainAppUrl && typeof window !== 'undefined') {
          // Auto-detect: if we're on port 3001, main app is on 3000
          const currentPort = window.location.port;
          if (currentPort === '3001') {
            mainAppUrl = 'http://localhost:3000';
          } else {
            // Same origin or default to 3000
            mainAppUrl = window.location.origin.includes('3000') 
              ? window.location.origin 
              : 'http://localhost:3000';
          }
        }
        
        if (!mainAppUrl) {
          mainAppUrl = 'http://localhost:3000';
        }
        
        // Use the VIP token balance API from the main app
        const apiUrl = `${mainAppUrl}/api/vip/token/balance?address=${encodeURIComponent(selectedAccount.address)}`;
        
        console.log('🔍 [VIP] Fetching VIP balance from:', apiUrl);
        console.log('🔍 [VIP] Wallet address:', selectedAccount.address);
        
        const balanceResponse = await fetch(apiUrl, {
          // Suppress console errors for expected 404 responses
          // The browser will still log it, but we handle it gracefully
        });

        console.log('🔍 [VIP] Response status:', balanceResponse.status, balanceResponse.statusText);

        if (!balanceResponse.ok) {
          // Try to parse error response (should always be JSON with CORS headers)
          let errorData: any = {};
          try {
            errorData = await balanceResponse.json();
          } catch (parseError) {
            // If JSON parsing fails, use status text
            errorData = { error: balanceResponse.statusText || 'Unknown error' };
          }
          
          console.error('❌ [VIP] API Error:', errorData);
          
          // Handle non-200 status codes
          throw new Error(errorData.error || errorData.message || `Failed to fetch VIP token balance: ${balanceResponse.statusText}`);
        }

        const balanceData = await balanceResponse.json();
        console.log('✅ [VIP] API Response:', balanceData);

        // Check if VIP token is configured
        if (balanceData.configured === false) {
          // No VIP token configured - this is expected and not a critical error
          console.warn('⚠️ [VIP] No VIP tokens configured:', balanceData.message);
          console.warn('⚠️ [VIP] Available tokens:', balanceData.availableTokens);
          setError(balanceData.message || balanceData.error || 'No VIP token configured');
          setLoading(false);
          return;
        }

        // Parse balance (only if we get here, VIP token is configured)
        const balance = parseFloat(balanceData.balanceFormatted || balanceData.balance || '0');
        const balanceFormatted = balanceData.balanceFormatted || balance.toString();
        const threshold = balanceData.threshold || VIP_TOKEN_THRESHOLD;

        console.log('✅ [VIP] Balance:', balanceFormatted);
        console.log('✅ [VIP] Threshold:', threshold);
        console.log('✅ [VIP] Token Count:', balanceData.tokenCount || 1);
        if (balanceData.tokenBalances) {
          console.log('✅ [VIP] Individual Token Balances:', balanceData.tokenBalances);
        }

        setTokenBalance(balance);
        setTokenBalanceFormatted(balanceFormatted);
        
        // Handle both single title and multiple titles (for multiple VIP tokens)
        const title = balanceData.title || 
                     (balanceData.titles && balanceData.titles.length > 0 ? balanceData.titles.join(', ') : null) ||
                     (balanceData.tokenCount > 1 ? `${balanceData.tokenCount} VIP Tokens` : null);
        setTokenTitle(title);

        // Check if balance meets VIP threshold from database
        const hasAccess = balanceData.hasVipAccess || balance >= threshold;
        console.log('✅ [VIP] Has Access:', hasAccess, `(${balance} >= ${threshold})`);
        
        setHasVipAccess(hasAccess);
      } catch (err) {
        // Log all errors for debugging
        const errorMessage = err instanceof Error ? err.message : 'Failed to check VIP access';
        console.error('❌ [VIP] Error checking VIP access:', err);
        console.error('❌ [VIP] Error message:', errorMessage);
        setError(errorMessage);
        setHasVipAccess(false);
      } finally {
        setLoading(false);
      }
    }

    checkVipAccess();
  }, [isConnected, selectedAccount?.address]);

  return {
    hasVipAccess,
    tokenBalance,
    tokenBalanceFormatted,
    loading,
    error,
    tokenTitle,
  };
}

