import { useEffect, useRef, useState } from "react";
import { Message } from "@shared/schema";
import { useAuth } from "./use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function useChat(rideId: number) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { user } = useAuth();

  // Fetch existing messages
  useQuery<Message[]>({
    queryKey: [`/api/rides/${rideId}/messages`],
    async queryFn() {
      const res = await apiRequest("GET", `/api/rides/${rideId}/messages`);
      return res.json();
    },
    onSuccess: (data) => {
      setMessages(data);
    },
  });

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
      content,
      type: 'text'
    }));
  };

  return {
    messages,
    sendMessage,
    connected
  };
}