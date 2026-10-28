/** Roman Urdu often shares words with Roman Hindi. Keep the user's Latin script and Urdu style. */
export function usesRomanUrdu(text:string):boolean {
  if(/[^\u0000-\u024f\s\d\p{P}\p{S}]/u.test(text))return false
  return /\b(?:roman\s*urdu|mujh?y?|mujhe|mujhy|mjy|mny|aap|apka|aapka|apki|aapki|kasy|kaise|kesy|kese|kyun|q|ky[au]|kya|krna|karna|karo|kro|karein|kren|btao|batao|bta|bata|cha?hiye|chahiye|chaeya|chahta|hun|hoon|hain|nahi|nhi|nahin|samjhao|kar\s*do|kr\s*do|karny|karne|hog[ai]|mily|mile|baqi|baki|kitn[aeiy]|hamara|hamari|hamy|hamain|aik|theek|thik|shukriya)\b/i.test(text)
}
export function assistMessagesWithLanguageHint<Message extends {role:'user'|'assistant';content:string}>(messages:Message[]):Message[] {
  const last=messages.at(-1)
  if(last?.role!=='user')return messages
  const short=/^[a-z\s!?.,]{1,28}$/i.test(last.content)&&last.content.trim().split(/\s+/).length<=3
  const prior=messages.slice(0,-1).filter(message=>message.role==='user').at(-1)
  if(!usesRomanUrdu(last.content)&&!(short&&prior&&usesRomanUrdu(prior.content)))return messages
  const hint='Jawab meri tarah Roman Urdu (Latin letters) mein dein. Hindi/Devanagari mein na badlein. Agar main wazeh taur par koi aur language mangun to woh use karein.\n\n'
  return [...messages.slice(0,-1),{...last,content:hint+last.content.slice(0,Math.max(0,1200-hint.length))}]
}
