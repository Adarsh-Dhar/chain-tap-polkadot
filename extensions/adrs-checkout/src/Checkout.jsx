import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import '@shopify/ui-extensions/checkout';

// This is the standard entry point for the extension
export default function extension() {
  // This line tells Preact to find your <App> component and render it
  render(<App />, document.body);
}

// This is your actual component
function App() {
  // Use "state" to store your data
  // When state changes, the component will re-render
  const [confId, setConfId] = useState('Loading...');
  const [targetUrl, setTargetUrl] = useState('http://localhost:3000/products');

  // Use "useEffect" to run your data-fetching logic once
  useEffect(() => {
    let confirmationId = null;

    try {
      if (typeof shopify !== 'undefined' && shopify.orderConfirmation) {
        // Access the value property (Preact signal)
        // @ts-ignore
        const orderConfirmationValue = shopify.orderConfirmation.value || shopify.orderConfirmation.v || shopify.orderConfirmation;
        // @ts-ignore
        const orderNumber = orderConfirmationValue.number;
        
        if (orderNumber) {
          confirmationId = String(orderNumber);
          console.log('[adrs-checkout] Extracted confirmationId from API:', confirmationId);
        }
      }
      
      // Fallback if the API object isn't ready
      if (!confirmationId) {
        const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
        confirmationId = params.get('confirmationId');
        if (confirmationId) {
          console.log('[adrs-checkout] Extracted confirmationId from URL:', confirmationId);
        }
      }
    } catch (err) {
      console.error('[adrs-checkout] Error:', err);
    }

    // Set the state with your final values
    const finalId = confirmationId ? String(confirmationId) : 'N/A';
    const finalUrl = confirmationId 
      ? `http://localhost:3000/products?confirmationId=${encodeURIComponent(confirmationId)}` 
      : 'http://localhost:3000/products';

    setConfId(finalId);
    setTargetUrl(finalUrl);
    console.log('[adrs-checkout] Final confirmationId:', finalId);
    console.log('[adrs-checkout] Final Target URL:', finalUrl);
  }, []); // The empty [] array ensures this runs only once

  // Your component renders, now with the correct data
  console.log('[adrs-checkout] Rendering component with confId:', confId);

  return (
    <s-stack gap="base" padding="base" border="base" borderRadius="base">
      <s-text>SUCCESS</s-text>
      <s-text>Thanks for your purchase!</s-text>
      <s-text>Order: {confId}</s-text>
      <s-link href={targetUrl} target="_blank">
        Continue to Magical Headlines
      </s-link>
    </s-stack>
  );
}
