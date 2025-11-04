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
    // Connect to Polkadot Asset Hub (can be testnet or mainnet)
    const wsUrl = process.env.POLKADOT_WS_URL || 'wss://polkadot-asset-hub-rpc.polkadot.io';
    console.log('Connecting to Polkadot Asset Hub:', wsUrl);
    
    const wsProvider = new WsProvider(wsUrl);
    api = await ApiPromise.create({ provider: wsProvider });
    
    // Wait for API to be ready
    await api.isReady;
    
    // Initialize keyring
    keyring = new Keyring({ type: 'sr25519' });
    
    // Load Phat Contract's wallet from environment
    const mnemonic = process.env.PHAT_CONTRACT_MNEMONIC;
    const seed = process.env.PHAT_CONTRACT_SEED;
    
    if (!mnemonic && !seed) {
      throw new Error('PHAT_CONTRACT_MNEMONIC or PHAT_CONTRACT_SEED must be set');
    }
    
    if (mnemonic) {
      wallet = keyring.addFromMnemonic(mnemonic);
    } else if (seed) {
      wallet = keyring.addFromUri(seed);
    }
    
    console.log('✓ Connected to Polkadot Asset Hub');
    console.log('✓ Wallet address:', wallet.address);
    
    return api;
  } catch (error) {
    console.error('Error initializing Polkadot connection:', error);
    throw error;
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
    // Get account info for nonce
    const accountInfo = await api.query.system.account(wallet.address);
    const nonce = accountInfo.nonce;

    console.log(`Constructing mint transaction: Asset ${assetId}, Amount: ${amount.toString()}, Recipient: ${recipientAddress}`);

    // Construct transaction: assets.mint(assetId, recipientAddress, amount)
    const tx = api.tx.assets.mint(assetId, recipientAddress, amount);

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
    console.error('Error in mintAndTransferTokens:', error);
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
    // Get account info for nonce
    const accountInfo = await api.query.system.account(wallet.address);
    const nonce = accountInfo.nonce;

    console.log(`Constructing transfer transaction: Asset ${assetId}, Amount: ${amount.toString()}, Recipient: ${recipientAddress}`);

    // Construct transaction: assets.transfer(assetId, recipientAddress, amount)
    const tx = api.tx.assets.transfer(assetId, recipientAddress, amount);

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

module.exports = {
  initPolkadot,
  calculateTokenAmount,
  mintAndTransferTokens,
  transferTokens
};
