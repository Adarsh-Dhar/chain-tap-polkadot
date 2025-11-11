import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  // Determine status from URL param `status`; default to SUCCESS on thank-you page
  let status = 'SUCCESS';
  /** @type {Record<string, string>} */
  let forwardedParams = {};
  try {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const provided = params.get('status');
    if (provided && (provided.toUpperCase() === 'SUCCESS' || provided.toUpperCase() === 'FAILURE')) {
      status = provided.toUpperCase();
    }

    const keys = [
      'confirmationId',
      'assetId',
      'asset_id',
      'quantity',
      'title',
      'price',
      'total',
      'currency',
    ];
    /** @type {Record<string, string>} */
    const collected = {};
    keys.forEach((key) => {
      const value = params.get(key);
      if (value != null && value !== '') {
        collected[key] = value;
      }
    });
    forwardedParams = collected;

    // Diagnostics after URL param collection
    try {
      console.log('[adrs-checkout] URL params collected:', {
        confirmationId: forwardedParams.confirmationId,
        assetId: forwardedParams.assetId,
        asset_id: forwardedParams.asset_id,
        quantity: forwardedParams.quantity,
        title: forwardedParams.title,
        price: forwardedParams.price,
        total: forwardedParams.total,
        currency: forwardedParams.currency,
      });
    } catch {}

    // Fallbacks: scrape visible page text if URL lacks values
    const pageText =
      typeof document !== 'undefined' && document.body && document.body.innerText
        ? document.body.innerText
        : '';

    // Confirmation ID (e.g., "Confirmation #XNX55IFQA")
    if (!forwardedParams.confirmationId && pageText) {
      const match = pageText.match(/Confirmation\s*#\s*([A-Z0-9]+)/i);
      if (match && match[1]) {
        forwardedParams.confirmationId = match[1];
      }
    }

    // Asset IDs: support "asset_id: 50000305" or "assetId: 50000305"
    if ((!forwardedParams.asset_id || !forwardedParams.assetId) && pageText) {
      const assetMatch = pageText.match(/asset[_\s-]*id:\s*(\d+)/i);
      if (assetMatch && assetMatch[1]) {
        if (!forwardedParams.asset_id) forwardedParams.asset_id = assetMatch[1];
        if (!forwardedParams.assetId) forwardedParams.assetId = assetMatch[1];
      }
    }

    // Quantity (e.g., "Quantity\n1" or "Quantity 1")
    if (!forwardedParams.quantity && pageText) {
      const qtyMatch = pageText.match(/Quantity[\s:]*([\d]+)/i);
      if (qtyMatch && qtyMatch[1]) {
        forwardedParams.quantity = qtyMatch[1];
      }
    }

    // Title: heuristic - look for a reasonable non-numeric, non-price line near "Quantity"
    if (!forwardedParams.title && pageText) {
      const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);
      const qtyIdx = lines.findIndex(l => /^Quantity$/i.test(l));
      if (qtyIdx !== -1) {
        for (let i = qtyIdx + 1; i < Math.min(lines.length, qtyIdx + 6); i++) {
          const line = lines[i];
          const looksPrice = /\$\s*\d/.test(line);
          const looksId = /asset[_\s-]*id/i.test(line);
          const looksNumberOnly = /^\d+$/.test(line);
          if (!looksPrice && !looksId && !looksNumberOnly && line.length > 1) {
            forwardedParams.title = line;
            break;
          }
        }
      }
    }

    // Price/Total: prefer Total if present, otherwise first price
    if ((!forwardedParams.total || !forwardedParams.price) && pageText) {
      const totalSectionMatch = pageText.match(/Total[\s\S]*?\$[\s]*([\d,]+\.\d{2})/i);
      const priceMatches = pageText.match(/\$[\s]*([\d,]+\.\d{2})/g);
      if (!forwardedParams.total && totalSectionMatch) {
        const m = totalSectionMatch[0].match(/\$[\s]*([\d,]+\.\d{2})/);
        if (m && m[1]) {
          forwardedParams.total = m[1].replace(/,/g, '');
        }
      }
      if (!forwardedParams.price && priceMatches) {
        const firstPrice = priceMatches[0].match(/\$[\s]*([\d,]+\.\d{2})/);
        if (firstPrice && firstPrice[1]) {
          forwardedParams.price = firstPrice[1].replace(/,/g, '');
        }
      }
    }

    // Currency: infer from explicit token or presence of '$'
    if (!forwardedParams.currency && pageText) {
      const currencyMatch = pageText.match(/\b(USD|EUR|GBP|AUD|CAD|INR|JPY|CNY)\b/i);
      if (currencyMatch && currencyMatch[1]) {
        forwardedParams.currency = currencyMatch[1].toUpperCase();
      } else if (/\$/.test(pageText)) {
        forwardedParams.currency = 'USD';
      }
    }

    // Diagnostics after scraping fallbacks
    try {
      console.log('[adrs-checkout] Final forwardedParams after fallbacks:', {
        confirmationId: forwardedParams.confirmationId,
        assetId: forwardedParams.assetId,
        asset_id: forwardedParams.asset_id,
        quantity: forwardedParams.quantity,
        title: forwardedParams.title,
        price: forwardedParams.price,
        total: forwardedParams.total,
        currency: forwardedParams.currency,
      });
    } catch {}
  } catch {
    // default to SUCCESS
  }

  const baseUrl = 'http://localhost:3000/products';
  const search = new URLSearchParams(Object.entries(forwardedParams)).toString();
  const targetUrl = search ? `${baseUrl}?${search}` : baseUrl;

  // Final link diagnostics
  try {
    console.log('[adrs-checkout] targetUrl:', targetUrl);
  } catch {}

  const labelMap = {
    confirmationId: 'Confirmation ID',
    assetId: 'Asset ID',
    asset_id: 'Asset ID (legacy)',
    quantity: 'Quantity',
    title: 'Title',
    price: 'Price',
    total: 'Total',
    currency: 'Currency',
  };
  // Build a full details list so everything renders, even if missing
  const details = Object.entries(labelMap).map(([key, label]) => {
    const value = forwardedParams[key] || 'N/A';
    return {label, value};
  });
  const hrefStr = (typeof window !== 'undefined' && window.location && window.location.href) ? window.location.href : '';
  const searchStr = (typeof window !== 'undefined' && window.location) ? window.location.search : '';

  return (
    <s-stack
      gap="base"
      alignItems="center"
      justifyContent="center"
      padding="base"
    >
      <s-text>
        {status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE'}
      </s-text>
      <s-text>
        Thanks for your purchase! Continue to products to keep trading headline tokens.
      </s-text>
      <s-stack
        gap="base"
        alignItems="center"
      >
        <s-text>URL: {hrefStr || 'N/A'}</s-text>
        <s-text>Query: {searchStr || 'N/A'}</s-text>
        {details.map(({label, value}) => (
          <s-text key={label}>
            {label}: {value}
          </s-text>
        ))}
      </s-stack>
      <s-link
        href={targetUrl}
        target="_blank"
      >
        Continue to Magical Headlines
      </s-link>
    </s-stack>
  );
}
