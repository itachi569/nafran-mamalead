import { Fragment } from 'react'
/** Limited Markdown, rendered as React text nodes. No HTML or arbitrary link execution. */
export function AssistText({text}:{text:string}) {
  return <>{text.split('\n').map((line,index)=><Fragment key={index}>{index>0&&<br/>}{line.split(/(\*\*[^*]+\*\*)/g).map((part,i)=>part.startsWith('**')&&part.endsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:<Fragment key={i}>{part}</Fragment>)}</Fragment>)}</>
}
