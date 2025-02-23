import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";
import { useChat } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ChatWindowProps {
  rideId: string;
}

export function ChatWindow({ rideId }: ChatWindowProps) {
  const { messages, sendMessage, isConnected } = useChat(rideId);
  const [newMessage, setNewMessage] = useState('');
  const { user } = useAuth();

  const handleSend = () => {
    if (newMessage.trim()) {
      sendMessage(newMessage.trim());
      setNewMessage('');
    }
  };

  return (
    <Card className="flex flex-col h-[400px] p-4">
      <ScrollArea className="flex-1 pr-4">
        <div className="flex flex-col gap-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col gap-1 ${
                msg.userId === user?.id ? 'items-end' : 'items-start'
              }`}
            >
              <span className="text-xs font-medium text-muted-foreground">
                {msg.userId === user?.id ? 'You' : msg.username}
              </span>
              <Card className={`px-3 py-2 max-w-[80%] ${
                msg.userId === user?.id ? 'bg-primary text-primary-foreground' : ''
              }`}>
                {msg.content}
              </Card>
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
        />
        <Button onClick={handleSend} disabled={!isConnected}>
          Send
        </Button>
      </div>
    </Card>
  );
}