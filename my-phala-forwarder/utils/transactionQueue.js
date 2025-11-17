const BN = require('@polkadot/util').BN;

class TransactionQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.pendingTransactions = new Map(); // nonce -> promise
  }

  async add(transactionFn, options = {}) {
    const {
      maxRetries = 3,
      baseDelay = 2000, // 2 seconds
      maxDelay = 30000, // 30 seconds
      baseTip = 2000000000, // 0.002 WND
      tipMultiplier = 1.5, // Increase tip by 50% each retry
    } = options;

    return new Promise((resolve, reject) => {
      this.queue.push({
        transactionFn,
        options: { maxRetries, baseDelay, maxDelay, baseTip, tipMultiplier },
        resolve,
        reject,
        retries: 0,
      });

      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      
      try {
        const result = await this.executeWithRetry(
          item.transactionFn,
          item.options,
          item.retries
        );
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }

    this.processing = false;
  }

  async executeWithRetry(transactionFn, options, retryCount = 0) {
    const { maxRetries, baseDelay, maxDelay, baseTip, tipMultiplier } = options;

    try {
      // Calculate tip for this retry (increase with each retry)
      // tip = baseTip * (tipMultiplier ^ retryCount)
      const multiplier = Math.pow(tipMultiplier, retryCount);
      // Convert multiplier to integer percentage (e.g., 1.5 -> 150, then divide by 100)
      const multiplierPercent = Math.floor(multiplier * 100);
      const tip = new BN(baseTip).muln(multiplierPercent).divn(100);
      
      // Wait for pending transactions if this is a retry
      if (retryCount > 0) {
        const delay = Math.min(baseDelay * Math.pow(2, retryCount - 1), maxDelay);
        console.log(`⏳ Waiting ${delay}ms before retry ${retryCount}/${maxRetries} (tip: ${tip.toString()})...`);
        await this.waitForPendingTransactions(delay);
      } else {
        console.log(`📤 Sending transaction with tip: ${tip.toString()}`);
      }

      return await transactionFn(tip);
    } catch (error) {
      const isPriorityError = error.message && error.message.includes('Priority is too low');
      
      if (isPriorityError && retryCount < maxRetries) {
        console.log(`⚠️ Priority error on attempt ${retryCount + 1}/${maxRetries + 1}, will retry with higher tip...`);
        return this.executeWithRetry(transactionFn, options, retryCount + 1);
      }
      
      throw error;
    }
  }

  async waitForPendingTransactions(minDelay) {
    // Wait at least minDelay
    await new Promise(resolve => setTimeout(resolve, minDelay));
    
    // Additional wait for blockchain to process pending transactions
    // This gives time for the transaction pool to clear
    const extraWait = Math.min(minDelay * 2, 10000); // Max 10 seconds
    await new Promise(resolve => setTimeout(resolve, extraWait));
  }
}

// Singleton instance
const transactionQueue = new TransactionQueue();

module.exports = { transactionQueue, TransactionQueue };

