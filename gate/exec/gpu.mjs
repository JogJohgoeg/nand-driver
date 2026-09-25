// gatesim R1 WebGPU 宿主：Deno（wgpu→Vulkan）与浏览器共用。只做建缓冲、建管线、dispatch、读回。

export async function initGPU() {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no WebGPU adapter');
  const ts = adapter.features.has('timestamp-query');
  const lim = adapter.limits;
  const device = await adapter.requestDevice({
    requiredFeatures: ts ? ['timestamp-query'] : [],
    requiredLimits: {
      maxStorageBufferBindingSize: lim.maxStorageBufferBindingSize,
      maxBufferSize: lim.maxBufferSize,
      maxStorageBuffersPerShaderStage: Math.min(lim.maxStorageBuffersPerShaderStage, 10),
      maxComputeWorkgroupsPerDimension: lim.maxComputeWorkgroupsPerDimension,
      maxComputeWorkgroupStorageSize: Math.min(lim.maxComputeWorkgroupStorageSize, 65536),
    },
  });
  device.addEventListener?.('uncapturederror', e => { console.error('GPU error', e.error?.message); });
  const info = adapter.info || {};
  return { device, ts, info: { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description,
    maxStorageBufferBindingSize: lim.maxStorageBufferBindingSize, maxBufferSize: lim.maxBufferSize, timestamp: ts } };
}
