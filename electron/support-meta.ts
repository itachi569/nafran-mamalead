import {scrubSupportText} from './support-data'
export function buildSupportMeta(input:{app:{version:string;platform:string;arch:string;osRelease:string;electron:string;isPackaged:boolean};license?:{kind?:string;last4?:string;active?:boolean};diagnostics:boolean;locale?:string;timezone?:string;lastErrors?:{at:string;text:string}[];counts?:{leads:number;runs:number};emailValidityProvider?:string|null}) {
 const l=input.license,meta:Record<string,unknown>={app:{version:input.app.version,platform:input.app.platform,arch:input.app.arch,osRelease:input.app.osRelease,electron:input.app.electron,isPackaged:input.app.isPackaged},license:{kind:['trial','lifetime'].includes(l?.kind||'')?l!.kind:null,last4:/^[A-Z0-9]{4}$/i.test(l?.last4||'')?l!.last4:null,active:l?.active===true}}
 if(input.diagnostics)Object.assign(meta,{locale:input.locale,timezone:input.timezone,lastErrors:(input.lastErrors||[]).slice(-5).map(e=>({at:e.at,text:scrubSupportText(e.text).slice(0,800)})),counts:{leads:Math.max(0,Number(input.counts?.leads)||0),runs:Math.max(0,Number(input.counts?.runs)||0)},emailValidityProvider:input.emailValidityProvider||null})
 return meta
}
