import { useState, useEffect, useCallback, useRef } from "react";
import { Message } from "@shared/schema";
import { useAuth } from "./use-auth";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage extends Message {
  username: string;
}

export function useChat(rideId: number) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/chat/${rideId}`;

    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnecting(false);
      console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        setMessages(prev => [...prev, data.message]);
      } else if (data.type === 'history') {
        setMessages(data.messages);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
      toast({
        title: "Connection Error",
        description: "Failed to connect to chat. Please try again.",
        variant: "destructive",
      });
    };

    socket.onclose = () => {
      setIsConnecting(true);
      toast({
        title: "Disconnected",
        description: "Chat connection lost. Attempting to reconnect...",
        variant: "destructive",
      });

      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (socketRef.current?.readyState === WebSocket.CLOSED) {
          socketRef.current = null;
        }
      }, 3000);
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [rideId, toast]);

  const sendMessage = useCallback((content: string) => {
    if (!user || content.trim() === '') return;

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'message',
        content,
        rideId,
        userId: user.id,
        username: user.username
      }));
    } else {
      toast({
        title: "Connection Error",
        description: "Not connected to chat. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, rideId, toast]);

  return {
    messages,
    sendMessage,
    isLoading: isConnecting
  };
}