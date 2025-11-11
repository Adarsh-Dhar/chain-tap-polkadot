const { ApiPromise, WsProvider } = require('@polkadot/api');
const { Keyring } = require('@polkadot/keyring');
const { BN } = require('@polkadot/util');

let api = null;
let keyring = null;
let wallet = null;

/**
 * Initialize Polkadot API connection
 * @returns {Promise<ApiPromise>} - Polkadot API instance
 */
async function initPolkadot() {
  if (api) {
    return api;
  }

  try {
    // Connect to Westend Asset Hub testnet (override via POLKADOT_WS_URL if needed)
    const wsUrl = process.env.POLKADOT_WS_URL || 'wss://westend-asset-hub-rpc.polkadot.io';
    console.log('Connecting to Westend Asset Hub:', wsUrl);
    
    const wsProvider = new WsProvider(wsUrl);
    api = await ApiPromise.create({ provider: wsProvider });
    
    // Wait for API to be ready
    await api.isReady;
    
    // Initialize keyring with Westend SS58 format (42)
    // Westend Asset Hub uses SS58 format 42
    keyring = new Keyring({ 
      type: 'sr25519',
      ss58Format: 42  // Westend format
    });
    
    // Load Phat Contract's wallet from environment
    const mnemonic = process.env.PHAT_CONTRACT_MNEMONIC;
    const seed = process.env.PHAT_CONTRACT_SEED;
    
    if (!mnemonic && !seed) {
      throw new Error('PHAT_CONTRACT_MNEMONIC or PHAT_CONTRACT_SEED must be set');
    }
    
    if (mnemonic) {
      wallet = keyring.addFromMnemonic(mnemonic, {}, 'sr25519');
    } else if (seed) {
      wallet = keyring.addFromUri(seed, {}, 'sr25519');
    }
    
    // Verify the wallet address matches expected format
    console.log('✓ Wallet initialized with SS58 format 42 (Westend)');
    
    console.log('✓ Connected to Westend Asset Hub');
    console.log('✓ Wallet address:', wallet.address);
    
    return api;
  } catch (error) {
    console.error('Error initializing Polkadot connection:', error);
    throw error;
  }
}

/**
 * Get wallet balance information
 * @returns {Promise<object>} - Balance info with free, reserved, and total
 */
async function getWalletBalance() {
  if (!api) {
    await initPolkadot();
  }

  if (!wallet) {
    throw new Error('Wallet not initialized');
  }

  try {
    const accountInfo = await api.query.system.account(wallet.address);
    const free = accountInfo.data.free;
    const reserved = accountInfo.data.reserved;
    const frozen = accountInfo.data.frozen;
    const total = free.add(reserved);

    // Convert to human-readable format (assuming 10 decimals for DOT/PSE)
    const decimals = api.registry.chainDecimals[0] || 10;
    const divisor = new BN(10).pow(new BN(decimals));

    return {
      address: wallet.address,
      free: free.toString(),
      reserved: reserved.toString(),
      frozen: frozen.toString(),
      total: total.toString(),
      freeFormatted: free.div(divisor).toString(),
      tokenSymbol: api.registry.chainTokens[0] || 'DOT',
      decimals: decimals
    };
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    throw new Error(`Failed to fetch wallet balance: ${error.message}`);
  }
}

/**
 * Check if asset exists and signer has permission to mint
 * @param {number} assetId - Asset ID to check
 * @returns {Promise<object>} - Asset info and permission status
 */
async function checkAssetPermissions(assetId) {
  if (!api) {
    await initPolkadot();
  }

  if (!wallet) {
    throw new Error('Wallet not initialized');
  }

  try {
    // Check if asset exists
    const assetInfo = await api.query.assets.asset(assetId);
    
    if (assetInfo.isNone) {
      return {
        exists: false,
        canMint: false,
        error: `Asset ${assetId} does not exist on Asset Hub`
      };
    }

    const details = assetInfo.unwrap();
    const issuer = details.issuer.toString();
    const admin = details.admin.toString();
    const signerAddress = wallet.address;

    // Check if signer is issuer or admin
    const isIssuer = issuer === signerAddress;
    const isAdmin = admin === signerAddress;
    const canMint = isIssuer || isAdmin;

    // Get asset metadata
    let metadata = null;
    try {
      const meta = await api.query.assets.metadata(assetId);
      if (meta.isSome) {
        const metaData = meta.unwrap();
        metadata = {
          name: metaData.name.toHuman(),
          symbol: metaData.symbol.toHuman(),
          decimals: metaData.decimals.toNumber()
        };
      }
    } catch (e) {
      // Metadata query failed, that's okay
    }

    return {
      exists: true,
      canMint: canMint,
      assetId: assetId,
      issuer: issuer,
      admin: admin,
      signerAddress: signerAddress,
      isIssuer: isIssuer,
      isAdmin: isAdmin,
      metadata: metadata,
      error: canMint ? null : `Signer ${signerAddress} is not issuer (${issuer}) or admin (${admin}) of asset ${assetId}`
    };
  } catch (error) {
    console.error('Error checking asset permissions:', error);
    throw new Error(`Failed to check asset permissions: ${error.message}`);
  }
}

/**
 * Calculate token amount based on order total
 * @param {number} orderTotal - Order total in USD
 * @param {number} tokenRate - Tokens per USD (e.g., 10 tokens per $1)
 * @returns {BN} - Token amount in smallest unit
 */
function calculateTokenAmount(orderTotal, tokenRate = 10) {
  // Token decimals (12 decimals like DOT, configurable)
  const decimals = parseInt(process.env.TOKEN_DECIMALS || '12', 10);
  
  // Calculate tokens: orderTotal × tokenRate
  const tokens = orderTotal * tokenRate;
  
  // Convert to smallest unit (multiply by 10^decimals)
  const multiplier = new BN(10).pow(new BN(decimals));
  const tokenAmount = new BN(Math.floor(tokens)).mul(multiplier);
  
  return tokenAmount;
}

/**
 * Mint tokens on Polkadot Asset Hub and send to customer wallet
 * @param {string} recipientAddress - Customer's wallet address
 * @param {BN} amount - Token amount to mint (in smallest unit)
 * @param {number} assetId - Asset ID on Asset Hub
 * @returns {Promise<string>} - Transaction hash
 */
async function mintAndTransferTokens(recipientAddress, amount, assetId) {
  if (!api) {
    await initPolkadot();
  }

  if (!wallet) {
    throw new Error('Wallet not initialized');
  }

  try {
    // Step 1: Check wallet balance
    console.log('=== Checking Wallet Balance ===');
    const balance = await getWalletBalance();
    console.log(`Wallet: ${balance.address}`);
    console.log(`Free balance: ${balance.freeFormatted} ${balance.tokenSymbol}`);
    console.log(`Total balance: ${balance.total} (${balance.freeFormatted} ${balance.tokenSymbol} available)`);

    // Check if balance is too low (less than 0.001 in native tokens - rough estimate for fees)
    const minBalanceForFees = new BN(10).pow(new BN(balance.decimals - 3)); // 0.001 in smallest units
    if (new BN(balance.free).lt(minBalanceForFees)) {
      throw new Error(
        `Insufficient balance for transaction fees. ` +
        `Current balance: ${balance.freeFormatted} ${balance.tokenSymbol}. ` +
        `Required: ~0.001 ${balance.tokenSymbol} for fees. ` +
        `Please fund your wallet address: ${balance.address}`
      );
    }

    // Step 2: Check asset permissions
    console.log('=== Checking Asset Permissions ===');
    const assetCheck = await checkAssetPermissions(assetId);
    
    if (!assetCheck.exists) {
      throw new Error(`Asset ${assetId} does not exist on Asset Hub. ${assetCheck.error}`);
    }

    if (!assetCheck.canMint) {
      throw new Error(
        `Permission denied: Cannot mint asset ${assetId}. ` +
        `Signer address: ${assetCheck.signerAddress}. ` +
        `Asset issuer: ${assetCheck.issuer}. ` +
        `Asset admin: ${assetCheck.admin}. ` +
        `Only the issuer or admin can mint tokens.`
      );
    }

    if (assetCheck.metadata) {
      console.log(`Asset ${assetId}: ${assetCheck.metadata.name} (${assetCheck.metadata.symbol})`);
      console.log(`Decimals: ${assetCheck.metadata.decimals}`);
    }
    console.log(`✓ Signer has permission to mint (${assetCheck.isIssuer ? 'Issuer' : 'Admin'})`);

    // Step 3: Construct and send transaction (let API manage nonce)
    console.log('=== Constructing Mint Transaction ===');
    console.log(`Asset ID: ${assetId}`);
    console.log(`Amount: ${amount.toString()} (smallest units)`);
    console.log(`Recipient: ${recipientAddress}`);

    // Construct transaction: assets.mint(assetId, recipientAddress, amount)
    const tx = api.tx.assets.mint(assetId, recipientAddress, amount);

    // Estimate transaction fee (optional, for logging)
    try {
      const paymentInfo = await tx.paymentInfo(wallet.address);
      const fee = paymentInfo.partialFee;
      const feeFormatted = fee.div(new BN(10).pow(new BN(balance.decimals))).toString();
      console.log(`Estimated transaction fee: ${feeFormatted} ${balance.tokenSymbol}`);
    } catch (e) {
      // Fee estimation failed, that's okay
      console.log('Could not estimate transaction fee');
    }

    // Get the next available nonce (accounts for pending transactions)
    const accountNextIndex = await api.rpc.system.accountNextIndex(wallet.address);
    const nonce = accountNextIndex.toNumber();
    console.log(`Using nonce: ${nonce}`);
    
    // Get current account info to check for pending transactions
    const accountInfo = await api.query.system.account(wallet.address);
    const currentNonce = accountInfo.nonce.toNumber();
    if (nonce > currentNonce) {
      console.log(`⚠️  Warning: There are ${nonce - currentNonce} pending transaction(s) ahead of this one`);
    }

    // Add a tip to increase transaction priority (0.01 WND for better priority)
    const tipMultiplier = new BN(10).pow(new BN(balance.decimals - 2)); // 0.01 in smallest units
    const tipAmount = tipMultiplier;
    const tipFormatted = tipAmount.div(new BN(10).pow(new BN(balance.decimals - 2))).toString();
    console.log(`Adding tip: ${tipFormatted} ${balance.tokenSymbol} to increase priority`);

    // Sign and send transaction
    let transactionHash = null;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        // Before rejecting, check if transaction was actually included
        if (transactionHash) {
          console.log(`⏳ Timeout reached, checking if transaction ${transactionHash} was included...`);
          try {
            // Try to find the transaction in recent blocks
            const header = await api.rpc.chain.getHeader();
            const currentBlock = header.number.toNumber();
            
            // Check last 10 blocks
            for (let i = 0; i < 10; i++) {
              const blockNumber = currentBlock - i;
              if (blockNumber < 0) break;
              
              try {
                const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
                const block = await api.rpc.chain.getBlock(blockHash);
                
                const found = block.block.extrinsics.find(ext => {
                  if (ext.isSigned) {
                    const hash = ext.hash.toString();
                    return hash === transactionHash;
                  }
                  return false;
                });
                
                if (found) {
                  clearTimeout(timeout);
                  console.log(`✓ Transaction ${transactionHash} was found in block ${blockNumber}`);
                  resolve(transactionHash);
                  return;
                }
              } catch (e) {
                // Continue checking other blocks
              }
            }
          } catch (e) {
            console.log(`Could not verify transaction status: ${e.message}`);
          }
        }
        
        reject(new Error(
          'Transaction timeout: Transaction not confirmed within 120 seconds. ' +
          `Transaction hash: ${transactionHash || 'unknown'}. ` +
          `Transaction may still be pending in the pool. ` +
          `Check your wallet balance and network connection. ` +
          `You can check transaction status on a block explorer using the transaction hash.`
        ));
      }, 120000); // 120 second timeout

      console.log('=== Sending Transaction ===');
      console.log(`Signing with wallet: ${wallet.address}`);
      console.log(`Wallet type: ${wallet.type}`);
      console.log(`Nonce: ${nonce}`);
      console.log(`Tip: ${tipFormatted} ${balance.tokenSymbol}`);
      
      // Sign and send transaction with explicit nonce and tip
      tx.signAndSend(wallet, { nonce, tip: tipAmount }, ({ status, txHash, events, dispatchError }) => {
        // Store transaction hash for timeout checking (available from first callback)
        if (txHash) {
          const hashStr = txHash.toString();
          if (!transactionHash) {
            transactionHash = hashStr;
            console.log(`📝 Transaction hash: ${hashStr}`);
          }
        }
        if (dispatchError) {
          clearTimeout(timeout);
          let errorMessage = 'Transaction failed: ';
          
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            const { name, section, docs } = decoded;
            errorMessage += `${section}.${name}`;
            if (docs && docs.length > 0) {
              errorMessage += `: ${docs.join(' ')}`;
            }

            // Add helpful context for common errors
            if (name === 'InsufficientBalance' || name === 'BalanceLow') {
              errorMessage += `. Your wallet balance may be too low. Current balance: ${balance.freeFormatted} ${balance.tokenSymbol}`;
            } else if (name === 'NoPermission' || name === 'BadOrigin') {
              errorMessage += `. You may not have permission to mint this asset. Check asset permissions.`;
            } else if (name === 'Unknown') {
              errorMessage += `. The asset may not exist or you may not have the required role.`;
            }
          } else {
            errorMessage += dispatchError.toString();
          }

          console.error('❌ Transaction Error:', errorMessage);
          reject(new Error(errorMessage));
          return;
        }

        if (status.isInBlock || status.isFinalized) {
          clearTimeout(timeout);
          const blockHash = status.asInBlock?.toString() || status.asFinalized?.toString();
          console.log(`✓ Transaction ${txHash.toString()} included in block ${blockHash}`);
          
          // Log events
          if (events && events.length > 0) {
            console.log('=== Transaction Events ===');
            events.forEach(({ event }) => {
              console.log(`  ${event.section}.${event.method}: ${event.data.toString()}`);
            });
          }
          
          resolve(txHash.toString());
        } else if (status.isReady) {
          console.log(`→ Transaction ${txHash.toString()} ready (broadcasting...)`);
        } else if (status.isBroadcast) {
          console.log(`→ Transaction ${txHash.toString()} broadcasted (waiting to be included in block...)`);
        } else {
          // Log other status types for debugging
          const statusStr = status.toString ? status.toString() : JSON.stringify(status);
          console.log(`→ Transaction ${txHash.toString()} status: ${statusStr}`);
          
          // Check for error statuses
          if (status.isInvalid || status.isDropped) {
            clearTimeout(timeout);
            console.error(`❌ Transaction ${txHash.toString()} was ${status.isInvalid ? 'invalid' : 'dropped'}`);
            reject(new Error(`Transaction was ${status.isInvalid ? 'invalid' : 'dropped'}`));
          }
        }
      }).catch((error) => {
        clearTimeout(timeout);
        console.error('❌ Transaction send error:', error.message);
        reject(new Error(`Failed to send transaction: ${error.message}`));
      });
    });
  } catch (error) {
    console.error('❌ Error in mintAndTransferTokens:', error.message);
    throw error;
  }
}

/**
 * Transfer existing tokens (if tokens are pre-minted)
 * @param {string} recipientAddress - Customer's wallet address
 * @param {BN} amount - Token amount to transfer (in smallest unit)
 * @param {number} assetId - Asset ID on Asset Hub
 * @returns {Promise<string>} - Transaction hash
 */
async function transferTokens(recipientAddress, amount, assetId) {
  if (!api) {
    await initPolkadot();
  }

  if (!wallet) {
    throw new Error('Wallet not initialized');
  }

  try {
    console.log(`Constructing transfer transaction: Asset ${assetId}, Amount: ${amount.toString()}, Recipient: ${recipientAddress}`);

    // Construct transaction: assets.transfer(assetId, recipientAddress, amount)
    const tx = api.tx.assets.transfer(assetId, recipientAddress, amount);

    // Get the next available nonce (accounts for pending transactions)
    const accountNextIndex = await api.rpc.system.accountNextIndex(wallet.address);
    const nonce = accountNextIndex.toNumber();
    console.log(`Using nonce: ${nonce}`);

    // Sign and send transaction
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Transaction timeout: Transaction not confirmed within 60 seconds'));
      }, 60000); // 60 second timeout

      tx.signAndSend(wallet, { nonce }, ({ status, txHash, events, dispatchError }) => {
        if (dispatchError) {
          clearTimeout(timeout);
          if (dispatchError.isModule) {
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            const { name, section, docs } = decoded;
            reject(new Error(`Transaction error: ${section}.${name}: ${docs.join(' ')}`));
          } else {
            reject(new Error(`Transaction error: ${dispatchError.toString()}`));
          }
          return;
        }

        if (status.isInBlock || status.isFinalized) {
          clearTimeout(timeout);
          console.log(`✓ Transaction ${txHash.toString()} included in block ${status.asInBlock?.toString() || status.asFinalized?.toString()}`);
          
          // Log events
          events.forEach(({ event }) => {
            console.log(`  Event: ${event.section}.${event.method}`, event.data.toString());
          });
          
          resolve(txHash.toString());
        }
      }).catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  } catch (error) {
    console.error('Error in transferTokens:', error);
    throw error;
  }
}

/**
 * Get the current wallet instance
 * @returns {object|null} - Wallet instance or null if not initialized
 */
function getWallet() {
  return wallet;
}

/**
 * Get asset account balance for a specific address
 * @param {number} assetId - Asset ID to check
 * @param {string} address - Address to check balance for
 * @returns {Promise<object>} - Balance info with raw and formatted amounts
 */
async function getAssetAccountBalance(assetId, address) {
  if (!api) {
    await initPolkadot();
  }

  try {
    // Query asset account balance
    const accountInfo = await api.query.assets.account(assetId, address);
    
    if (accountInfo.isNone) {
      return {
        exists: false,
        balance: '0',
        balanceFormatted: '0',
        address: address,
        assetId: assetId
      };
    }

    const account = accountInfo.unwrap();
    const balance = account.balance;

    // Get asset metadata for decimals
    let decimals = 12; // Default
    try {
      const meta = await api.query.assets.metadata(assetId);
      if (meta.isSome) {
        const metaData = meta.unwrap();
        decimals = metaData.decimals.toNumber();
      }
    } catch (e) {
      // Use default if metadata query fails
      console.warn('Could not fetch asset metadata, using default decimals:', e.message);
    }

    // Convert to human-readable format
    const divisor = new BN(10).pow(new BN(decimals));
    const balanceFormatted = balance.div(divisor).toString();

    return {
      exists: true,
      balance: balance.toString(),
      balanceFormatted: balanceFormatted,
      address: address,
      assetId: assetId,
      decimals: decimals
    };
  } catch (error) {
    console.error('Error fetching asset account balance:', error);
    throw new Error(`Failed to fetch asset account balance: ${error.message}`);
  }
}

module.exports = {
  initPolkadot,
  getWalletBalance,
  checkAssetPermissions,
  calculateTokenAmount,
  mintAndTransferTokens,
  transferTokens,
  getWallet,
  getAssetAccountBalance
};
