import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

export function ChatWindow({ rideId }: { rideId: number }) {
  const [message, setMessage] = useState("");
  const { messages, sendMessage, isLoading } = useChat(rideId);
  const { user } = useAuth();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input field on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      sendMessage(message);
      setMessage("");
      // Refocus input after sending
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      <ScrollArea 
        ref={scrollAreaRef}
        className="flex-1 p-4 overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
      >
        <div className="space-y-4 min-h-full">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2",
                msg.userId === user?.id && "flex-row-reverse"
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback>
                  {msg.username ? msg.username.charAt(0).toUpperCase() : (msg.userId === user?.id ? "You" : "U")}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-1 max-w-[75%]">
                <span className={cn(
                  "text-xs font-medium",
                  msg.userId === user?.id ? "text-right" : "text-left"
                )}>
                  {msg.userId === user?.id ? "You" : msg.username}
                </span>
                <Card
                  className={cn(
                    "p-3",
                    msg.userId === user?.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <p className="text-sm break-words">{msg.content}</p>
                  <span className="text-xs opacity-70 mt-1 block">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </Card>
              </div>
            </div>
          ))}
          <div ref={messageEndRef} />
        </div>
      </ScrollArea>

      <form 
        onSubmit={handleSubmit}
        className="sticky bottom-0 w-full bg-background border-t"
        style={{ 
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          paddingTop: '1rem',
          paddingLeft: '1rem',
          paddingRight: '1rem'
        }}
      >
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Input
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isLoading}
            className="flex-1 h-12"
            autoComplete="off"
          />
          <Button 
            type="submit" 
            disabled={isLoading || !message.trim()}
            className="h-12 px-6"
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}