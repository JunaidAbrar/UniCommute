import { useEffect, useRef, useState } from "react";
import { Message } from "@shared/schema";
import { useAuth } from "./use-auth";

export function useChat(rideId: number) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const message: Message = JSON.parse(event.data);
      if (message.rideId === rideId) {
        setMessages(prev => [...prev, message]);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [rideId]);

  const sendMessage = (content: string) => {
    if (!user || !wsRef.current || !connected) return;

    wsRef.current.send(JSON.stringify({
      userId: user.id,
      rideId,
      content
    }));
  };

  return {
    messages,
    sendMessage,
    connected
  };
}
