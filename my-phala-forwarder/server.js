// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const { parseOrder, isValidWalletAddress } = require('./utils/orderParser');
const { initPolkadot, mintAndTransferTokens, getWalletBalance, checkAssetPermissions, getAssetAccountBalance } = require('./utils/blockchain');
const { createAssetIfMissing, getSignerAddress } = require('./utils/asset');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const PHAT_FORWARD_TOKEN = process.env.PHAT_FORWARD_TOKEN;

// In-memory lock to prevent concurrent processing of the same order
const processingOrders = new Map(); // orderId -> { promise, timestamp }
const PROCESSING_TIMEOUT = 300000; // 5 minutes - clear stale locks

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

// Get asset account balance endpoint
app.get('/asset/:assetId/balance/:address', async (req, res) => {
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
    const address = req.params.address;
    
    if (isNaN(assetId)) {
      return res.status(400).json({ status: 'error', message: 'Invalid asset ID' });
    }
    
    if (!address || typeof address !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Invalid address' });
    }
    
    await initPolkadot();
    const balance = await getAssetAccountBalance(assetId, address);
    return res.status(200).json({ status: 'success', ...balance });
  } catch (e) {
    console.error('Asset balance check error:', e);
    return res.status(500).json({ status: 'error', message: e.message });
  }
});
// Direct mint endpoint - bypasses order parsing
app.post('/mint', async (req, res) => {
  const receivedToken = req.headers['x-forward-token'];
  if (!PHAT_FORWARD_TOKEN || receivedToken !== PHAT_FORWARD_TOKEN) {
    console.error('Unauthorized: Token mismatch');
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  try {
    const { assetId, walletAddress, quantity = 1 } = req.body;

    if (!assetId) {
      return res.status(400).json({ status: 'error', message: 'Asset ID is required' });
    }

    if (!walletAddress) {
      return res.status(400).json({ status: 'error', message: 'Wallet address is required' });
    }

    const assetIdNum = parseInt(String(assetId), 10);
    if (!Number.isFinite(assetIdNum)) {
      return res.status(400).json({ status: 'error', message: 'Invalid asset ID' });
    }

    if (!isValidWalletAddress(walletAddress)) {
      return res.status(400).json({ status: 'error', message: 'Invalid wallet address format' });
    }

    const qty = Number.isFinite(quantity) ? Math.max(1, parseInt(String(quantity), 10)) : 1;

    console.log('=== DIRECT MINT REQUEST ===');
    console.log('Asset ID:', assetIdNum);
    console.log('Wallet:', walletAddress);
    console.log('Quantity:', qty);

    await initPolkadot();

    const BN = require('@polkadot/util').BN;
    const decimals = parseInt(process.env.TOKEN_DECIMALS || '12', 10);
    const multiplier = new BN(10).pow(new BN(decimals));
    const amount = new BN(qty).mul(multiplier);

    console.log(`➡️ Minting ${qty} token(s) of asset ${assetIdNum} to ${walletAddress}`);

    try {
      const txHash = await mintAndTransferTokens(walletAddress, amount, assetIdNum);

      console.log('✅ Direct mint successful:', {
        assetId: assetIdNum,
        quantity: qty,
        walletAddress,
        txHash,
      });

      return res.status(200).json({
        status: 'success',
        assetId: assetIdNum,
        quantity: qty,
        walletAddress,
        txHash,
        amount: amount.toString(),
      });
    } catch (mintError) {
      console.error('❌ Direct mint failed:', mintError.message);
      return res.status(500).json({
        status: 'error',
        message: 'Minting failed',
        error: mintError.message,
        assetId: assetIdNum,
        walletAddress,
      });
    }
  } catch (error) {
    console.error('Direct mint endpoint error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Unknown error',
    });
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

  console.log('=== FORWARDER: Received Order ===');
  console.log('Order ID:', shopifyOrder?.id);
  console.log('Order Email:', shopifyOrder?.email);
  console.log('Line Items Count:', shopifyOrder?.line_items?.length || 0);
  console.log('Has Contract ID Header:', !!contractIdHeader);
  console.log('APP_API_BASE_URL:', process.env.APP_API_BASE_URL ? 'SET' : 'NOT SET');

  try {
    // Parse the Shopify order JSON
    console.log('=== Processing Shopify Order ===');
    console.log('Order ID:', shopifyOrder?.id);
    
    const parsedData = parseOrder(shopifyOrder);

    // Validate parsed data
    if (!parsedData.orderId) {
      throw new Error('Order ID is missing');
    }

    // Idempotency check: prevent concurrent processing of the same order
    const orderId = parsedData.orderId;
    const existingProcessing = processingOrders.get(orderId);
    
    if (existingProcessing) {
      const age = Date.now() - existingProcessing.timestamp;
      if (age < PROCESSING_TIMEOUT) {
        console.log(`⏳ Order ${orderId} is already being processed (${Math.round(age / 1000)}s ago), waiting for existing process...`);
        try {
          // Wait for the existing processing to complete
          const result = await existingProcessing.promise;
          console.log(`✅ Order ${orderId} processing completed by existing request, returning same result`);
          return res.status(200).json({
            status: 'success',
            orderId: parsedData.orderId,
            parsed: result,
            message: 'Order processed by concurrent request',
            duplicate: true
          });
        } catch (error) {
          // If existing processing failed, remove it and continue with new processing
          console.log(`⚠️ Existing processing for order ${orderId} failed, starting new processing:`, error.message);
          processingOrders.delete(orderId);
        }
      } else {
        // Stale lock, remove it
        console.log(`🧹 Removing stale lock for order ${orderId} (${Math.round(age / 1000)}s old)`);
        processingOrders.delete(orderId);
      }
    }

    // Create a promise for this order processing
    const processingPromise = (async () => {
      try {
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
          console.log(`     Product ID: ${item.productId || 'N/A'}`);
          console.log(`     Asset ID: ${item.assetId ?? 'NOT FOUND'}`);
        });
        console.log('Timestamp:', parsedData.timestamp);

        // Debug: Log raw order structure for wallet and properties
        if (shopifyOrder.note_attributes) {
          console.log('📝 Order note_attributes:', JSON.stringify(shopifyOrder.note_attributes, null, 2));
        }
        if (shopifyOrder.note) {
          console.log('📝 Order note:', shopifyOrder.note);
        }
        if (shopifyOrder.line_items && shopifyOrder.line_items.length > 0) {
          console.log('📦 First line item properties:', JSON.stringify(shopifyOrder.line_items[0].properties || [], null, 2));
        }

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

        // Try to look up asset IDs from database if not found in order
        const itemsWithAssets = [];
        const itemsNeedingLookup = [];

        for (const item of parsedData.items) {
          if (item.assetId != null) {
            itemsWithAssets.push(item);
          } else if (item.productId != null && process.env.APP_API_BASE_URL) {
            // Try to look up asset ID from product database
            itemsNeedingLookup.push(item);
          }
        }

        // Look up missing asset IDs from database
        if (itemsNeedingLookup.length > 0) {
          if (!process.env.APP_API_BASE_URL) {
            console.error('❌ CRITICAL: Cannot lookup asset IDs - APP_API_BASE_URL not set!');
            console.error('   Items needing lookup:', itemsNeedingLookup.map(i => i.title).join(', '));
            console.error('   Set APP_API_BASE_URL in forwarder environment to enable database lookup');
          } else {
            console.log(`🔍 Looking up ${itemsNeedingLookup.length} missing asset ID(s) from database...`);
            for (const item of itemsNeedingLookup) {
              try {
                // Convert Shopify product ID to our format (gid://shopify/Product/XXXXX)
                const shopifyProductId = item.productId;
                const fullProductId = shopifyProductId.toString().startsWith('gid://')
                  ? shopifyProductId
                  : `gid://shopify/Product/${shopifyProductId}`;

                const lookupUrl = `${process.env.APP_API_BASE_URL}/api/products/tokens?productId=${encodeURIComponent(fullProductId)}`;
                console.log(`   Looking up: ${lookupUrl}`);
                
                const lookupRes = await fetch(lookupUrl, {
                  headers: { 'content-type': 'application/json' },
                });

                const responseStatus = lookupRes.status;
                console.log(`   Lookup response status: ${responseStatus} for product ${fullProductId}`);
                
                if (lookupRes.ok) {
                  const tokenData = await lookupRes.json();
                  if (tokenData.assetId) {
                    item.assetId = parseInt(tokenData.assetId, 10);
                    itemsWithAssets.push(item);
                    console.log(`✓ Found asset ID ${item.assetId} for product ${fullProductId} from database`);
                  } else {
                    console.log(`⚠️ No asset ID in database for product ${fullProductId}`);
                  }
                } else if (responseStatus === 404 || responseStatus === '404' || String(responseStatus) === '404') {
                  // Token doesn't exist - create it automatically
                  console.log(`🔄 Token not found for product ${fullProductId} (status: ${responseStatus}), creating automatically...`);
                  
                  try {
                    // Get product metadata from the order item
                    const productTitle = item.title || `Product ${shopifyProductId}`;
                    const tokenName = `${productTitle} Token`;
                    const tokenSymbol = productTitle
                      .replace(/[^A-Za-z0-9]/g, "")
                      .slice(0, 6)
                      .toUpperCase() || "TOKEN";
                    
                    // Call token creation API
                    const createTokenUrl = `${process.env.APP_API_BASE_URL}/api/products/${shopifyProductId}/token`;
                    console.log(`   Creating token: ${createTokenUrl}`);
                    
                    const createTokenRes = await fetch(createTokenUrl, {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        name: tokenName,
                        symbol: tokenSymbol,
                        productMetadata: {
                          id: fullProductId,
                          title: productTitle,
                          handle: productTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                        }
                      }),
                    });
                    
                    if (createTokenRes.ok) {
                      const tokenData = await createTokenRes.json();
                      if (tokenData.assetId) {
                        item.assetId = parseInt(tokenData.assetId, 10);
                        itemsWithAssets.push(item);
                        console.log(`✅ Created and found asset ID ${item.assetId} for product ${fullProductId}`);
                      } else {
                        console.log(`⚠️ Token created but no asset ID returned for product ${fullProductId}`);
                      }
                    } else {
                      const errorText = await createTokenRes.text().catch(() => '');
                      console.log(`⚠️ Failed to create token for product ${fullProductId}: ${createTokenRes.status} - ${errorText.substring(0, 200)}`);
                    }
                  } catch (createError) {
                    console.warn(`Failed to create token for product ${item.productId}:`, createError.message);
                  }
                } else {
                  const errorText = await lookupRes.text().catch(() => '');
                  console.log(`⚠️ Failed to lookup asset ID for product ${fullProductId}: ${lookupRes.status} - ${errorText.substring(0, 200)}`);
                }
              } catch (lookupError) {
                console.warn(`Failed to lookup asset ID for product ${item.productId}:`, lookupError.message);
              }
            }
          }
        }

        // Log all items and their asset IDs for debugging
        console.log('=== Item Asset ID Analysis ===');
        parsedData.items.forEach((item, idx) => {
          console.log(`Item ${idx + 1}: ${item.title}`);
          console.log(`  - Asset ID: ${item.assetId ?? 'NOT FOUND'}`);
          console.log(`  - Quantity: ${item.quantity}`);
          console.log(`  - Product ID: ${item.productId ?? 'N/A'}`);
        });
        console.log(`Total items with asset IDs: ${itemsWithAssets.length}`);

        // Blockchain interaction
        if (!responseData.walletAddress) {
          console.error('❌ CRITICAL: No wallet address found in order!');
          console.error('   Wallet address is required to mint tokens.');
          console.error('   Make sure wallet address is passed in cart attributes during checkout.');
        } else if (itemsWithAssets.length === 0) {
          console.error('❌ CRITICAL: No items with asset IDs found!');
          console.error('   Wallet address:', responseData.walletAddress);
          console.error('   Total items:', parsedData.items.length);
          console.error('   Items with asset IDs:', 0);
          console.error('   This could mean:');
          console.error('     1. Asset IDs not set in cart attributes');
          console.error('     2. Asset IDs not found in order properties');
          console.error('     3. Database lookup failed or APP_API_BASE_URL not set');
        }

        if (responseData.walletAddress && itemsWithAssets.length > 0) {
          console.log(`🎯 Found ${itemsWithAssets.length} item(s) with asset IDs, preparing mints...`);
          const BN = require('@polkadot/util').BN;
          const decimals = parseInt(process.env.TOKEN_DECIMALS || '12', 10);
          const multiplier = new BN(10).pow(new BN(decimals));
          const mintResults = [];
          const mintFailures = [];

          try {
            console.log('=== Initializing Polkadot connection for per-item minting ===');
            await initPolkadot();

            for (const item of itemsWithAssets) {
              const assetIdForItem = parseInt(String(item.assetId), 10);
              if (!Number.isFinite(assetIdForItem)) {
                console.warn('Skipping item with invalid asset ID:', item.assetId, item.title);
                continue;
              }

              // Check if asset exists on-chain before minting
              console.log(`🔍 Checking if asset ${assetIdForItem} exists on-chain...`);
              const assetCheck = await checkAssetPermissions(assetIdForItem);
              
              if (!assetCheck.exists) {
                console.log(`⚠️ Asset ${assetIdForItem} does not exist on-chain, creating it automatically...`);
                try {
                  // Generate token name and symbol from product
                  const productTitle = item.title || `Product ${item.productId}`;
                  const tokenName = `${productTitle} Token`;
                  const tokenSymbol = productTitle
                    .replace(/[^A-Za-z0-9]/g, "")
                    .slice(0, 6)
                    .toUpperCase() || "TOKEN";
                  
                  // Create the asset on-chain
                  const createdAssetId = await createAssetIfMissing(assetIdForItem, {
                    name: tokenName,
                    symbol: tokenSymbol,
                    decimals: parseInt(process.env.TOKEN_DECIMALS || '12', 10),
                    minBalance: 1
                  });
                  
                  if (createdAssetId !== assetIdForItem) {
                    console.warn(`⚠️ Created asset with different ID: expected ${assetIdForItem}, got ${createdAssetId}`);
                  } else {
                    console.log(`✅ Asset ${assetIdForItem} created successfully on-chain`);
                  }
                  
                  // Verify it exists now
                  const verifyCheck = await checkAssetPermissions(assetIdForItem);
                  if (!verifyCheck.exists) {
                    throw new Error(`Asset ${assetIdForItem} was created but still doesn't exist on-chain`);
                  }
                } catch (createError) {
                  console.error(`❌ Failed to create asset ${assetIdForItem} on-chain:`, createError.message);
                  mintFailures.push({
                    assetId: assetIdForItem,
                    quantity: Number.isFinite(item.quantity) ? Math.max(1, item.quantity) : 1,
                    error: `Failed to create asset on-chain: ${createError.message}`,
                    title: item.title || null,
                  });
                  continue; // Skip minting for this item
                }
              } else {
                console.log(`✓ Asset ${assetIdForItem} exists on-chain`);
              }

              const quantity = Number.isFinite(item.quantity) ? Math.max(1, item.quantity) : 1;
              const amount = new BN(quantity).mul(multiplier);

              console.log(`➡️ Minting asset ${assetIdForItem} x${quantity} for wallet ${responseData.walletAddress}`);

              try {
                const txHash = await mintAndTransferTokens(
                  responseData.walletAddress,
                  amount,
                  assetIdForItem
                );

                mintResults.push({
                  assetId: assetIdForItem,
                  quantity,
                  amount: amount.toString(),
                  txHash,
                  title: item.title || null,
                });

                console.log('✓ Mint successful', {
                  assetId: assetIdForItem,
                  quantity,
                  txHash,
                });
              } catch (mintError) {
                console.error('❌ Mint failed for asset', assetIdForItem, mintError.message);
                mintFailures.push({
                  assetId: assetIdForItem,
                  quantity,
                  error: mintError.message,
                  title: item.title || null,
                });
              }
            }
          } catch (setupError) {
            console.error('=== Blockchain Setup Error ===');
            console.error('Error:', setupError.message);
            console.error('Stack:', setupError.stack);
            mintFailures.push({
              assetId: null,
              quantity: null,
              error: setupError.message,
            });
          }

          responseData.mintResults = mintResults;
          if (mintFailures.length) {
            responseData.mintFailures = mintFailures;
          }

          const rewardStatus = mintFailures.length ? 'failed' : 'success';
          const rewardPayload = {
            contractId: contractIdHeader ? parseInt(String(contractIdHeader), 10) : undefined,
            orderId: parsedData.orderId,
            wallet: parsedData.walletAddress || null,
            amount: JSON.stringify({
              results: mintResults,
              failures: mintFailures,
            }),
            assetId: mintResults.length === 1 ? mintResults[0].assetId : null,
            status: rewardStatus,
            txHash: mintResults.length === 1 ? mintResults[0].txHash : null,
            error: mintFailures.length ? mintFailures.map((f) => f.error).join("; ") : null,
          };

          if (process.env.APP_API_BASE_URL && contractIdHeader) {
            try {
              await fetch(`${process.env.APP_API_BASE_URL}/api/rewards`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(rewardPayload),
              });
            } catch (rewardError) {
              console.warn('Failed to record reward status:', rewardError.message);
            }
          }

          if (mintFailures.length) {
            console.error('⚠️ Some mints failed', mintFailures);
          }
        } else if (responseData.walletAddress) {
          console.log('ℹ Wallet address provided but no asset IDs found on items. Skipping mint.');
        } else {
          console.log('ℹ No wallet address provided, skipping blockchain transaction');
        }

        return {
          status: 'success',
          orderId: parsedData.orderId,
          parsed: responseData,
          message: 'Order parsed and ready for processing'
        };
      } catch (processingError) {
        throw processingError;
      } finally {
        // Clean up the lock after processing completes
        processingOrders.delete(orderId);
        console.log(`🧹 Cleaned up processing lock for order ${orderId}`);
      }
    })();

    // Store the processing promise before awaiting
    processingOrders.set(orderId, {
      promise: processingPromise,
      timestamp: Date.now()
    });

    // Await the processing and send response
    try {
      const result = await processingPromise;
      return res.status(200).json(result);
    } catch (processingError) {
      // Re-throw to outer catch block
      throw processingError;
    }

  } catch (error) {
    console.error('=== Error Parsing Order ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Order Data:', JSON.stringify(shopifyOrder, null, 2));

    // Clean up lock if order ID was parsed
    const orderId = shopifyOrder?.id ? String(shopifyOrder.id) : null;
    if (orderId && processingOrders.has(orderId)) {
      processingOrders.delete(orderId);
      console.log(`🧹 Cleaned up processing lock for order ${orderId} after error`);
    }

    return res.status(500).json({
      status: 'error',
      message: 'Failed to parse order',
      error: error.message,
      orderId: orderId
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});


