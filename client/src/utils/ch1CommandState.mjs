export function commandOutcome(pending, commands = [], now = Date.now()) {
  if (!pending) return 'idle'
  const observed = commands.find(command => command.id === pending.id)
  if (observed?.status === 'applied') return 'applied'
  if (observed?.status === 'timeout' || now >= Date.parse(pending.expires_at)) return 'timeout'
  return 'pending'
}
