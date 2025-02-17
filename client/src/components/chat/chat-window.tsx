import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function ChatWindow({ rideId }: { rideId: number }) {
  const [message, setMessage] = useState("");
  const { messages, sendMessage, connected } = useChat(rideId);
  const { user } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      sendMessage(message);
      setMessage("");
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2",
                msg.userId === user?.id && "flex-row-reverse"
              )}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  {msg.userId === user?.id ? "You" : "U"}
                </AvatarFallback>
              </Avatar>
              <Card
                className={cn(
                  "p-2",
                  msg.userId === user?.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <p className="text-sm">{msg.content}</p>
                <span className="text-xs opacity-70">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </Card>
            </div>
          ))}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={!connected}
          />
          <Button type="submit" disabled={!connected || !message.trim()}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
