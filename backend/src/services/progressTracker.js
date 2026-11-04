const EventEmitter = require('events');

/**
 * Real-Time Progress Tracker for Contract Ingestion & Analysis Pipelines
 * Uses an EventEmitter pattern for Server-Sent Events (SSE) broadcasting.
 */
class ProgressTracker extends EventEmitter {
  constructor() {
    super();
    // Allow multiple concurrent listeners per contract
    this.setMaxListeners(100);
    // In-memory cache of latest progress per contract
    this.cache = new Map();
  }

  /**
   * Update progress for a contract and notify all active SSE streams
   * @param {string} contractId
   * @param {object} payload
   * @param {'QUEUED'|'PARSING'|'CHUNKING'|'EMBEDDING'|'ANALYZING'|'COMPLETED'|'FAILED'} payload.stage
   * @param {number} payload.progress 0 - 100
   * @param {string} payload.message Human-readable status description
   * @param {object} [payload.details] Optional metadata (e.g. page_count, chunk_count)
   */
  updateProgress(contractId, payload) {
    if (!contractId) return;

    const event = {
      contractId,
      stage: payload.stage,
      progress: Math.min(100, Math.max(0, payload.progress || 0)),
      message: payload.message || '',
      details: payload.details || {},
      timestamp: new Date().toISOString(),
    };

    this.cache.set(contractId, event);
    this.emit(`progress:${contractId}`, event);

    // Evict terminal states from cache after 5 minutes
    if (payload.stage === 'COMPLETED' || payload.stage === 'FAILED') {
      setTimeout(() => {
        if (this.cache.get(contractId)?.timestamp === event.timestamp) {
          this.cache.delete(contractId);
        }
      }, 5 * 60 * 1000).unref();
    }
  }

  /**
   * Get current progress state for a contract if cached
   * @param {string} contractId
   * @returns {object|null}
   */
  getProgress(contractId) {
    return this.cache.get(contractId) || null;
  }

  /**
   * Clear cache for testing or manual eviction
   */
  clear() {
    this.cache.clear();
  }
}

const progressTracker = new ProgressTracker();
module.exports = progressTracker;

