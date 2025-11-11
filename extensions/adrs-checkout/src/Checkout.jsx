import '@shopify/ui-extensions/preact';

export default function Extension() {
  try {
    console.log('[adrs-checkout] Extension component rendering...');
    
    // Try to access Shopify extension API
    let orderData = { status: 'SUCCESS' };
    
    try {
      // Check if shopify global is available
      if (typeof shopify !== 'undefined' && shopify.orderConfirmation) {
        console.log('[adrs-checkout] Order confirmation available');
        const orderConfirmation = shopify.orderConfirmation;
        
        // Log the full orderConfirmation object to see its structure
        console.log('[adrs-checkout] OrderConfirmation object:', orderConfirmation);
        console.log('[adrs-checkout] OrderConfirmation keys:', Object.keys(orderConfirmation));
        
        // Access the value property (Preact signal)
        // @ts-ignore
        const orderConfirmationValue = orderConfirmation.value || orderConfirmation.v || orderConfirmation;
        console.log('[adrs-checkout] OrderConfirmation value:', orderConfirmationValue);
        
        // Extract order number from the value
        // @ts-ignore
        const orderNumber = orderConfirmationValue.number;
        if (orderNumber) {
          orderData.confirmationId = orderNumber.toString();
          console.log('[adrs-checkout] Extracted orderNumber:', orderData.confirmationId);
        }
        
        // Access order data from the value
        // @ts-ignore
        const order = orderConfirmationValue.order || null;
        
        if (order) {
          console.log('[adrs-checkout] Order found! Order data:', order);
          console.log('[adrs-checkout] Order keys:', Object.keys(order));
          
          // Extract order ID (confirmation number) - use orderNumber if we already have it
          if (order.id && !orderData.confirmationId) {
            const orderIdStr = order.id.toString();
            // Extract just the order number (e.g., "gid://shopify/Order/123" -> "123")
            const match = orderIdStr.match(/\/(\d+)$/);
            orderData.confirmationId = match ? match[1] : orderIdStr;
            console.log('[adrs-checkout] Extracted confirmationId from order.id:', orderData.confirmationId);
          }
          
          // Extract line items - try multiple formats
          // @ts-ignore
          const lineItems = order.lineItems || order.lineItemsConnection?.edges || [];
          console.log('[adrs-checkout] Line items:', lineItems);
          console.log('[adrs-checkout] Line items length:', lineItems?.length);
          
          if (lineItems && lineItems.length > 0) {
            // Handle GraphQL connection format
            // @ts-ignore
            const firstItem = lineItems[0]?.node || lineItems[0];
            console.log('[adrs-checkout] First line item:', firstItem);
            console.log('[adrs-checkout] First line item keys:', Object.keys(firstItem || {}));
            
            // Extract variant ID (asset ID)
            if (firstItem.variant?.id) {
              const variantIdStr = firstItem.variant.id.toString();
              const match = variantIdStr.match(/\/(\d+)$/);
              orderData.assetId = match ? match[1] : variantIdStr;
              orderData.asset_id = orderData.assetId;
              console.log('[adrs-checkout] Extracted assetId:', orderData.assetId);
            }
            
            // Extract quantity
            if (firstItem.quantity) {
              orderData.quantity = firstItem.quantity.toString();
              console.log('[adrs-checkout] Extracted quantity:', orderData.quantity);
            }
            
            // Extract title
            if (firstItem.title) {
              orderData.title = firstItem.title;
              console.log('[adrs-checkout] Extracted title:', orderData.title);
            }
            
            // Extract price
            if (firstItem.variant?.price) {
              orderData.price = firstItem.variant.price.toString();
              console.log('[adrs-checkout] Extracted price:', orderData.price);
            }
          }
          
          // Extract total price
          // @ts-ignore
          if (order.totalPrice) {
            // @ts-ignore
            orderData.total = order.totalPrice.toString();
            console.log('[adrs-checkout] Extracted total:', orderData.total);
          }
          
          // Extract currency
          // @ts-ignore
          if (order.currencyCode) {
            // @ts-ignore
            orderData.currency = order.currencyCode;
            console.log('[adrs-checkout] Extracted currency:', orderData.currency);
          }
        } else {
          console.warn('[adrs-checkout] Order is null/undefined. OrderConfirmation value structure:', orderConfirmationValue);
          console.warn('[adrs-checkout] OrderConfirmation value keys:', Object.keys(orderConfirmationValue || {}));
        }
      } else {
        console.warn('[adrs-checkout] Order confirmation not available');
      }
    } catch (apiErr) {
      console.error('[adrs-checkout] Error accessing Shopify API:', apiErr);
    }

    // Fallback to URL params
    try {
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const provided = params.get('status');
      if (provided && (provided.toUpperCase() === 'SUCCESS' || provided.toUpperCase() === 'FAILURE')) {
        orderData.status = provided.toUpperCase();
      }

      const keys = ['confirmationId', 'assetId', 'asset_id', 'quantity', 'title', 'price', 'total', 'currency'];
      keys.forEach((key) => {
        const value = params.get(key);
        if (value != null && value !== '' && !orderData[key]) {
          orderData[key] = value;
        }
      });
    } catch (urlErr) {
      console.error('[adrs-checkout] Error reading URL params:', urlErr);
    }

    console.log('[adrs-checkout] Final order data:', orderData);

    const baseUrl = 'http://localhost:3000/products';
    const params = new URLSearchParams();
    if (orderData.confirmationId) params.set('confirmationId', orderData.confirmationId);
    if (orderData.assetId) params.set('assetId', orderData.assetId);
    if (orderData.asset_id) params.set('asset_id', orderData.asset_id);
    if (orderData.quantity) params.set('quantity', orderData.quantity);
    if (orderData.title) params.set('title', orderData.title);
    if (orderData.price) params.set('price', orderData.price);
    if (orderData.total) params.set('total', orderData.total);
    if (orderData.currency) params.set('currency', orderData.currency);
    const targetUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;

    const confId = orderData.confirmationId || 'N/A';
    const assetId = orderData.assetId || orderData.asset_id || 'N/A';
    const qty = orderData.quantity || 'N/A';
    const title = orderData.title || 'N/A';
    const price = orderData.price || 'N/A';
    const total = orderData.total || 'N/A';
    const currency = orderData.currency || 'N/A';

    console.log('[adrs-checkout] Rendering with:', { confId, assetId, qty, title, price, total, currency });

    // Simple render - test if this works
    return (
      <s-stack gap="base" padding="base">
        <s-text>SUCCESS</s-text>
        <s-text>Thanks for your purchase!</s-text>
        <s-text>Confirmation: {confId}</s-text>
        <s-text>Asset: {assetId}</s-text>
        <s-text>Qty: {qty}</s-text>
        <s-text>Title: {title}</s-text>
        <s-text>Price: {price}</s-text>
        <s-text>Total: {total}</s-text>
        <s-text>Currency: {currency}</s-text>
        <s-link href={targetUrl}>Continue to Products</s-link>
      </s-stack>
    );
  } catch (err) {
    console.error('[adrs-checkout] Render error:', err);
    console.error('[adrs-checkout] Error stack:', err.stack);
    return (
      <s-stack gap="base" padding="base">
        <s-text>Error: {String(err.message || err)}</s-text>
      </s-stack>
    );
  }
}
