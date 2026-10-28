/** Contact priority is separate from SMTP deliverability: a Valid legal-notice mailbox is
 * still not the business's main enquiry address. Usage frequency cannot be inferred here. */
export function emailContactPriority(value:string,source=''):number {
 const local=value.trim().toLowerCase().split('@')[0]??''
 let priority=/^(?:info|hello|hi|contact|enquiries|enquiry|mail)$/.test(local)?30:/^(?:office|reception|bookings|appointments|sales|admin|support|team)$/.test(local)?18:0
 if(/^(?:notice|notices|legal|privacy|abuse|compliance|copyright|webmaster|noreply|no-reply|donotreply|billing|accounts|careers|jobs|press|marketing)$/.test(local))priority-=60
 try{const path=new URL(source).pathname;if(/(?:^|\/)(?:contact(?:-us)?|contactus|reach-us|get-in-touch)(?:\/|\.|$)/i.test(path))priority+=8;if(/(?:^|\/)(?:privacy|legal|terms|policies)(?:\/|\.|-|$)/i.test(path))priority-=20}catch{/* Manually supplied addresses need no source URL. */}
 return priority
}
export function compareEmailContacts(a:{value:string;score?:number|null;source?:string},b:{value:string;score?:number|null;source?:string}):number {
 return emailContactPriority(b.value,b.source)-emailContactPriority(a.value,a.source)||(b.score??-1)-(a.score??-1)||a.value.localeCompare(b.value)
}
