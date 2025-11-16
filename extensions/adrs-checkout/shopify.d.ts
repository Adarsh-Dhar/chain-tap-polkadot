import '@shopify/ui-extensions';

// Type definitions for Shopify UI Extension custom elements
// Using global namespace to extend JSX for both React and Preact compatibility
declare global {
  namespace JSX {
    interface IntrinsicElements {
      's-stack': {
        gap?: string;
        padding?: string;
        border?: string;
        borderRadius?: string;
        background?: string;
        alignItems?: string;
        justifyContent?: string;
        children?: any;
      };
      's-text': {
        size?: string;
        emphasis?: string;
        appearance?: string;
        children?: any;
      };
      's-block-spacer': {
        spacing?: string;
      };
      's-button': {
        kind?: string;
        onPress?: () => void;
        children?: any;
      };
      's-link': {
        href?: string;
        target?: string;
        children?: any;
      };
    }
  }
}

// Extend Preact's JSX namespace
declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      's-stack': {
        gap?: string;
        padding?: string;
        border?: string;
        borderRadius?: string;
        background?: string;
        alignItems?: string;
        justifyContent?: string;
        children?: any;
      };
      's-text': {
        size?: string;
        emphasis?: string;
        appearance?: string;
        children?: any;
      };
      's-block-spacer': {
        spacing?: string;
      };
      's-button': {
        kind?: string;
        onPress?: () => void;
        children?: any;
      };
      's-link': {
        href?: string;
        target?: string;
        children?: any;
      };
    }
  }
}

//@ts-ignore
declare module './src/Checkout.jsx' {
  const shopify: import('@shopify/ui-extensions/purchase.thank-you.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/ApplyDiscount.jsx' {
  const shopify: import('@shopify/ui-extensions/purchase.checkout.block.render').Api;
  const globalThis: { shopify: typeof shopify };
}
