import type { FinderScan } from './useFinderScan'
import { FinderScanProgress } from './FinderScanProgress'
export function DecisionScanProgress({scan}:{scan:FinderScan<{leadId:string}>}) {
  const failedIds=[...new Set(scan.rows.filter(row=>row.lookupOutcome?.status==='error').map(row=>row.leadId))]
  return <FinderScanProgress kind="dm" scan={{...scan,retryCount:failedIds.length,retry:()=>scan.scanImported(failedIds)}}/>
}
