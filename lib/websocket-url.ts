// Auto-detect WebSocket URL based on current hostname
// This allows the app to work on localhost or local network IP addresses
export function getWebSocketUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || '3001';
    return `${protocol}//${hostname}:${wsPort}`;
  }
  return process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
}

