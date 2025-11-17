# ChainTap - Web2 to Web3 Loyalty Bridge

ChainTap is a comprehensive platform that bridges Web2 e-commerce (Shopify) with Web3 blockchain rewards, enabling merchants to mint loyalty tokens on Polkadot Asset Hub when customers make purchases. The platform includes a dashboard for managing contracts, a token marketplace, VIP access controls, and seamless Shopify integration.

## 🎯 Overview

ChainTap enables:
- **Automatic Token Minting**: Customers receive blockchain tokens when they complete purchases
- **Token Marketplace**: Buy, sell, and trade loyalty tokens
- **VIP Access System**: Token-gated access to exclusive products or content
- **Shopify Integration**: Seamless wallet connection and discount codes at checkout
- **Multi-Contract Support**: Manage multiple loyalty programs from a single dashboard

## 🏗️ Architecture

The project consists of several components:

### Core Application (`/app`)
- **Next.js Dashboard**: Main admin interface for managing contracts, viewing activity logs, and configuring token economics
- **API Routes**: Webhook handlers, product management, market operations, and reward processing
- **Database**: PostgreSQL with Prisma ORM for contracts, orders, products, and transactions

### Shopify Extensions

#### Theme Extensions (`/theme-extensions`)
- **Wallet Connector Block**: Liquid theme block for customers to connect their Polkadot wallet
- **Checkout Wallet Extension**: Checkout UI extension for wallet address collection during checkout

#### Checkout UI Extension (`/checkout-ui`)
- **Discount Coupon Extension**: Automatically surfaces discount codes from shop metafields at checkout

### Forwarder Service (`/my-phala-forwarder`)
- **Phala Cloud Forwarder**: Node.js service that processes Shopify orders and mints tokens on Polkadot Asset Hub
- Handles order parsing, wallet extraction, asset creation, and blockchain transactions

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database
- Shopify Partner account and development store
- Polkadot wallet with testnet tokens (for development)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli) installed

### Environment Setup

Create a `.env.local` file in the root directory:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/chainTap

# Shopify OAuth (required for app installation)
SHOPIFY_CLIENT_ID=your_client_id_from_shopify_app_toml
SHOPIFY_CLIENT_SECRET=your_client_secret_from_shopify_partners_dashboard
SHOPIFY_SCOPES=read_products,write_products,read_orders,write_orders
APP_URL=http://localhost:3000

# Shopify Webhooks
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret

# Phala/Phat Contract Forwarder
PHAT_ENDPOINT_URL=https://your-phat-endpoint/forward-order
PHAT_FORWARD_TOKEN=shared-forward-token

# Polkadot/Blockchain (for forwarder)
POLKADOT_WS_URL=wss://westend-asset-hub-rpc.polkadot.io
PHAT_CONTRACT_MNEMONIC=your_mnemonic_phrase
TOKEN_DECIMALS=12

# App API Base URL (for forwarder to communicate with main app)
APP_API_BASE_URL=http://localhost:3000
```

**OAuth Setup:**
1. Get `SHOPIFY_CLIENT_ID` from your `shopify.app.toml` file
2. Get `SHOPIFY_CLIENT_SECRET` from [Shopify Partners Dashboard](https://partners.shopify.com) → Your App → App setup → Client credentials
3. Set `APP_URL` to your app's public URL (e.g., `https://your-domain.com` for production)
4. Ensure redirect URL in `shopify.app.toml` matches: `{APP_URL}/api/auth/callback`

### Database Setup

1. Install dependencies:
```bash
pnpm install
```

2. Run database migrations:
```bash
pnpm prisma migrate dev
```

3. Generate Prisma client:
```bash
pnpm prisma generate
```

### Running the Application

#### Development Mode

**Main Dashboard:**
```bash
pnpm dev
```
Starts the Next.js dashboard at `http://localhost:3000`

**Shopify Extensions:**

Run both extensions simultaneously:
```bash
pnpm dev:shopify
```

Or run individually:
```bash
# Wallet/token-minting extensions only
pnpm dev:wallet

# Discount coupon extension only
pnpm dev:discount
```

**Forwarder Service:**

```bash
cd my-phala-forwarder
pnpm install
pnpm start
```

## 📦 Project Structure

```
chainTap/
├── app/                    # Next.js application
│   ├── api/               # API routes
│   │   ├── shopify/       # Shopify webhook handlers
│   │   ├── products/      # Product token management
│   │   ├── market/        # Token marketplace APIs
│   │   ├── rewards/       # Order reward processing
│   │   └── vip/           # VIP access management
│   ├── page.tsx          # Dashboard homepage
│   ├── products/         # Product management page
│   └── market/           # Marketplace page
├── components/           # React components
│   ├── ui/              # shadcn/ui components
│   └── wallet-provider.tsx
├── checkout-ui/         # Shopify checkout UI extension
│   └── extensions/
│       └── discount-coupon/
├── theme-extensions/     # Shopify theme extensions
│   └── extensions/
│       ├── connect-wallet/
│       └── checkout-wallet/
├── my-phala-forwarder/   # Phala forwarder service
│   ├── server.js        # Express server
│   └── utils/           # Blockchain utilities
├── prisma/              # Database schema and migrations
│   └── schema.prisma
└── lib/                 # Shared utilities
    ├── shopify.ts      # Shopify API client
    └── prisma.ts       # Database client
```

## 🔧 Features

### Dashboard (`/`)
- **Contract Management**: Configure forwarder URLs, token economics, and webhook metadata
- **Activity Logs**: View order processing history and minting status
- **Status Indicators**: Monitor system health and connectivity
- **Endpoint Cards**: Quick access to webhook URLs and forwarder endpoints

### Product Token Management (`/products`)
- Link Shopify products to blockchain assets
- Configure VIP token thresholds
- View token balances and metadata

### Token Marketplace (`/market`)
- List tokens for sale
- Buy tokens from other users
- View your listings and purchase history
- Transfer tokens between wallets

### VIP Access System (`/api/vip`)
- Token-gated access control
- Check token balances for VIP eligibility
- Mark products as VIP-only

### Shopify Integration

#### Webhook Endpoint
- **URL**: `/api/shopify/webhook`
- **Events**: `orders/create`, `orders/paid`
- **Process**: Extracts wallet address from order metafields/attributes and forwards to forwarder service

#### Wallet Collection
- Theme block for customers to connect wallets
- Checkout extension for wallet address input
- Stores wallet addresses in customer metafields

#### Discount Codes
- Checkout UI extension surfaces discount codes from shop metafield `chainTap.discount_codes`
- Format: JSON array with `code`, `label`, and optional `expires_at`

## 🔐 Security

- HMAC verification for Shopify webhooks
- Token-based authentication for forwarder service
- Secure wallet address storage in customer metafields
- Environment variable protection for sensitive credentials

## 📡 Webhook Flow

1. Customer completes purchase with wallet address in order notes/metafields
2. Shopify sends `orders/paid` webhook to `/api/shopify/webhook`
3. Webhook handler extracts wallet address and creates pending reward record
4. Order payload forwarded to Phala forwarder service
5. Forwarder parses order, looks up asset IDs, and mints tokens
6. Transaction hash and status recorded in database
7. Customer receives tokens in their Polkadot wallet

## 🚢 Deployment

### Main Application

Deploy the Next.js app to Vercel, Railway, or similar platform:

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

### Forwarder Service

Deploy to Phala Cloud using Docker:

```bash
cd my-phala-forwarder
docker build -t your-docker-id/shopify-forwarder:latest .
docker push your-docker-id/shopify-forwarder:latest
```

Use Phala Cloud's "Deploy → From Docker Compose" with:

```yaml
services:
  my-forwarder:
    image: your-docker-id/shopify-forwarder:latest
    ports:
      - "3000"
    restart: always
    environment:
      - PHAT_FORWARD_TOKEN=<same-as-in-.env.local>
      - POLKADOT_WS_URL=wss://westend-asset-hub-rpc.polkadot.io
      - PHAT_CONTRACT_MNEMONIC=<your-mnemonic>
      - APP_API_BASE_URL=<your-app-url>
```

Copy the service endpoint URL and set:
```
PHAT_ENDPOINT_URL=<Endpoint URL>/forward-order
```

### Shopify Extensions

Extensions are deployed automatically when you run `shopify app deploy` from their respective directories.

## 🧪 Testing

### Sample Webhook Payload

See `public/docs/sample-shopify-order.json` for a sample `orders/create` payload including a Polkadot SS58 address.

### Manual Testing

1. **Test Webhook**: Use Shopify Admin → Settings → Notifications → Webhooks → "Send test notification"
2. **Test Minting**: Use `/api/mint/manual` endpoint with asset ID and wallet address
3. **Test Marketplace**: Create listings and test buy/sell flows

## 📚 API Reference

### Key Endpoints

- `POST /api/shopify/webhook` - Shopify order webhook handler
- `GET /api/products/tokens` - List product tokens
- `POST /api/products/[productId]/token` - Create product token
- `GET /api/market/listings` - Get active token listings
- `POST /api/market/listings` - Create new listing
- `POST /api/market/listings/[listingId]/buy` - Purchase tokens
- `GET /api/vip/token/balance` - Check VIP token balance
- `POST /api/rewards` - Record order reward status

### Forwarder Endpoints

- `POST /forward-order` - Process Shopify order and mint tokens
- `POST /mint` - Direct mint endpoint (bypasses order parsing)
- `GET /balance` - Check forwarder wallet balance
- `GET /asset/:assetId/permissions` - Check asset permissions
- `POST /assets/create` - Create new asset on-chain

## 🛠️ Development

### Adding New Features

1. **Database Changes**: Update `prisma/schema.prisma` and run migrations
2. **API Routes**: Add new routes in `app/api/`
3. **Components**: Create reusable components in `components/`
4. **Shopify Extensions**: Modify extension code in `checkout-ui/` or `theme-extensions/`

### Code Style

- TypeScript for type safety
- Tailwind CSS for styling (following existing design system)
- Prisma for database access
- React Server Components where possible

## 📝 License

[Add your license here]

## 🤝 Contributing

[Add contribution guidelines here]

## 📞 Support

[Add support contact information here]
