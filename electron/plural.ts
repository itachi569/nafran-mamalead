/** Shared wording for scan, history and notification counters. */
export function plural(count: number, singular: string, multiple = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : multiple}`
}
