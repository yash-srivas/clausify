/**
 * Concurrency-controlled in-process Queue for AI Pipeline Execution
 * Prevents system overload and resource starvation during batch document ingestion.
 */
class PipelineQueue {
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  /**
   * Enqueue a job function that returns a Promise
   * @param {string} contractId
   * @param {() => Promise<any>} taskFn
   * @returns {Promise<any>}
   */
  enqueue(contractId, taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        contractId,
        taskFn,
        resolve,
        reject,
        enqueuedAt: Date.now(),
      });
      this._drain();
    });
  }

  /**
   * Internal scheduler to run tasks up to maximum concurrency limit
   */
  async _drain() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { contractId, taskFn, resolve, reject } = this.queue.shift();

    try {
      const result = await taskFn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.running--;
      this._drain();
    }
  }

  /**
   * Return number of jobs waiting in queue
   */
  get pendingCount() {
    return this.queue.length;
  }

  /**
   * Return number of jobs currently executing
   */
  get activeCount() {
    return this.running;
  }

  /**
   * Clear pending queue (e.g. for teardown in tests)
   */
  clear() {
    this.queue = [];
  }
}

const pipelineQueue = new PipelineQueue(2);
module.exports = pipelineQueue;

