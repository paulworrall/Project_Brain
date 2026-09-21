"use client";

import { useActionState, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  askChatbotAction,
  type ChatbotActionState,
} from "@/app/(dashboard)/projects/[projectId]/actions";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function ChatPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const action = askChatbotAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<ChatbotActionState | undefined, FormData>(
    action,
    undefined
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  // Adjusts state during render (React's recommended alternative to an
  // effect here — see "Adjusting state when a prop changes") rather than in
  // a useEffect: comparing `state` to the last-seen object by reference, not
  // content, so a repeated identical answer/error still only gets appended
  // once, and an unrelated re-render elsewhere on the page (which leaves this
  // same state object in place) never re-appends anything.
  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state?.answer) {
      setMessages((prev) => [...prev, { role: "assistant", content: state.answer! }]);
    } else if (state?.message) {
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠ ${state.message}` }]);
    }
  }

  return (
    <Card variant="feature" className="flex h-full flex-col p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path
              d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4 4v-4H6.5A2.5 2.5 0 0 1 4 12.5v-7Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="9" cy="9.25" r="0.9" fill="currentColor" />
            <circle cx="12" cy="9.25" r="0.9" fill="currentColor" />
            <circle cx="15" cy="9.25" r="0.9" fill="currentColor" />
          </svg>
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">Ask me anything</h2>
          <p className="text-xs text-muted-foreground">For {projectName}</p>
        </div>
      </div>

      <div
        aria-live="polite"
        className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-md bg-surface-muted p-3 text-sm"
      >
        {messages.length === 0 ? (
          <p className="text-muted-foreground">
            Answers are grounded strictly in this project&apos;s own documents and knowledge
            items.
          </p>
        ) : (
          messages.map((message, i) => (
            <p
              key={i}
              className={
                message.role === "user"
                  ? "font-medium text-foreground"
                  : "whitespace-pre-wrap text-foreground"
              }
            >
              {message.role === "user" ? "You: " : ""}
              {message.content}
            </p>
          ))
        )}
        {pending && <p className="text-muted-foreground">Thinking…</p>}
      </div>

      <form
        ref={formRef}
        action={(formData) => {
          const question = formData.get("question");
          if (typeof question === "string" && question.trim()) {
            setMessages((prev) => [...prev, { role: "user", content: question.trim() }]);
          }
          formAction(formData);
          formRef.current?.reset();
        }}
        className="mt-4"
      >
        <input
          name="question"
          type="text"
          aria-label="Question"
          disabled={pending}
          placeholder="Ask about scope, risks, estimates, documents…"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        />
        <Button type="submit" disabled={pending} className="mt-2 w-full">
          {pending ? "Asking…" : "Ask"}
        </Button>
      </form>
    </Card>
  );
}
