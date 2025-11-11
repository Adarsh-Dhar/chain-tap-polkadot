import '@shopify/ui-extensions/preact';
import {render} from 'preact';

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const targetUrl = 'http://localhost:3000/products';

  return (
    <s-stack
      gap="base"
      alignItems="center"
      justifyContent="center"
      padding="base"
    >
      <s-text>
        Thanks for your purchase! Continue to products to keep trading headline tokens.
      </s-text>
      <s-link
        href={targetUrl}
        target="_blank"
      >
        Continue to Magical Headlines
      </s-link>
    </s-stack>
  );
}
