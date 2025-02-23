import { ChatWindow } from "@/components/chat/chat-window";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

export default function ChatPage() {
  const [, params] = useRoute("/chat/:rideId");
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/auth');
    }
  }, [user, isLoading, navigate]);

  if (!params?.rideId || !user) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen pb-16">
      <header className="border-b p-4">
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2"
          onClick={() => navigate("/")}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Rides
        </Button>
      </header>

      <ChatWindow rideId={parseInt(params.rideId)} />
    </div>
  );
}