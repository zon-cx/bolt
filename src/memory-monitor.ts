/**
 * Memory monitoring utility for preventing out-of-memory crashes
 */

export interface MemoryUsage {
  rss: number;           // Resident Set Size (total memory allocated)
  heapUsed: number;      // Heap memory used by JavaScript objects
  heapTotal: number;     // Total heap memory allocated
  external: number;      // Memory used by C++ objects bound to JavaScript
  arrayBuffers: number;  // Memory used by ArrayBuffers and SharedArrayBuffers
}

export interface MemoryThresholds {
  warning: number;       // MB - Log warning when exceeded
  critical: number;      // MB - Log critical when exceeded
  max: number;          // MB - Force garbage collection when exceeded
}

const DEFAULT_THRESHOLDS: MemoryThresholds = {
  warning: 400,    // 400MB
  critical: 450,   // 450MB  
  max: 500         // 500MB
};

export class MemoryMonitor {
  private interval: NodeJS.Timeout | null = null;
  private thresholds: MemoryThresholds;
  private checkInterval: number;

  constructor(
    thresholds: Partial<MemoryThresholds> = {},
    checkIntervalMs: number = 30000 // 30 seconds
  ) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.checkInterval = checkIntervalMs;
  }

  /**
   * Get current memory usage in MB
   */
  getMemoryUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024)
    };
  }

  /**
   * Log memory usage with appropriate log level
   */
  logMemoryUsage(): void {
    const usage = this.getMemoryUsage();
    const totalUsed = usage.heapUsed + usage.external + usage.arrayBuffers;
    
    const logData = {
      timestamp: new Date().toISOString(),
      memory: usage,
      totalUsed: `${totalUsed}MB`,
      thresholds: this.thresholds
    };

    if (totalUsed >= this.thresholds.max) {
      console.error('🚨 CRITICAL: Memory usage at maximum threshold', logData);
      this.forceGarbageCollection();
    } else if (totalUsed >= this.thresholds.critical) {
      console.warn('⚠️  CRITICAL: Memory usage approaching maximum', logData);
      this.forceGarbageCollection();
    } else if (totalUsed >= this.thresholds.warning) {
      console.warn('⚠️  WARNING: High memory usage detected', logData);
    } else {
      console.log('📊 Memory usage normal', logData);
    }
  }

  /**
   * Force garbage collection if available
   */
  forceGarbageCollection(): void {
    if (global.gc) {
      console.log('🧹 Forcing garbage collection...');
      global.gc();
      
      // Log memory after GC
      setTimeout(() => {
        const afterGC = this.getMemoryUsage();
        const totalAfter = afterGC.heapUsed + afterGC.external + afterGC.arrayBuffers;
        console.log(`🧹 Garbage collection complete. Memory after GC: ${totalAfter}MB`);
      }, 100);
    } else {
      console.warn('⚠️  Garbage collection not available. Add --expose-gc to NODE_OPTIONS');
    }
  }

  /**
   * Start monitoring memory usage
   */
  start(): void {
    if (this.interval) {
      console.warn('Memory monitor already running');
      return;
    }

    console.log(`🔍 Starting memory monitor (checking every ${this.checkInterval}ms)`);
    console.log(`📊 Thresholds: Warning=${this.thresholds.warning}MB, Critical=${this.thresholds.critical}MB, Max=${this.thresholds.max}MB`);
    
    // Initial check
    this.logMemoryUsage();
    
    this.interval = setInterval(() => {
      this.logMemoryUsage();
    }, this.checkInterval);
  }

  /**
   * Stop monitoring memory usage
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('🛑 Memory monitor stopped');
    }
  }

  /**
   * Check if memory usage is healthy
   */
  isHealthy(): boolean {
    const usage = this.getMemoryUsage();
    const totalUsed = usage.heapUsed + usage.external + usage.arrayBuffers;
    return totalUsed < this.thresholds.critical;
  }

  /**
   * Get memory health status
   */
  getHealthStatus(): 'healthy' | 'warning' | 'critical' | 'max' {
    const usage = this.getMemoryUsage();
    const totalUsed = usage.heapUsed + usage.external + usage.arrayBuffers;
    
    if (totalUsed >= this.thresholds.max) return 'max';
    if (totalUsed >= this.thresholds.critical) return 'critical';
    if (totalUsed >= this.thresholds.warning) return 'warning';
    return 'healthy';
  }
}

// Export singleton instance
export const memoryMonitor = new MemoryMonitor();

// Auto-start monitoring in production
if (process.env.NODE_ENV === 'production') {
  memoryMonitor.start();
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, stopping memory monitor...');
    memoryMonitor.stop();
  });
  
  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, stopping memory monitor...');
    memoryMonitor.stop();
  });
} 