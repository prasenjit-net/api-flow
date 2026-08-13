import { ChevronDown, ChevronRight, MessagesSquare, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatAssistantChatTime, useAssistantChat } from './assistantChatState'

type AssistantChatListProps = {
  onSelect?: () => void
}

export function AssistantChatList({ onSelect }: AssistantChatListProps) {
  const { conversations, activeConversation, setActiveId, startNewConversation, deleteConversation } = useAssistantChat()
  const [collapsed, setCollapsed] = useState(false)

  const selectConversation = (conversationId: string) => {
    setActiveId(conversationId)
    onSelect?.()
  }

  const createConversation = () => {
    startNewConversation()
    onSelect?.()
  }

  return (
    <section className="border-t border-gray-200 px-4 py-4 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed(value => !value)}
          className="flex min-w-0 items-center gap-2 rounded-md text-sm font-semibold text-gray-800 hover:text-primary-700 dark:text-slate-100 dark:hover:text-primary-200"
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          <MessagesSquare className="h-4 w-4 shrink-0" />
          <span className="truncate">Chats</span>
        </button>
        <button
          type="button"
          onClick={createConversation}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="New chat"
          title="New chat"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
          {conversations.map(conversation => (
            <div
              key={conversation.id}
              className={`group flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left ${
                conversation.id === activeConversation.id
                  ? 'bg-primary-50 text-primary-900 dark:bg-primary-900/30 dark:text-primary-100'
                  : 'text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <button type="button" onClick={() => selectConversation(conversation.id)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium">{conversation.title}</div>
                <div className="mt-0.5 truncate text-xs opacity-70">{formatAssistantChatTime(conversation.updatedAt)}</div>
              </button>
              <button
                type="button"
                onClick={() => deleteConversation(conversation.id)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 opacity-0 hover:bg-white hover:text-rose-600 group-hover:opacity-100 focus:opacity-100 dark:text-slate-500 dark:hover:bg-slate-950 dark:hover:text-rose-300"
                aria-label="Delete chat"
                title="Delete chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
