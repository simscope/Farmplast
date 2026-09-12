// Match the overview SQL exactly: latest_updated_at > now() - interval '45 seconds'.
export function isCh3Online(latestUpdatedAt, now = Date.now()) {
  if (typeof latestUpdatedAt !== 'string' || !latestUpdatedAt.trim()) return false
  const updatedAt = Date.parse(latestUpdatedAt)
  return Number.isFinite(updatedAt) && updatedAt > now - 45000
}
