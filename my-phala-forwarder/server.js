// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const { parseOrder, isValidWalletAddress } = require('./utils/orderParser');
const { initPolkadot, mintAndTransferTokens, getWalletBalance, checkAssetPermissions } = require('./utils/blockchain');
const { createAssetIfMissing, getSignerAddress } = require('./utils/asset');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const PHAT_FORWARD_TOKEN = process.env.PHAT_FORWARD_TOKEN;

// Check wallet balance endpoint
app.get('/balance', async (req, res) => {
  const receivedToken = req.headers['x-forward-token'];
  if (!PHAT_FORWARD_TOKEN || receivedToken !== PHAT_FORWARD_TOKEN) {
    console.error('Unauthorized: Token mismatch', {
      hasEnvToken: !!PHAT_FORWARD_TOKEN,
      receivedTokenLength: receivedToken?.length,
      envTokenLength: PHAT_FORWARD_TOKEN?.length
    });
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  try {
    await initPolkadot();
    const balance = await getWalletBalance();
    return res.status(200).json({ status: 'success', ...balance });
  } catch (e) {
    console.error('Balance check error:', e);
    return res.status(500).json({ status: 'error', message: e.message });
  }
});

// Check asset permissions endpoint
app.get('/asset/:assetId/permissions', async (req, res) => {
  const receivedToken = req.headers['x-forward-token'];
  if (!PHAT_FORWARD_TOKEN || receivedToken !== PHAT_FORWARD_TOKEN) {
    console.error('Unauthorized: Token mismatch', {
      hasEnvToken: !!PHAT_FORWARD_TOKEN,
      receivedTokenLength: receivedToken?.length,
      envTokenLength: PHAT_FORWARD_TOKEN?.length
    });
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  try {
    const assetId = parseInt(req.params.assetId, 10);
    if (isNaN(assetId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid asset ID' });
    }
    await initPolkadot();
    const permissions = await checkAssetPermissions(assetId);
    return res.status(200).json({ status: 'success', ...permissions });
  } catch (e) {
    console.error('Asset permission check error:', e);
    return res.status(500).json({ status: 'error', message: e.message });
  }
});
// Create asset for a merchant (auto-setup)
app.post('/assets/create', async (req, res) => {
  const receivedToken = req.headers['x-forward-token'];
  if (!PHAT_FORWARD_TOKEN || receivedToken !== PHAT_FORWARD_TOKEN) {
    console.error('Unauthorized: Token mismatch', {
      hasEnvToken: !!PHAT_FORWARD_TOKEN,
      receivedTokenLength: receivedToken?.length,
      envTokenLength: PHAT_FORWARD_TOKEN?.length,
      tokensMatch: receivedToken === PHAT_FORWARD_TOKEN
    });
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  try {
    const { assetId, name, symbol, decimals, minBalance } = req.body || {};
    await initPolkadot();
    const signer = getSignerAddress();
    const id = await createAssetIfMissing(
      assetId,
      {
        name: name || 'Loyalty Token',
        symbol: symbol || 'LOYAL',
        decimals: typeof decimals === 'number' ? decimals : parseInt(process.env.TOKEN_DECIMALS || '12', 10),
        minBalance: typeof minBalance === 'number' ? minBalance : 1,
      }
    );
    return res.status(200).json({ status: 'success', assetId: id, signerAddress: signer });
  } catch (e) {
    console.error('Asset creation error:', e);
    return res.status(500).json({ status: 'error', message: e.message });
  }
});


app.post('/forward-order', async (req, res) => {
  // Validate authentication token
  const receivedToken = req.headers['x-forward-token'];
  if (!PHAT_FORWARD_TOKEN || receivedToken !== PHAT_FORWARD_TOKEN) {
    console.error('Unauthorized: Token mismatch', {
      hasEnvToken: !!PHAT_FORWARD_TOKEN,
      receivedTokenLength: receivedToken?.length,
      envTokenLength: PHAT_FORWARD_TOKEN?.length,
      tokensMatch: receivedToken === PHAT_FORWARD_TOKEN
    });
    return res.status(401).json({ 
      status: 'error', 
      message: 'Unauthorized: Invalid forward token' 
    });
  }

  const shopifyOrder = req.body;
  const contractIdHeader = req.headers['x-contract-id'];

  try {
    // Parse the Shopify order JSON
    console.log('=== Processing Shopify Order ===');
    console.log('Order ID:', shopifyOrder?.id);
    
    const parsedData = parseOrder(shopifyOrder);

    // Validate parsed data
    if (!parsedData.orderId) {
      throw new Error('Order ID is missing');
    }

    if (parsedData.orderTotal <= 0) {
      console.warn('Warning: Order total is 0 or invalid:', parsedData.orderTotal);
    }

    // Validate wallet address if present
    if (parsedData.walletAddress) {
      if (!isValidWalletAddress(parsedData.walletAddress)) {
        console.warn('Warning: Wallet address format is invalid:', parsedData.walletAddress);
        parsedData.walletAddress = null; // Set to null if invalid
      } else {
        console.log('✓ Valid wallet address found:', parsedData.walletAddress);
      }
    } else {
      console.log('ℹ No wallet address found in order');
    }

    // Log extracted information
    console.log('=== Order Parsed Successfully ===');
    console.log('Order ID:', parsedData.orderId);
    console.log('Customer Email:', parsedData.customerEmail || 'N/A');
    console.log('Wallet Address:', parsedData.walletAddress || 'Not provided');
    console.log('Order Total:', parsedData.orderTotal, parsedData.currency);
    console.log('Items:', parsedData.items.length, 'item(s)');
    parsedData.items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.title} x${item.quantity} - ${item.price} ${parsedData.currency}`);
    });
    console.log('Timestamp:', parsedData.timestamp);

    // Prepare response data (exclude rawOrder for cleaner response)
    const responseData = {
      orderId: parsedData.orderId,
      customerEmail: parsedData.customerEmail,
      walletAddress: parsedData.walletAddress,
      orderTotal: parsedData.orderTotal,
      currency: parsedData.currency,
      items: parsedData.items,
      timestamp: parsedData.timestamp
    };

    // Determine config (tokensPerOrder, assetId)
    let tokensPerOrder = null;
    let assetId = null;
    try {
      if (contractIdHeader && process.env.APP_API_BASE_URL) {
        const cfgRes = await fetch(`${process.env.APP_API_BASE_URL}/api/contracts/${contractIdHeader}`);
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          tokensPerOrder = typeof cfg.tokensPerOrder === 'number' ? cfg.tokensPerOrder : null;
          assetId = typeof cfg.assetId === 'number' ? cfg.assetId : null;
        }
      }
    } catch (e) {
      console.warn('Config fetch failed, falling back to env:', e.message);
    }
    if (tokensPerOrder == null) {
      tokensPerOrder = parseInt(process.env.TOKENS_PER_ORDER || '10', 10);
    }
    if (assetId == null) {
      assetId = parseInt(process.env.ASSET_HUB_ASSET_ID || '1', 10);
    }

    // Idempotency: mark pending
    try {
      if (process.env.APP_API_BASE_URL && contractIdHeader) {
        await fetch(`${process.env.APP_API_BASE_URL}/api/rewards`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contractId: parseInt(String(contractIdHeader), 10),
            orderId: parsedData.orderId,
            wallet: parsedData.walletAddress || null,
            status: 'pending'
          })
        })
      }
    } catch (e) {
      console.warn('Failed to record pending reward:', e.message)
    }

    // Blockchain interaction
    if (responseData.walletAddress) {
      try {
        console.log('=== Initiating Blockchain Transaction ===');
        
        // Initialize Polkadot connection
        await initPolkadot();
        
        // Fixed-per-order: convert units to smallest denomination
        const decimals = parseInt(process.env.TOKEN_DECIMALS || '12', 10);
        const BN = require('@polkadot/util').BN;
        const tokenAmount = new BN(tokensPerOrder).mul(new BN(10).pow(new BN(decimals)));
        
        console.log(`Calculated token amount: ${tokenAmount.toString()} (${tokensPerOrder} tokens/order)`);
        
        // Mint tokens and send to customer wallet
        const txHash = await mintAndTransferTokens(
          responseData.walletAddress,
          tokenAmount,
          assetId
        );
        
        responseData.transactionHash = txHash;
        responseData.tokenAmount = tokenAmount.toString();
        responseData.tokensPerOrder = tokensPerOrder;
        responseData.assetId = assetId;
        
        console.log('✓ Blockchain transaction successful!');
        console.log('Transaction Hash:', txHash);
        console.log('Tokens sent:', tokenAmount.toString());
        
        try {
          if (process.env.APP_API_BASE_URL && contractIdHeader) {
            await fetch(`${process.env.APP_API_BASE_URL}/api/rewards`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                contractId: parseInt(String(contractIdHeader), 10),
                orderId: parsedData.orderId,
                wallet: parsedData.walletAddress || null,
                amount: tokenAmount.toString(),
                assetId: assetId,
                status: 'success',
                txHash
              })
            })
          }
        } catch (e) {
          console.warn('Failed to record success reward:', e.message)
        }
        
      } catch (blockchainError) {
        console.error('=== Blockchain Transaction Error ===');
        console.error('Error:', blockchainError.message);
        console.error('Stack:', blockchainError.stack);
        
        // Don't fail the entire request, but log the error
        responseData.blockchainError = blockchainError.message;
        responseData.transactionHash = null;
        responseData.tokenAmount = null;
        
        try {
          if (process.env.APP_API_BASE_URL && contractIdHeader) {
            await fetch(`${process.env.APP_API_BASE_URL}/api/rewards`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                contractId: parseInt(String(contractIdHeader), 10),
                orderId: parsedData.orderId,
                wallet: parsedData.walletAddress || null,
                status: 'failed',
                error: blockchainError.message
              })
            })
          }
        } catch (e) {
          console.warn('Failed to record failed reward:', e.message)
        }
      }
    } else {
      console.log('ℹ No wallet address provided, skipping blockchain transaction');
    }

    return res.status(200).json({
      status: 'success',
      orderId: parsedData.orderId,
      parsed: responseData,
      message: 'Order parsed and ready for processing'
    });

  } catch (error) {
    console.error('=== Error Parsing Order ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Order Data:', JSON.stringify(shopifyOrder, null, 2));

    return res.status(500).json({
      status: 'error',
      message: 'Failed to parse order',
      error: error.message,
      orderId: shopifyOrder?.id || null
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});


