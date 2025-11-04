const { ApiPromise, WsProvider } = require('@polkadot/api');
const { Keyring } = require('@polkadot/keyring');

let api = null;
let wallet = null;

async function ensureApi() {
  if (api) return api;
  const wsUrl = process.env.POLKADOT_WS_URL || 'wss://polkadot-asset-hub-rpc.polkadot.io';
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
  const id = desiredAssetId;

  try {
    // Try to read asset to see if it exists
    const exists = await api.query.assets.metadata(id).catch(() => null);
    if (exists && exists.isSome) {
      return id;
    }
  } catch {}

  // Create asset and set team/metadata
  const txs = [];
  if (api.tx.assets?.create) {
    txs.push(api.tx.assets.create(id, wallet.address, minBalance));
  } else if (api.tx.assets?.createAsset) {
    txs.push(api.tx.assets.createAsset(id, wallet.address, minBalance));
  }
  if (api.tx.assets?.setTeam) {
    txs.push(api.tx.assets.setTeam(id, wallet.address, wallet.address, wallet.address));
  }
  if (api.tx.assets?.setMetadata) {
    txs.push(api.tx.assets.setMetadata(id, name, symbol, decimals));
  }

  if (txs.length === 0) {
    throw new Error('No asset creation extrinsics available on this chain version');
  }

  await new Promise((resolve, reject) => {
    api.tx.utility
      ? api.tx.utility.batchAll(txs)
          .signAndSend(wallet, ({ status, dispatchError }) => {
            if (dispatchError) {
              reject(new Error(dispatchError.toString()));
              return;
            }
            if (status.isInBlock || status.isFinalized) {
              resolve();
            }
          })
      : txs[0].signAndSend(wallet, ({ status, dispatchError }) => {
          if (dispatchError) {
            reject(new Error(dispatchError.toString()));
            return;
          }
          if (status.isInBlock || status.isFinalized) {
            resolve();
          }
        });
  });

  return id;
}

function getSignerAddress() {
  if (!wallet) return null;
  return wallet.address;
}

module.exports = { createAssetIfMissing, getSignerAddress };


