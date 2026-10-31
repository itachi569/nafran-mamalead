/** Calendar dates shown to the user follow their device timezone; stored event times stay UTC. */
export function localDate(value: string | Date = new Date(), timeZone?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
  const part = (type: string) => parts.find(item=>item.type===type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
