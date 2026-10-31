import {useState} from 'react'
import {localDb} from '../lib/local'
export function ListRename({id,name}:{id:string;name:string}) {
  const [editing,setEditing]=useState(false),[value,setValue]=useState(name),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  if(!editing)return <button className="data-action" type="button" onClick={()=>{setValue(name);setError('');setEditing(true)}}>Rename list</button>
  return <form className="list-rename" onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);try{await localDb()?.lists.rename(id,value);setEditing(false)}catch(e){setError(e instanceof Error?e.message:'Could not rename list.')}finally{setBusy(false)}}}><label>List name<input autoFocus aria-label="Rename list" value={value} maxLength={80} onChange={event=>setValue(event.target.value)}/></label><button disabled={busy} type="submit">Save name</button><button type="button" onClick={()=>setEditing(false)}>Cancel</button>{error && <p role="alert">{error}</p>}</form>
}
