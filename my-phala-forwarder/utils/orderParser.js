/**
 * Order Parser Utility
 * Extracts and validates data from Shopify order JSON
 */

/**
 * Validates wallet address format (Ethereum 0x... or Polkadot SS58)
 * @param {string} address - Wallet address to validate
 * @returns {boolean}
 */
function isValidWalletAddress(address) {
  if (!address || typeof address !== 'string') {
    return false;
  }
  const val = address.trim();
  // Ethereum address: 0x followed by 40 hex chars
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  if (ethAddressRegex.test(val)) return true;

  // Basic SS58 check (48 chars typical, base58 chars, starts not with 0)
  // This is a heuristic. For production, prefer @polkadot/util-crypto isAddress.
  const base58 = /^[1-9A-HJ-NP-Za-km-z]+$/;
  if (val.length >= 47 && val.length <= 49 && base58.test(val)) {
    return true;
  }
  return false;
}

/**
 * Extracts wallet address from multiple possible locations in Shopify order
 * @param {object} order - Shopify order JSON object
 * @returns {string|null} - Wallet address if found, null otherwise
 */
function extractWalletAddress(order) {
  if (!order) return null;

  // Try 1: note_attributes (custom fields)
  if (order.note_attributes && Array.isArray(order.note_attributes)) {
    const walletAttr = order.note_attributes.find(
      attr => attr.name === 'wallet_address' || 
              attr.name === 'wallet' || 
              attr.name === 'walletAddress' ||
              attr.name?.toLowerCase() === 'wallet'
    );
    if (walletAttr?.value) {
      const address = walletAttr.value.trim();
      if (isValidWalletAddress(address)) {
        return address;
      }
    }
  }

  // Try 2: customer.note
  if (order.customer?.note) {
    const noteMatch = order.customer.note.match(/[1-9A-HJ-NP-Za-km-z]{47,49}|0x[a-fA-F0-9]{40}/);
    if (noteMatch) {
      const address = noteMatch[0];
      if (isValidWalletAddress(address)) {
        return address;
      }
    }
  }

  // Try 3: order note
  if (order.note) {
    const noteMatch = order.note.match(/[1-9A-HJ-NP-Za-km-z]{47,49}|0x[a-fA-F0-9]{40}/);
    if (noteMatch) {
      const address = noteMatch[0];
      if (isValidWalletAddress(address)) {
        return address;
      }
    }
  }

  // Try 4: metafields (if available)
  if (order.metafields && Array.isArray(order.metafields)) {
    const walletMetafield = order.metafields.find(
      field => field.key === 'wallet_address' || 
               field.key === 'wallet' ||
               field.namespace === 'customer' && field.key === 'wallet'
    );
    if (walletMetafield?.value) {
      const address = walletMetafield.value.trim();
      if (isValidWalletAddress(address)) {
        return address;
      }
    }
  }

  // Try 5: customer metafields
  if (order.customer?.metafields && Array.isArray(order.customer.metafields)) {
    const walletMetafield = order.customer.metafields.find(
      field => field.key === 'wallet_address' || field.key === 'wallet'
    );
    if (walletMetafield?.value) {
      const address = walletMetafield.value.trim();
      if (isValidWalletAddress(address)) {
        return address;
      }
    }
  }

  return null;
}

/**
 * Extracts order total and currency
 * @param {object} order - Shopify order JSON object
 * @returns {object} - { total: number, currency: string }
 */
function extractOrderTotal(order) {
  if (!order) {
    return { total: 0, currency: 'USD' };
  }

  const total = parseFloat(order.total_price || order.total_price_set?.shop_money?.amount || '0.00');
  const currency = order.currency || order.total_price_set?.shop_money?.currency_code || 'USD';

  return {
    total: isNaN(total) ? 0 : total,
    currency: currency || 'USD'
  };
}

/**
 * Extracts customer email
 * @param {object} order - Shopify order JSON object
 * @returns {string|null} - Customer email if found
 */
function extractCustomerEmail(order) {
  if (!order) return null;

  return order.email || 
         order.customer?.email || 
         order.contact_email || 
         null;
}

/**
 * Extracts line items (products) from order
 * @param {object} order - Shopify order JSON object
 * @returns {Array} - Array of line items with product details
 */
function extractLineItems(order) {
  if (!order || !Array.isArray(order.line_items)) {
    return [];
  }

  return order.line_items.map(item => ({
    title: item.title || item.name || 'Unknown Product',
    quantity: parseInt(item.quantity || 1, 10),
    price: parseFloat(item.price || '0.00'),
    variantId: item.variant_id || null,
    productId: item.product_id || null,
    sku: item.sku || null,
    variantTitle: item.variant_title || null,
    assetId: extractAssetId(item)
  }));
}

/**
 * Extract asset ID from line item properties
 * @param {object} item - Shopify line item
 * @returns {number|null}
 */
function extractAssetId(item) {
  if (!item) {
    return null;
  }

  // Try 1: properties array (from cart attributes converted to order properties)
  if (Array.isArray(item.properties)) {
    const assetProperty = item.properties.find(
      prop => {
        const name = String(prop?.name || '').toLowerCase().trim();
        return name === 'asset_id' || 
               name === 'assetid' ||
               name === 'asset-id' ||
               name === 'asset id';
      }
    );

    if (assetProperty && assetProperty.value != null) {
      const value = String(assetProperty.value).trim();
      const parsed = parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        console.log(`✓ Found asset ID ${parsed} in properties for item: ${item.title || item.name}`);
        return parsed;
      }
    }
  }

  // Try 2: variant properties (if cart attributes are stored differently)
  if (item.variant && Array.isArray(item.variant.properties)) {
    const assetProperty = item.variant.properties.find(
      prop => {
        const name = String(prop?.name || '').toLowerCase().trim();
        return name === 'asset_id' || name === 'assetid';
      }
    );

    if (assetProperty && assetProperty.value != null) {
      const value = String(assetProperty.value).trim();
      const parsed = parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        console.log(`✓ Found asset ID ${parsed} in variant properties for item: ${item.title || item.name}`);
        return parsed;
      }
    }
  }

  // Try 3: metafields (if asset ID is stored as metafield)
  if (item.metafields && Array.isArray(item.metafields)) {
    const assetMetafield = item.metafields.find(
      field => {
        const key = String(field?.key || '').toLowerCase();
        return key === 'asset_id' || key === 'assetid';
      }
    );

    if (assetMetafield && assetMetafield.value != null) {
      const value = String(assetMetafield.value).trim();
      const parsed = parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        console.log(`✓ Found asset ID ${parsed} in metafields for item: ${item.title || item.name}`);
        return parsed;
      }
    }
  }

  // Debug: log if no asset ID found
  console.log(`⚠️ No asset ID found for item: ${item.title || item.name || 'Unknown'}`);
  if (item.properties && Array.isArray(item.properties) && item.properties.length > 0) {
    console.log(`   Available properties:`, item.properties.map(p => `${p.name}=${p.value}`).join(', '));
  }

  return null;
}

/**
 * Main function to parse Shopify order
 * @param {object} order - Shopify order JSON object
 * @returns {object} - Parsed order data
 */
function parseOrder(order) {
  if (!order) {
    throw new Error('Order data is required');
  }

  const orderId = order.id || order.order_id || null;
  if (!orderId) {
    throw new Error('Order ID is required');
  }

  const walletAddress = extractWalletAddress(order);
  const { total, currency } = extractOrderTotal(order);
  const customerEmail = extractCustomerEmail(order);
  const lineItems = extractLineItems(order);

  return {
    orderId,
    customerEmail,
    walletAddress,
    orderTotal: total,
    currency,
    items: lineItems,
    timestamp: new Date().toISOString(),
    rawOrder: order // Keep reference to original order for debugging
  };
}

module.exports = {
  parseOrder,
  extractWalletAddress,
  extractOrderTotal,
  extractCustomerEmail,
  extractLineItems,
  isValidWalletAddress
};

