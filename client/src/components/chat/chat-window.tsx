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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const { messages, sendMessage, isLoading } = useChat(rideId);
  const { user } = useAuth();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  // Handle keyboard visibility for iOS Safari
  useEffect(() => {
    const handleResize = () => {
      const isKeyboard = window.innerHeight < window.outerHeight * 0.75;
      setIsKeyboardVisible(isKeyboard);

      // Scroll to bottom when keyboard appears
      if (isKeyboard) {
        setTimeout(() => {
          messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    }
  };

  return (
    <div className={cn(
      "flex flex-col relative",
      "h-[calc(100vh-4rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]",
      "md:h-[calc(100vh-4rem)]",
      "bg-background"
    )}>
      <ScrollArea 
        ref={scrollAreaRef}
        className={cn(
          "flex-1",
          "p-4",
          "pb-[calc(4rem+env(safe-area-inset-bottom,0px))]", // Account for input height
          isKeyboardVisible && "pb-24", // Extra padding when keyboard is visible
          "overflow-y-auto",
          "-webkit-overflow-scrolling: touch"
        )}
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
        className={cn(
          isKeyboardVisible ? "fixed left-0 right-0 bottom-0" : "sticky bottom-0",
          "p-4 border-t bg-background",
          "pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
          isKeyboardVisible && "pb-4",
          "z-50" // Ensure it stays above everything
        )}
      >
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            disabled={isLoading}
            className={cn(
              "flex-1",
              "h-12",
              "active:scale-[0.98] transition-transform",
              "touch-none"
            )}
          />
          <Button 
            type="submit" 
            disabled={isLoading || !message.trim()}
            className={cn(
              "h-12 px-6",
              "active:scale-[0.98] transition-transform",
              "touch-none"
            )}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}