import { createContext, useContext } from 'react'
import type { AgentEvent } from '../../services/api'

export type AssistantMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  events: AgentEvent[]
  createdAt: string
}

export type AssistantConversation = {
  id: string
  title: string
  selectedSpecId: string
  messages: AssistantMessage[]
  createdAt: string
  updatedAt: string
}

export type AssistantChatContextValue = {
  conversations: AssistantConversation[]
  activeId: string
  activeConversation: AssistantConversation
  setActiveId: (id: string) => void
  updateConversation: (conversationId: string, updater: (conversation: AssistantConversation) => AssistantConversation) => void
  startNewConversation: () => void
  deleteConversation: (conversationId: string) => void
}

export const ASSISTANT_CHAT_STORAGE_KEY = 'api-flow-assistant-conversations'

export const AssistantChatContext = createContext<AssistantChatContextValue | undefined>(undefined)

export function createAssistantId() {
  const browserCrypto = globalThis.crypto
  if (browserCrypto?.randomUUID) return browserCrypto.randomUUID()
  if (browserCrypto?.getRandomValues) {
    const bytes = browserCrypto.getRandomValues(new Uint32Array(4))
    return `${Date.now()}-${Array.from(bytes, value => value.toString(16).padStart(8, '0')).join('')}`
  }
  return `${Date.now()}`
}

export function assistantNowIso() {
  return new Date().toISOString()
}

export function createAssistantConversation(): AssistantConversation {
  const timestamp = assistantNowIso()
  return {
    id: createAssistantId(),
    title: 'New chat',
    selectedSpecId: '',
    messages: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function loadAssistantConversations(): AssistantConversation[] {
  try {
    const stored = window.localStorage.getItem(ASSISTANT_CHAT_STORAGE_KEY)
    if (!stored) return [createAssistantConversation()]
    const parsed = JSON.parse(stored) as AssistantConversation[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [createAssistantConversation()]
  } catch {
    return [createAssistantConversation()]
  }
}

export function formatAssistantChatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function useAssistantChat() {
  const context = useContext(AssistantChatContext)
  if (!context) throw new Error('useAssistantChat must be used inside AssistantChatProvider')
  return context
}
