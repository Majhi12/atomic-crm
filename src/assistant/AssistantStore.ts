import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AssistantMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type AssistantState = {
  messages: AssistantMessage[];
  addMessage: (m: AssistantMessage) => void;
  setMessages: (ms: AssistantMessage[]) => void;
  clear: () => void;
};

export const useAssistantStore = create<AssistantState>()(
  persist(
    (
      set: (
        arg: Partial<AssistantState> | ((s: AssistantState) => Partial<AssistantState>)
      ) => void
    ) => ({
      messages: [],
      addMessage: (m: AssistantMessage) => set((s: AssistantState) => ({ messages: [...s.messages, m] })),
      setMessages: (ms: AssistantMessage[]) => set({ messages: ms }),
      clear: () => set({ messages: [] }),
    }),
    {
      name: 'assistant.chat',
      partialize: (s: AssistantState) => ({ messages: s.messages }),
      version: 1,
    }
  )
);
