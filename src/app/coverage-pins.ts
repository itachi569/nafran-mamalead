type LocatedLead = {id:string;name:string;latitude:number|null;longitude:number|null}

/** A compact coverage plot: all known coordinates are represented; nearby locations cluster. */
export function coveragePins(leads: LocatedLead[]) {
  const points=leads.filter((lead):lead is LocatedLead & {latitude:number;longitude:number}=>
    typeof lead.latitude==='number' && typeof lead.longitude==='number' && Number.isFinite(lead.latitude) && Number.isFinite(lead.longitude))
  if(!points.length)return []
  const lats=points.map(p=>p.latitude),lngs=points.map(p=>p.longitude)
  const minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs)
  const cells=new Map<string, {col:number;row:number;leads:LocatedLead[]}>()
  for(const point of points){
    const x=maxLng===minLng?.5:(point.longitude-minLng)/(maxLng-minLng)
    const y=maxLat===minLat?.5:1-(point.latitude-minLat)/(maxLat-minLat)
    const col=Math.min(5,Math.floor(x*6)),row=Math.min(3,Math.floor(y*4)),key=col+':'+row
    const cell=cells.get(key) ?? {col,row,leads:[]}
    cell.leads.push(point);cells.set(key,cell)
  }
  return [...cells.values()].map(cell=>({
    ids:cell.leads.map(lead=>lead.id),count:cell.leads.length,
    name:cell.leads.map(lead=>lead.name).join('\n'),
    ini:cell.leads.length>1?String(cell.leads.length):cell.leads[0].name.split(/\s+/).map(word=>word.match(/[\p{L}\p{N}]/u)?.[0]).filter(Boolean).slice(0,2).join('').toUpperCase(),
    x:(10+(cell.col+.5)*80/6)+'%',y:(10+(cell.row+.5)*80/4)+'%',
  }))
}
