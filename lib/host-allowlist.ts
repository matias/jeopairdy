/**
 * Host allowlist configuration
 *
 * Set NEXT_PUBLIC_HOST_ALLOWLIST in .env.local to restrict who can host games.
 * Format: comma-separated list of email addresses
 * Example: NEXT_PUBLIC_HOST_ALLOWLIST=alice@example.com,bob@example.com
 *
 * If not set or empty, anyone with a Google account can host.
 */

export function getHostAllowlist(): string[] {
  const allowlist = process.env.NEXT_PUBLIC_HOST_ALLOWLIST;
  if (!allowlist || allowlist.trim() === '') {
    return []; // Empty means everyone is allowed
  }
  return allowlist.split(',').map((email) => email.trim().toLowerCase());
}

export function isHostAllowed(email: string | null | undefined): boolean {
  if (!email) return false;

  const allowlist = getHostAllowlist();

  // If allowlist is empty, everyone is allowed
  if (allowlist.length === 0) {
    return true;
  }

  // Check if email is in allowlist
  return allowlist.includes(email.toLowerCase());
}

export function hasHostAllowlist(): boolean {
  const allowlist = getHostAllowlist();
  return allowlist.length > 0;
}
