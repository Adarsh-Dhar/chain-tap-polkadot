// src/ConnectWallet.jsx
// @ts-nocheck
// TypeScript type errors are expected here due to React/Preact type conflicts.
// Shopify UI Extensions use Preact at runtime, but TypeScript sees React types.

import React, { useState, useEffect, useRef } from 'react';
import {
  reactExtension,
  useAttributes,
  useApplyAttributeChange,
  useBuyerJourneyIntercept,
  BlockStack,
  Button,
  Text,
  InlineStack,
  Banner,
  Divider,
  Pressable,
} from '@shopify/ui-extensions-react/checkout';

// Export the component for use in wrapper
export default function ConnectWallet() {
  const attributes = useAttributes();
  const applyAttributeChange = useApplyAttributeChange();
  
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [polkadotExtension, setPolkadotExtension] = useState(null);
  const hasInitialized = useRef(false);

  // Check if wallet is already connected from attributes
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Check if wallet address exists in attributes
    if (attributes && Array.isArray(attributes)) {
      const walletAttr = attributes.find(
        (attr) =>
          attr?.key === 'wallet_address' ||
          attr?.key === '_wallet' ||
          attr?.key === 'wallet' ||
          (attr?.key && attr.key.toLowerCase() === 'wallet address')
      );

      if (walletAttr?.value) {
        // Wallet already connected, create a mock account object
        setSelectedAccount({
          address: walletAttr.value,
          meta: { name: 'Connected Account' },
        });
        console.log('[ConnectWallet] Wallet already connected:', walletAttr.value);
      }
    }
  }, [attributes]);

  // Load Polkadot extension library
  const loadPolkadotExtension = async () => {
    if (polkadotExtension) {
      return polkadotExtension;
    }

    try {
      // Use dynamic import for ES modules
      // @ts-ignore - Dynamic import from CDN
      const module = await import('https://cdn.jsdelivr.net/npm/@polkadot/extension-dapp@0.62.3/+esm');
      setPolkadotExtension(module);
      return module;
    } catch (error) {
      console.error('[ConnectWallet] Failed to load Polkadot extension library:', error);
      throw new Error('Failed to load Polkadot extension library. Please check your internet connection.');
    }
  };

  // Connect wallet
  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const extension = await loadPolkadotExtension();
      const { web3Enable, web3Accounts } = extension;

      // Request wallet permissions
      const extensions = await web3Enable('ChainTap');

      if (extensions.length === 0) {
        throw new Error('No wallet extension found. Please install a Polkadot-compatible wallet like SubWallet.');
      }

      // Get all accounts
      const allAccounts = await web3Accounts();

      if (allAccounts.length === 0) {
        throw new Error('No accounts found. Please create an account in your wallet extension.');
      }

      setAccounts(allAccounts);

      // Select the first account by default
      const accountToSelect = allAccounts[0];
      setSelectedAccount(accountToSelect);

      // Set checkout attributes with wallet address
      await setWalletAttributes(accountToSelect.address);

      console.log('[ConnectWallet] ✅ Wallet connected:', accountToSelect.address);
    } catch (err) {
      const errorMessage = err?.message || 'Failed to connect to wallet';
      setError(errorMessage);
      console.error('[ConnectWallet] Error connecting wallet:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  // Set wallet address as checkout attributes
  const setWalletAttributes = async (address) => {
    if (!address) return;

    try {
      const attributeKeys = ['wallet_address', '_wallet', 'wallet', 'Wallet Address'];

      // Set all attribute formats
      await Promise.all(
        attributeKeys.map((key) =>
          applyAttributeChange({
            type: 'updateAttribute',
            key: key,
            value: address,
          }).catch((err) => {
            console.error(`[ConnectWallet] Error setting ${key}:`, err);
          })
        )
      );

      console.log('[ConnectWallet] ✅ Wallet address set in checkout attributes');
    } catch (err) {
      console.error('[ConnectWallet] Error setting wallet attributes:', err);
    }
  };

  // Select different account
  const handleSelectAccount = async (account) => {
    setSelectedAccount(account);
    setShowDropdown(false);
    await setWalletAttributes(account.address);
  };

  // Copy address to clipboard
  const handleCopyAddress = async () => {
    if (!selectedAccount) return;

    try {
      await navigator.clipboard.writeText(selectedAccount.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ConnectWallet] Failed to copy address:', err);
      setError('Failed to copy address to clipboard');
    }
  };

  // Disconnect wallet
  const handleDisconnect = async () => {
    setSelectedAccount(null);
    setAccounts([]);
    setShowDropdown(false);

    // Clear wallet attributes
    try {
      const attributeKeys = ['wallet_address', '_wallet', 'wallet', 'Wallet Address'];
      await Promise.all(
        attributeKeys.map((key) =>
          applyAttributeChange({
            type: 'updateAttribute',
            key: key,
            value: '',
          }).catch((err) => {
            console.error(`[ConnectWallet] Error clearing ${key}:`, err);
          })
        )
      );
    } catch (err) {
      console.error('[ConnectWallet] Error clearing wallet attributes:', err);
    }
  };

  // Truncate address for display
  const truncateAddress = (address, start = 6, end = 4) => {
    if (!address || address.length <= start + end) return address;
    return `${address.slice(0, start)}...${address.slice(-end)}`;
  };

  // Block checkout if wallet not connected
  useBuyerJourneyIntercept(({ canBlockProgress }) => {
    if (!selectedAccount) {
      return {
      behavior: canBlockProgress ? 'block' : 'allow',
      reason: 'Please connect your wallet to continue with checkout.',
      errors: [
        {
          target: '$checkout',
          message: 'Wallet connection is required to complete your purchase.',
        },
      ],
    };
    }
    return { behavior: 'allow' };
  });

  // Render connected state
  if (selectedAccount) {
    return (
      <BlockStack spacing="base">
        <Banner status="success" title="Wallet Connected">
          Your wallet is connected and ready for checkout.
        </Banner>

        <BlockStack spacing="tight">
          <InlineStack spacing="base" blockAlignment="center">
            <BlockStack spacing="extraTight">
              <Text size="base" emphasis="bold">
                {selectedAccount.meta?.name || 'Account'}
              </Text>
              <Text size="small" appearance="subdued">
                {truncateAddress(selectedAccount.address)}
              </Text>
            </BlockStack>
          </InlineStack>

          <InlineStack spacing="tight">
            <Button
              kind="secondary"
              onPress={handleCopyAddress}
              accessibilityLabel="Copy wallet address"
            >
              {copied ? 'Copied!' : 'Copy Address'}
            </Button>

            {accounts.length > 1 && (
              <Button
                kind="secondary"
                onPress={() => setShowDropdown(!showDropdown)}
                accessibilityLabel="Switch account"
              >
                Switch Account
              </Button>
            )}

            <Button
              kind="secondary"
              onPress={handleDisconnect}
              accessibilityLabel="Disconnect wallet"
            >
              Disconnect
            </Button>
          </InlineStack>

          {showDropdown && accounts.length > 1 && (
            <BlockStack spacing="tight">
              <Divider />
              <Text size="small" appearance="subdued">
                Switch account
              </Text>
              {accounts.map((account) => (
                <Pressable
                  key={account.address}
                  onPress={() => handleSelectAccount(account)}
                >
                  <BlockStack spacing="extraTight">
                    <Text size="base">
                      {account.meta?.name || 'Account'}
                    </Text>
                    <Text size="small" appearance="subdued">
                      {truncateAddress(account.address, 4, 4)}
                    </Text>
                  </BlockStack>
                </Pressable>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </BlockStack>
    );
  }

  // Render connect state
  return (
    <BlockStack spacing="base">
      <Banner status="critical" title="Wallet Connection Required">
        Please connect your wallet to continue with checkout. Your wallet address will be used to receive your purchase.
      </Banner>

      {error && (
        <Banner status="critical" title="Connection Error">
          {error}
        </Banner>
      )}

      <Button
        kind="primary"
        onPress={handleConnect}
        loading={isConnecting}
        disabled={isConnecting}
        accessibilityLabel="Connect wallet"
      >
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </Button>

      <Text size="small" appearance="subdued">
        Make sure you have a Polkadot-compatible wallet extension installed (e.g., SubWallet, Polkadot.js).
      </Text>
    </BlockStack>
  );
}

