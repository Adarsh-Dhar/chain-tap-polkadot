const { ApiPromise, WsProvider } = require('@polkadot/api');
const { Keyring } = require('@polkadot/keyring');
const { BN } = require('@polkadot/util');

let api = null;
let wallet = null;

async function ensureApi() {
  if (api) return api;
  const wsUrl = process.env.POLKADOT_WS_URL || 'wss://westend-asset-hub-rpc.polkadot.io';
  const provider = new WsProvider(wsUrl);
  api = await ApiPromise.create({ provider });
  await api.isReady;
  const keyring = new Keyring({ type: 'sr25519' });
  const mnemonic = process.env.PHAT_CONTRACT_MNEMONIC;
  const seed = process.env.PHAT_CONTRACT_SEED;
  wallet = mnemonic ? keyring.addFromMnemonic(mnemonic) : keyring.addFromUri(seed);
  return api;
}

async function createAssetIfMissing(desiredAssetId, metadata) {
  const api = await ensureApi();
  // Note: depending on runtime, assets may be created via assets.create or assets.createAsset
  // This is a best-effort helper; ensure your signer has sufficient permissions.
  const { name = 'Loyalty Token', symbol = 'LOYAL', decimals = 12, minBalance = 1 } = metadata || {};

  // Feature detection: ensure Assets pallet exists on this chain (Westend Asset Hub exposes pallet-assets)
  const hasAssetsPallet = !!(api.query?.assets && (api.query.assets.asset || api.query.assets.assets));
  if (!hasAssetsPallet) {
    throw new Error(
      'Assets pallet is not available on the connected chain. ' +
      'This network does not expose pallet-assets (e.g., Karura uses ORML Tokens). ' +
      'Provide an existing assetId via ASSET_HUB_ASSET_ID or connect to a chain with pallet-assets.'
    );
  }
  
  // Step 1: Get the next available asset ID (if supported by this runtime)
  let nextAssetId;
  try {
    if (!api.query.assets.nextAssetId) {
      throw new Error('nextAssetId storage item is not exposed on this runtime');
    }
    const nextId = await api.query.assets.nextAssetId();
    // Handle different return types - try multiple conversion methods
    if (nextId === null || nextId === undefined) {
      throw new Error('nextAssetId query returned null or undefined');
    }
    
    // Try toHuman() first (most reliable for Codec types)
    if (nextId.toHuman && typeof nextId.toHuman === 'function') {
      const humanValue = nextId.toHuman();
      nextAssetId = typeof humanValue === 'number' ? humanValue : parseInt(String(humanValue), 10);
    } 
    // Try toNumber() if available
    else if (nextId.toNumber && typeof nextId.toNumber === 'function') {
      nextAssetId = nextId.toNumber();
    }
    // Try unwrap() if it's an Option type
    else if (nextId.isSome !== undefined) {
      const unwrapped = nextId.unwrap();
      if (unwrapped.toNumber) {
        nextAssetId = unwrapped.toNumber();
      } else if (unwrapped.toHuman) {
        const humanValue = unwrapped.toHuman();
        nextAssetId = typeof humanValue === 'number' ? humanValue : parseInt(String(humanValue), 10);
      } else {
        nextAssetId = parseInt(String(unwrapped), 10);
      }
    }
    // Try toString() and parse
    else if (nextId.toString && typeof nextId.toString === 'function') {
      nextAssetId = parseInt(nextId.toString(), 10);
    }
    // Direct number conversion
    else {
      nextAssetId = typeof nextId === 'number' ? nextId : parseInt(String(nextId), 10);
    }
    
    if (isNaN(nextAssetId)) {
      throw new Error(`Could not convert nextAssetId to number. Value: ${nextId}, Type: ${typeof nextId}`);
    }
    
    console.log(`Next available Asset ID: ${nextAssetId}`);
  } catch (e) {
    throw new Error(`Failed to query next asset ID: ${e.message}`);
  }

  // Step 2: Determine which asset ID to use
  let id;
  console.log('desiredAssetId', desiredAssetId);
  console.log('nextAssetId', nextAssetId);
  if (desiredAssetId && typeof desiredAssetId === 'number') {
    // If desiredAssetId is provided, check if it matches nextAssetId
    if (desiredAssetId === nextAssetId) {
      id = desiredAssetId;
      console.log(`Using provided asset ID ${id} (matches nextAssetId)`);
    } else {
      // Check if the desired asset already exists
      try {
        const exists = await api.query.assets.asset(desiredAssetId);
        if (exists.isSome) {
          console.log(`Asset ${desiredAssetId} already exists, using existing asset`);
          return desiredAssetId;
        }
      } catch (e) {
        // Asset doesn't exist, but ID doesn't match nextAssetId
      }
      
      // If desired ID doesn't match nextAssetId and doesn't exist, use nextAssetId
      console.log(`Warning: Desired asset ID ${desiredAssetId} does not match nextAssetId ${nextAssetId}. Using nextAssetId ${nextAssetId} instead.`);
      id = nextAssetId;
    }
  } else {
    // No desiredAssetId provided, use nextAssetId
    id = nextAssetId;
    console.log(`No asset ID provided, using next available ID: ${id}`);
  }

  // Step 3: Check if asset already exists (double-check)
  try {
    const exists = await api.query.assets.asset(id);
    if (exists.isSome) {
      console.log(`Asset ${id} already exists, skipping creation`);
      return id;
    }
  } catch (e) {
    // Asset doesn't exist, continue with creation
  }

  // Check balance before attempting asset creation
  try {
    const accountInfo = await api.query.system.account(wallet.address);
    const freeBalance = accountInfo.data.free;
    const decimals = api.registry.chainDecimals[0] || 10;
    const divisor = new BN(10).pow(new BN(decimals));
    const balanceFormatted = freeBalance.div(divisor).toString();
    const tokenSymbol = api.registry.chainTokens[0] || 'DOT';
    
    console.log(`Wallet balance: ${balanceFormatted} ${tokenSymbol}`);
    
    // Asset creation typically requires a deposit (0.1-1 DOT/PSE)
    const minBalanceForCreation = new BN(10).pow(new BN(decimals - 1)); // 0.1 in smallest units
    if (freeBalance.lt(minBalanceForCreation)) {
      throw new Error(
        `Insufficient balance for asset creation. ` +
        `Current balance: ${balanceFormatted} ${tokenSymbol}. ` +
        `Asset creation requires a deposit (~0.1-1 ${tokenSymbol}). ` +
        `Please fund your wallet: ${wallet.address}`
      );
    }
    
    // Check if we can query asset creation deposit requirements
    try {
      const depositInfo = await api.consts.assets.assetDeposit || await api.consts.assets.assetDeposit;
      if (depositInfo) {
        const depositAmount = depositInfo.toBn ? depositInfo.toBn().div(divisor).toString() : depositInfo.toString();
        console.log(`Asset creation deposit requirement: ${depositAmount} ${tokenSymbol}`);
      }
    } catch (e) {
      // Deposit info not available, that's okay
    }
  } catch (e) {
    if (e.message && e.message.includes('Insufficient balance')) {
      throw e;
    }
    // Balance check failed, but continue anyway
    console.warn('Could not check balance:', e.message);
  }
  
  // Westend Asset Hub is permissionless for asset creation (requires refundable WND deposit).
  // Users must fund the signer with WND from a faucet to cover deposits/fees.

  // Re-query nextAssetId right before creating transaction to avoid race conditions
  let finalAssetId = id;
  try {
    console.log(`Re-querying nextAssetId before transaction (current ID: ${id})...`);
    const freshNextId = await api.query.assets.nextAssetId();
    let freshNextAssetId;
    
    // Convert using the same method as before
    if (freshNextId.toHuman && typeof freshNextId.toHuman === 'function') {
      const humanValue = freshNextId.toHuman();
      freshNextAssetId = typeof humanValue === 'number' ? humanValue : parseInt(String(humanValue), 10);
    } else if (freshNextId.toNumber && typeof freshNextId.toNumber === 'function') {
      freshNextAssetId = freshNextId.toNumber();
    } else if (freshNextId.isSome !== undefined) {
      const unwrapped = freshNextId.unwrap();
      if (unwrapped.toNumber) {
        freshNextAssetId = unwrapped.toNumber();
      } else if (unwrapped.toHuman) {
        const humanValue = unwrapped.toHuman();
        freshNextAssetId = typeof humanValue === 'number' ? humanValue : parseInt(String(humanValue), 10);
      } else {
        freshNextAssetId = parseInt(String(unwrapped), 10);
      }
    } else if (freshNextId.toString && typeof freshNextId.toString === 'function') {
      freshNextAssetId = parseInt(freshNextId.toString(), 10);
    } else {
      freshNextAssetId = typeof freshNextId === 'number' ? freshNextId : parseInt(String(freshNextId), 10);
    }
    
    console.log(`Fresh nextAssetId query result: ${freshNextAssetId} (type: ${typeof freshNextAssetId})`);
    
    if (!isNaN(freshNextAssetId)) {
      if (freshNextAssetId !== id) {
        console.log(`⚠️  Next asset ID changed from ${id} to ${freshNextAssetId} (race condition detected). Using ${freshNextAssetId}.`);
        finalAssetId = freshNextAssetId;
      } else {
        console.log(`✓ Fresh nextAssetId matches original (${freshNextAssetId})`);
      }
    } else {
      console.warn(`⚠️  Could not parse fresh nextAssetId, using original ID ${id}`);
    }
  } catch (e) {
    console.warn(`Could not re-query nextAssetId before transaction: ${e.message}. Using original ID ${id}.`);
  }
  
  console.log(`Final asset ID to use: ${finalAssetId} (type: ${typeof finalAssetId})`);

  // Create asset and set team/metadata
  // Ensure finalAssetId is a number (not string) for the transaction
  const assetIdForTx = typeof finalAssetId === 'number' ? finalAssetId : parseInt(String(finalAssetId), 10);
  if (isNaN(assetIdForTx)) {
    throw new Error(`Invalid asset ID format: ${finalAssetId} (could not convert to number)`);
  }
  
  console.log(`Creating transaction with asset ID: ${assetIdForTx} (type: ${typeof assetIdForTx})`);
  
  // Try creating asset first without metadata (simpler transaction)
  // If that works, we can add metadata in a separate call
  let createTx;
  if (api.tx.assets?.create) {
    console.log(`Using api.tx.assets.create with ID: ${assetIdForTx}`);
    createTx = api.tx.assets.create(assetIdForTx, wallet.address, minBalance);
  } else if (api.tx.assets?.createAsset) {
    console.log(`Using api.tx.assets.createAsset with ID: ${assetIdForTx}`);
    createTx = api.tx.assets.createAsset(assetIdForTx, wallet.address, minBalance);
  } else {
    throw new Error('No asset creation extrinsics available on this chain version. Asset creation may require governance or privileged access.');
  }

  // Build batch: create first, then set team and metadata
  const txs = [createTx];
  
  if (api.tx.assets?.setTeam) {
    txs.push(api.tx.assets.setTeam(assetIdForTx, wallet.address, wallet.address, wallet.address));
  }
  if (api.tx.assets?.setMetadata) {
    txs.push(api.tx.assets.setMetadata(assetIdForTx, name, symbol, decimals));
  }

  // Log what we're about to do
  console.log(`Attempting to create asset ${assetIdForTx}: ${name} (${symbol})`);
  
  // On Paseo Asset Hub, asset creation might require special permissions
  // Try creating the asset first without metadata to isolate the issue
  // If that works, we can set metadata in a follow-up transaction
  console.log('Step 1: Creating asset (without metadata first)...');
  
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Asset creation transaction timeout after 60 seconds'));
    }, 60000);

    // Use just the create transaction first (no batch, no metadata)
    const tx = createTx;
    
    console.log(`Sending create transaction with asset ID: ${assetIdForTx}`);

    tx.signAndSend(wallet, ({ status, txHash, dispatchError, events }) => {
      if (dispatchError) {
        clearTimeout(timeout);
        let errorMessage = 'Asset creation failed: ';
        
        if (dispatchError.isModule) {
          const decoded = api.registry.findMetaError(dispatchError.asModule);
          const { name, section, docs } = decoded;
          errorMessage += `${section}.${name}`;
          if (docs && docs.length > 0) {
            errorMessage += `: ${docs.join(' ')}`;
          }

          // Add helpful context
          if (name === 'InsufficientBalance' || name === 'BalanceLow') {
            errorMessage += `. Your wallet may not have enough balance for the asset creation deposit.`;
          } else if (name === 'NoPermission' || name === 'BadOrigin') {
            errorMessage += `. Asset creation on public Asset Hub chains requires governance approval or privileged access. ` +
                           `You cannot create assets programmatically. Use an existing asset or run a local dev chain.`;
          } else if (name === 'BadAssetId') {
            errorMessage += `. The asset ID must equal the next available asset ID. Attempted ID: ${finalAssetId}. ` +
                           `However, this error on Paseo Asset Hub usually indicates that asset creation requires governance approval. ` +
                           `Regular accounts cannot create assets programmatically on public testnets/mainnets. ` +
                           `Consider: 1) Using an existing asset where you control issuer/admin, 2) Running a local dev chain, or 3) Submitting a governance proposal.`;
          } else if (name === 'Unknown') {
            errorMessage += `. The asset ID may already exist or you may not have permission.`;
          }
        } else {
          errorMessage += dispatchError.toString();
        }

        console.error('❌ Asset Creation Error:', errorMessage);
        reject(new Error(errorMessage));
        return;
      }

      if (status.isInBlock || status.isFinalized) {
        clearTimeout(timeout);
        const blockHash = status.asInBlock?.toString() || status.asFinalized?.toString();
        console.log(`✓ Asset creation transaction ${txHash.toString()} included in block ${blockHash}`);
        
        if (events && events.length > 0) {
          console.log('=== Asset Creation Events ===');
          events.forEach(({ event }) => {
            console.log(`  ${event.section}.${event.method}: ${event.data.toString()}`);
          });
        }
        
        // Asset created successfully! Now set metadata if needed
        if (txs.length > 1) {
          console.log('Step 2: Setting asset metadata...');
          // Set metadata in a separate transaction
          const metadataTxs = [];
          if (api.tx.assets?.setTeam) {
            metadataTxs.push(api.tx.assets.setTeam(assetIdForTx, wallet.address, wallet.address, wallet.address));
          }
          if (api.tx.assets?.setMetadata) {
            metadataTxs.push(api.tx.assets.setMetadata(assetIdForTx, name, symbol, decimals));
          }
          
          if (metadataTxs.length > 0) {
            const metadataTx = metadataTxs.length > 1 && api.tx.utility?.batchAll
              ? api.tx.utility.batchAll(metadataTxs)
              : metadataTxs[0];
            
            // Set metadata asynchronously (don't wait for it)
            metadataTx.signAndSend(wallet, ({ status, dispatchError }) => {
              if (dispatchError) {
                console.warn('⚠️  Failed to set asset metadata:', dispatchError.toString());
              } else if (status.isInBlock || status.isFinalized) {
                console.log('✓ Asset metadata set successfully');
              }
            }).catch(e => {
              console.warn('⚠️  Error setting metadata:', e.message);
            });
          }
        }
        
        resolve();
      }
    }).catch((error) => {
      clearTimeout(timeout);
      console.error('❌ Asset creation send error:', error.message);
      reject(new Error(`Failed to send asset creation transaction: ${error.message}`));
    });
  });

  return finalAssetId;
}

function getSignerAddress() {
  if (!wallet) return null;
  return wallet.address;
}

module.exports = { createAssetIfMissing, getSignerAddress };


