import {useId,useState} from 'react'
import {createPortal} from 'react-dom'
import type {coveragePins} from './coverage-pins'

export function MapCoveragePin({pin}:{pin:ReturnType<typeof coveragePins>[number]}) {
  const id=useId(),[anchor,setAnchor]=useState<{left:number;top:number}|null>(null)
  const show=(element:HTMLElement)=>{
    const box=element.getBoundingClientRect()
    setAnchor({left:Math.max(12,Math.min(window.innerWidth-292,box.left-120)),top:Math.max(12,Math.min(window.innerHeight-180,box.bottom+8))})
  }
  return <>
    <button type="button" data-pin="1" data-on="y" data-name={pin.name} data-count={pin.count}
      aria-label={pin.count>1 ? pin.count+' locations: '+pin.name : pin.name} aria-describedby={anchor?id:undefined}
      onMouseEnter={event=>show(event.currentTarget)} onMouseLeave={()=>setAnchor(null)}
      onFocus={event=>show(event.currentTarget)} onBlur={()=>setAnchor(null)}
      onClick={event=>show(event.currentTarget)} onKeyDown={event=>{if(event.key==='Escape')setAnchor(null)}}
      style={{position:'absolute',left:pin.x,top:pin.y,transform:'translate(-50%,-50%)',width:36,height:36,padding:0,border:'2px solid #F5F5F4',borderRadius:999,background:pin.count>1?'#1C1C1C':'#C8D5BB',color:pin.count>1?'#fff':'#1C1C1C',fontSize:12,fontWeight:700,cursor:'pointer'}}>
      {pin.ini}
    </button>
    {anchor && createPortal(<div id={id} role="tooltip" style={{position:'fixed',...anchor,zIndex:200,width:280,maxWidth:'calc(100vw - 24px)',maxHeight:160,overflow:'auto',padding:12,borderRadius:12,background:'#1C1C1C',color:'#fff',fontSize:13,whiteSpace:'pre-line',boxShadow:'0 8px 24px #0004'}}>{pin.name}</div>,document.body)}
  </>
}
