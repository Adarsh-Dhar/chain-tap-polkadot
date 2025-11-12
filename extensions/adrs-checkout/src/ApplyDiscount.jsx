// src/ApplyDiscount.jsx

import React, { useState, useEffect } from 'react';
import {
  reactExtension,
  useApplyDiscountCodeChange,
  useAttributes,
  useDiscountCodes,
  BlockStack,
  Text,
  Spinner,
} from '@shopify/ui-extensions-react/checkout';

// 1. Register this component to the 'checkout' target
export default reactExtension('purchase.checkout.block.render', () => (
  <ApplyDiscount />
));

function ApplyDiscount() {
  // 2. Get the function from the hook
  const applyDiscount = useApplyDiscountCodeChange();
  
  // 3. Get cart attributes and discount codes
  const attributes = useAttributes();
  const discountCodes = useDiscountCodes();

  // 4. Use state to track discount application
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [discountApplied, setDiscountApplied] = useState(false);

  // 5. Check if discount is already applied (it should be applied directly to cart)
  useEffect(() => {
    // Debug: Log cart structure
    console.log('[ApplyDiscount] Attributes:', attributes);
    console.log('[ApplyDiscount] Discount codes:', discountCodes);
    
    // Check if discount is already applied by checking cart discount codes
    // The discount code is now applied directly to the cart via Storefront API
    if (discountCodes && discountCodes.length > 0) {
      console.log('[ApplyDiscount] Discount already applied to cart:', discountCodes);
      setDiscountApplied(true);
      // discountCodes can be array of strings or objects with code property
      const codes = discountCodes.map(dc => typeof dc === 'string' ? dc : dc?.code).filter(Boolean);
      setMessage(`Discount applied: ${codes.join(', ')}`);
      return;
    }

    // Fallback: Try to read discount code from cart attributes if not already applied
    // This is a backup in case direct application failed
    let discountCode = null;
    
    if (attributes && Array.isArray(attributes)) {
      console.log('[ApplyDiscount] Attributes array:', attributes);
      // Check for discount_code or _discount_code attribute
      const discountAttr = attributes.find(
        (attr) => attr?.key === 'discount_code' || attr?.key === '_discount_code'
      );
      
      if (discountAttr?.value) {
        discountCode = discountAttr.value;
        console.log('[ApplyDiscount] Found discount code in attributes (fallback):', discountCode);
        
        // Try to apply it as fallback
        if (!discountApplied) {
          setIsLoading(true);
          setMessage('Applying your discount...');

          applyDiscount({
            type: 'addDiscountCode',
            code: discountCode,
          })
            .then((result) => {
              setIsLoading(false);
              if (result.type === 'success') {
                setDiscountApplied(true);
                setMessage('Discount applied automatically!');
                console.log('[ApplyDiscount] Discount code applied (fallback):', discountCode);
              } else {
                setMessage('Sorry, that discount code is not valid.');
                console.error('[ApplyDiscount] Failed to apply discount:', result.message);
              }
            })
            .catch((error) => {
              setIsLoading(false);
              setMessage('Failed to apply discount.');
              console.error('[ApplyDiscount] Error applying discount:', error);
            });
        }
      } else {
        console.log('[ApplyDiscount] No discount_code attribute found in attributes');
      }
    } else {
      console.log('[ApplyDiscount] Attributes is not an array or does not exist');
    }
  }, [attributes, discountCodes, applyDiscount, discountApplied]);

  // 6. Don't render anything if discount is applied or no discount code found
  if (discountApplied && !isLoading) {
    return (
      <BlockStack spacing="base">
        <Text>{message}</Text>
      </BlockStack>
    );
  }

  // 7. Show loading state while applying
  if (isLoading) {
    return (
      <BlockStack spacing="base">
        <Spinner size="small" />
        <Text>{message}</Text>
      </BlockStack>
    );
  }

  // 8. Don't render anything if no discount code is available
  return null;
}

