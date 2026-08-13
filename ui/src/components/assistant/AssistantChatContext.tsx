import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  AssistantChatContext,
  ASSISTANT_CHAT_STORAGE_KEY,
  createAssistantConversation,
  loadAssistantConversations,
  type AssistantConversation,
} from './assistantChatState'

export function AssistantChatProvider({ children }: { children: ReactNode }) {
  const [initialConversations] = useState(loadAssistantConversations)
  const [conversations, setConversations] = useState(initialConversations)
  const [activeId, setActiveId] = useState(initialConversations[0]?.id ?? '')

  const activeConversation = useMemo(
    () => conversations.find(conversation => conversation.id === activeId) ?? conversations[0] ?? createAssistantConversation(),
    [activeId, conversations],
  )

  useEffect(() => {
    window.localStorage.setItem(ASSISTANT_CHAT_STORAGE_KEY, JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    if (conversations.some(conversation => conversation.id === activeId)) return
    setActiveId(conversations[0]?.id ?? '')
  }, [activeId, conversations])

  const updateConversation = (conversationId: string, updater: (conversation: AssistantConversation) => AssistantConversation) => {
    setConversations(current => current.map(conversation => (conversation.id === conversationId ? updater(conversation) : conversation)))
  }

  const startNewConversation = () => {
    const next = createAssistantConversation()
    setConversations(current => [next, ...current])
    setActiveId(next.id)
  }

  const deleteConversation = (conversationId: string) => {
    setConversations(current => {
      const remaining = current.filter(conversation => conversation.id !== conversationId)
      return remaining.length > 0 ? remaining : [createAssistantConversation()]
    })
  }

  return (
    <AssistantChatContext.Provider
      value={{
        conversations,
        activeId,
        activeConversation,
        setActiveId,
        updateConversation,
        startNewConversation,
        deleteConversation,
      }}
    >
      {children}
    </AssistantChatContext.Provider>
  )
}
