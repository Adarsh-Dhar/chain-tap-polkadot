// src/SetWalletAddress.jsx

import React, { useEffect, useRef } from 'react';
import {
  reactExtension,
  useAttributes,
  useApplyCartLinesChange,
} from '@shopify/ui-extensions-react/checkout';

// Register this component to run during checkout
export default reactExtension('purchase.checkout.block.render', () => (
  <SetWalletAddress />
));

function SetWalletAddress() {
  const attributes = useAttributes();
  const applyCartLinesChange = useApplyCartLinesChange();
  const hasChecked = useRef(false);

  useEffect(() => {
    // Prevent multiple executions
    if (hasChecked.current) {
      return;
    }

    hasChecked.current = true;

    // Check if wallet address is already in checkout attributes
    const existingWalletAttr = attributes?.find(
      (attr) => 
        attr?.key === 'wallet_address' || 
        attr?.key === '_wallet' || 
        attr?.key === 'wallet' ||
        (attr?.key && attr.key.toLowerCase() === 'wallet address')
    );

    if (existingWalletAttr?.value) {
      console.log('[SetWalletAddress] ✅ Wallet address already in checkout attributes:', existingWalletAttr.value);
      return;
    }

    // Try to find wallet address in existing attributes (from cart)
    let walletAddress = null;
    
    if (attributes && Array.isArray(attributes)) {
      console.log('[SetWalletAddress] Checking attributes:', attributes);
      
      // Check all attributes for wallet address patterns
      for (const attr of attributes) {
        const key = attr?.key?.toLowerCase() || '';
        const value = String(attr?.value || '').trim();
        
        // Check if this attribute contains a wallet address
        if (
          (key.includes('wallet') && value && value.length >= 40) ||
          // Check if value looks like a wallet address (Polkadot SS58 or Ethereum)
          /^[1-9A-HJ-NP-Za-km-z]{47,48}$/.test(value) ||
          /^0x[a-fA-F0-9]{40}$/.test(value)
        ) {
          walletAddress = value;
          console.log('[SetWalletAddress] Found wallet address in cart attributes:', walletAddress);
          break;
        }
      }
    }

    // If not found in attributes, try localStorage (may not work in iframe)
    if (!walletAddress) {
      try {
        const STORAGE_KEY = 'chainTap_wallet_address';
        const storedAddress = localStorage.getItem(STORAGE_KEY);
        if (storedAddress && storedAddress.trim()) {
          walletAddress = storedAddress.trim();
          console.log('[SetWalletAddress] Found wallet address in localStorage:', walletAddress);
        }
      } catch (error) {
        console.log('[SetWalletAddress] localStorage not accessible in checkout iframe (this is normal)');
      }
    }

    if (walletAddress) {
      console.log('[SetWalletAddress] ✅ Wallet address found:', walletAddress);
      console.log('[SetWalletAddress] Note: Attributes should transfer to order note_attributes automatically');
    } else {
      console.log('[SetWalletAddress] ⚠️ No wallet address found in attributes or localStorage');
      console.log('[SetWalletAddress] Make sure wallet is connected before adding items to cart');
    }
  }, [attributes, applyCartLinesChange]);

  // This component doesn't render anything visible
  return null;
}

