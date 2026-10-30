import { billingAssistChat } from './billing/client'
import { assistMessagesWithLanguageHint } from './assist-language'
import {assistMessagesWithWorkflowHint} from './assist-workflow'
export type AssistRole = 'user' | 'assistant'
export type AssistMessage = { role: AssistRole; content: string }
export type AssistChatRequest = { messages?: AssistMessage[]; context?: Record<string, string | number | boolean | null> }
export type AssistChatResult = { text: string; model: string }

/** Provider credentials stay on the server, outside every desktop installer. */
export async function askAssist(request: AssistChatRequest = {}): Promise<AssistChatResult> {
  const messages = (Array.isArray(request.messages) ? request.messages : [])
    .filter((message) => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-8).map((message) => ({ role: message.role, content: message.content.trim().slice(0, 1200) }))
    .filter((message) => message.content)
  const context: Record<string, string | number | boolean | null> = {}
  for (const name of ['page', 'totalLeads', 'leadsWithEmail', 'leadsWithPhone', 'leadsWithSocialProfiles', 'leadsReadyToExport', 'mapsRuns', 'placesCaptured']) {
    const value = request.context?.[name]
    if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || value === null) context[name] = value
    else if (typeof value === 'string') context[name] = value.slice(0, 100)
  }
  return billingAssistChat({ messages:assistMessagesWithWorkflowHint(assistMessagesWithLanguageHint(messages)), context })
}
