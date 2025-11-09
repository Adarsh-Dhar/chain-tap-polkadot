# chain-tap

## Shopify Webhook → Phat Contract

This app exposes a public webhook endpoint for Shopify `orders/create` events and forwards the payload to a Phat Contract URL.

### Environment

Create `.env.local` with (or copy `phala.env.example` and fill values):

```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/chainTap

# Shopify OAuth (required for app installation)
SHOPIFY_CLIENT_ID=your_client_id_from_shopify_app_toml
SHOPIFY_CLIENT_SECRET=your_client_secret_from_shopify_partners_dashboard
SHOPIFY_SCOPES=read_products  # comma-separated scopes
APP_URL=http://localhost:3000  # or your production URL

# Shopify Webhooks
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret

# Phala/Phat Contract
PHAT_ENDPOINT_URL=https://your-phat-endpoint
PHAT_FORWARD_TOKEN=shared-forward-token
```

**OAuth Setup:**
1. Get `SHOPIFY_CLIENT_ID` from your `shopify.app.toml` file (already configured)
2. Get `SHOPIFY_CLIENT_SECRET` from your Shopify Partners dashboard:
   - Go to https://partners.shopify.com
   - Select your app
   - Go to "App setup" → "Client credentials"
   - Copy the "Client secret"
3. Set `APP_URL` to your app's public URL (e.g., `https://your-domain.com` for production)
4. Ensure the redirect URL in `shopify.app.toml` matches: `{APP_URL}/api/auth/callback`

### Endpoint

- Webhook URL: `/api/shopify/webhook`
- Expects headers: `X-Shopify-Hmac-Sha256`, `X-Shopify-Topic: orders/create`
- Verifies HMAC and forwards JSON payload to `PHAT_ENDPOINT_URL` with header `x-forward-token: PHAT_FORWARD_TOKEN`.

### Shopify Setup (Merchant)

1. Shopify Admin → Settings → Notifications → Webhooks
2. Create webhook
   - Event: Order creation
   - URL: `<your-domain>/api/shopify/webhook`
   - Format: JSON

Use “Send test notification” to validate.

### Sample Payload

See `docs/sample-shopify-order.json` for a sample `orders/create` payload including a Polkadot SS58 address in the `note` field.

## MintHook Dashboard

- Visit `/settings` to manage a single contract’s forwarder URL, token economics, and webhook metadata.
- The page auto-detects the active contract (from the query string, local storage, or the first contract in the database).
- Use the copy buttons to share the Shopify webhook URL or the hosted Phat forwarder URL with merchants.
- `Send sample webhook` pushes the bundled example payload through the live bridge for a quick smoke test.

### Rosie’s Roasters Example Flow

1. Rosie signs in to MintHook, reviews the `BEAN-Token` (ID 1234) and copies the Shopify webhook URL.
2. Alice places an order and pastes her wallet address into the order notes.
3. Shopify calls MintHook’s `/api/shopify/webhook/{contractId}` endpoint.
4. The hosted forwarder extracts the wallet, applies the “10 tokens per order” rule, and signs `Assets.mint(1234, Alice, 10)`.
5. Alice opens her Polkadot wallet and sees 10 BEAN-Tokens credited instantly.

## Phala Cloud Forwarder

This repo includes a minimal forwarder you can deploy to Phala Cloud:

- Directory: `my-phala-forwarder/`
- Files: `package.json`, `server.js`, `Dockerfile`

### Build & Push (Docker Hub)

```
cd my-phala-forwarder
npm install
docker build -t YOUR_DOCKER_ID/shopify-forwarder:latest .
docker login
docker push YOUR_DOCKER_ID/shopify-forwarder:latest
```

### Deploy (Phala Cloud)

Use “Deploy → From Docker Compose” with:

```
services:
  my-forwarder:
    image: YOUR_DOCKER_ID/shopify-forwarder:latest
    ports:
      - "3000"
    restart: always
    environment:
      - PHAT_FORWARD_TOKEN=<same-as-in-.env.local>
```

Copy service Endpoint URL from the Network tab, then set:

```
PHAT_ENDPOINT_URL=<Endpoint URL>/forward-order
```


### Westend Asset Hub (Testnet)

The forwarder connects by default to Westend Asset Hub via:

```
POLKADOT_WS_URL=wss://westend-asset-hub-rpc.polkadot.io
```

To create and manage assets permissionlessly on testnet, fund the signer (from `PHAT_CONTRACT_MNEMONIC` or `PHAT_CONTRACT_SEED`) with WND from a faucet to cover deposits/fees. You can override the endpoint by setting `POLKADOT_WS_URL` in your environment or compose file.
# chain-tap-polkadot
