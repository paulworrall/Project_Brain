"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  // Tracks the last `state` object we've already reacted to, by reference —
  // not by content — so a repeated identical answer/error still only gets
  // appended once, and an unrelated re-render elsewhere on the page (which
  // leaves this same state object in place) never re-appends anything.
  const lastHandledStateRef = useRef<ChatbotActionState | undefined>(undefined);

  useEffect(() => {
    if (!state || state === lastHandledStateRef.current) return;
    lastHandledStateRef.current = state;

    if (state.answer) {
      setMessages((prev) => [...prev, { role: "assistant", content: state.answer! }]);
    } else if (state.message) {
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠ ${state.message}` }]);
    }
  }, [state]);

  return (
    <Card className="flex h-full flex-col p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Project Brain</h2>
        <p className="text-xs text-muted-foreground">Ask anything about {projectName}</p>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-md bg-surface-muted p-3 text-sm">
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
