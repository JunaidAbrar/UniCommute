import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";

interface ChatWindowProps {
  rideId: number;
}

export function ChatWindow({ rideId }: ChatWindowProps) {
  const { messages, sendMessage, isConnected, error } = useChat(rideId);
  const [newMessage, setNewMessage] = useState('');
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  const handleSend = () => {
    if (newMessage.trim()) {
      sendMessage(newMessage.trim());
      setNewMessage('');
    }
  };

  return (
    <div className="flex flex-col h-screen pb-16">
      <Card className="flex-1 flex flex-col p-4 min-h-0">
        {error && (
          <div className="text-sm text-red-500 mb-2">
            {error}
          </div>
        )}
        <ScrollArea 
          ref={scrollRef}
          className="flex-1 pr-4"
          style={{ height: 'calc(100vh - 240px)' }}
        >
          <div className="flex flex-col gap-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1",
                  msg.userId === user?.id ? "items-end" : "items-start"
                )}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-foreground">
                    {msg.userId === user?.id ? "You" : msg.username || 'Unknown'}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <Card
                    className={cn(
                      "px-3 py-2 max-w-[80%]",
                      msg.userId === user?.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {msg.content}
                  </Card>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(msg.timestamp), "h:mm a")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex gap-2 mt-4">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            disabled={!isConnected}
            className="flex-1"
          />
          <Button 
            onClick={handleSend} 
            disabled={!isConnected}
          >
            Send
          </Button>
        </div>
      </Card>
    </div>
  );
}