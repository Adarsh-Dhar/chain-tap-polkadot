# chain-tap

## Shopify Webhook → Phat Contract

This app exposes a public webhook endpoint for Shopify `orders/create` events and forwards the payload to a Phat Contract URL.

### Environment

Create `.env.local` with (or copy `phala.env.example` and fill values):

```
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret
PHAT_ENDPOINT_URL=https://your-phat-endpoint
PHAT_FORWARD_TOKEN=shared-forward-token
```

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
