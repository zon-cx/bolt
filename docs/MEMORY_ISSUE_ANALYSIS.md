# Registry Memory Issue Analysis & Solutions

## 🚨 Problem Summary

The registry deployment crashed with a **JavaScript heap out of memory** error:

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

## 📊 Root Cause Analysis

### 1. **Memory Exhaustion**
- Heap usage reached ~277-279MB
- Default Node.js heap limit exceeded
- Multiple garbage collection cycles failed to free sufficient memory

### 2. **Memory Leak Sources**

#### **Transport Management Issues**
```typescript
// In registry.mcp.server.ts
const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>
};
```
- Transports accumulate in memory without proper cleanup
- Each transport holds references to MCP servers, event stores, and Yjs documents
- Cleanup timeouts may not be firing correctly

#### **Yjs Document Accumulation**
```typescript
const doc = connectYjs("@mcp.registry");
const agentsStore = doc.getMap<agentConfig>("agents");
```
- Yjs documents persist in memory indefinitely
- No explicit cleanup of old documents or data
- Collaborative editing features can accumulate large amounts of data

#### **Resource Reading Without Limits**
```typescript
// Large resource contents kept in memory
const result = await client.readResource({ uri });
processedContents = result.contents.map((content) => content.text as string)
```
- Large resource contents stored in memory
- No pagination or streaming for large resources
- JSON parsing of large responses

### 3. **Insufficient Memory Configuration**
```yaml
# manifest.yaml
memory: 512M
```
- Only 512MB allocated to the container
- Node.js default heap much smaller than container memory
- No explicit heap size configuration

## 🔧 Solutions Implemented

### 1. **Memory Monitoring System**
Created `src/memory-monitor.ts` with:
- Real-time memory usage tracking
- Configurable thresholds (warning: 400MB, critical: 450MB, max: 500MB)
- Automatic garbage collection when thresholds exceeded
- Health status reporting

### 2. **Enhanced Cleanup Mechanisms**
```typescript
// Improved transport cleanup
function cleanupTransport(sessionId: string) {
    // Close transports properly
    // Clear timeouts
    // Force garbage collection
    // Log memory usage
}
```

### 3. **Process Lifecycle Management**
```typescript
// Graceful shutdown handlers
process.on('SIGTERM', cleanupAll);
process.on('SIGINT', cleanupAll);
```

### 4. **Memory Configuration Updates**
```yaml
# Updated manifest.yaml
memory: 1G
env:
  NODE_OPTIONS: "--max-old-space-size=1024 --max-http-header-size=80000 --expose-gc"
```

### 5. **Deployment Automation**
Created `deploy-with-memory-fix.sh` script that:
- Automatically updates memory settings before deployment
- Shows configuration changes
- Restores original manifest after deployment

## 📈 Memory Usage Patterns

### **Before Fix**
- Memory usage: 277-279MB (crashed)
- No monitoring or alerts
- No automatic cleanup
- Default heap limits

### **After Fix**
- Memory allocation: 1GB container, 1GB heap
- Real-time monitoring every 30 seconds
- Automatic garbage collection at 450MB
- Graceful cleanup on shutdown

## 🚀 Deployment Instructions

### **Option 1: Use Automated Script**
```bash
./deploy-with-memory-fix.sh
```

### **Option 2: Manual Deployment**
1. Update `manifest.yaml`:
   ```yaml
   memory: 1G
   env:
     NODE_OPTIONS: "--max-old-space-size=1024 --max-http-header-size=80000 --expose-gc"
   ```

2. Build and deploy:
   ```bash
   npm run build:mta
   cf deploy mta_archives/archive.0.1.mtar -f --retries 1
   ```

## 🔍 Monitoring & Alerts

### **Memory Thresholds**
- **Warning**: 400MB - Logs warning message
- **Critical**: 450MB - Logs critical message + forces GC
- **Maximum**: 500MB - Logs error + forces GC

### **Log Messages**
```
📊 Memory usage normal { totalUsed: "350MB" }
⚠️  WARNING: High memory usage detected { totalUsed: "420MB" }
⚠️  CRITICAL: Memory usage approaching maximum { totalUsed: "470MB" }
🚨 CRITICAL: Memory usage at maximum threshold { totalUsed: "510MB" }
🧹 Forcing garbage collection...
```

### **Health Checks**
```typescript
memoryMonitor.isHealthy() // Returns boolean
memoryMonitor.getHealthStatus() // Returns 'healthy' | 'warning' | 'critical' | 'max'
```

## 🛠️ Additional Recommendations

### **1. Resource Streaming**
Implement streaming for large resource reads:
```typescript
// Instead of loading entire resource into memory
const stream = await client.readResourceStream({ uri });
```

### **2. Yjs Document Cleanup**
Add periodic cleanup of old Yjs documents:
```typescript
// Clean up documents older than 24 hours
const cleanupOldDocuments = () => {
    // Implementation for document cleanup
};
```

### **3. Transport Limits**
Implement stricter transport limits:
```typescript
const MAX_TRANSPORT_LIFETIME = 3 * 60 * 1000; // 3 minutes instead of 5
const MAX_CONCURRENT_TRANSPORTS = 50; // Reduce from 100
```

### **4. Memory Profiling**
Add memory profiling in development:
```bash
node --inspect --expose-gc src/registry.mcp.server.ts
```

## 📊 Expected Results

After implementing these fixes:
- **Memory usage**: Should stay below 400MB under normal load
- **Crashes**: Eliminated heap out of memory errors
- **Performance**: Better resource utilization
- **Monitoring**: Real-time visibility into memory health
- **Recovery**: Automatic garbage collection prevents issues

## 🔄 Maintenance

### **Regular Monitoring**
- Check memory logs daily
- Monitor for memory leak patterns
- Review transport cleanup effectiveness

### **Performance Tuning**
- Adjust thresholds based on actual usage patterns
- Optimize resource reading strategies
- Consider implementing resource caching with TTL

### **Scaling Considerations**
- Monitor memory usage as user load increases
- Consider horizontal scaling if memory usage grows
- Implement connection pooling for better resource management 
