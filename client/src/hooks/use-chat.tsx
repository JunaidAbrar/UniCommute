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
  const { data: existingMessages } = useQuery<Message[]>({
    queryKey: [`/api/rides/${rideId}/messages`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/rides/${rideId}/messages`);
      return await res.json();
    }
  });

  // Update messages when existingMessages changes
  useEffect(() => {
    if (existingMessages) {
      setMessages(existingMessages);
    }
  }, [existingMessages]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log('Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      console.log('Received message:', event.data);
      const message: Message = JSON.parse(event.data);
      if (message.rideId === rideId) {
        setMessages(prev => [...prev, message]);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [rideId]);

  const sendMessage = (content: string) => {
    if (!user || !wsRef.current || !connected) return;

    const message = {
      userId: user.id,
      rideId,
      content,
      type: 'text'
    };

    console.log('Sending message:', message);
    wsRef.current.send(JSON.stringify(message));
  };

  return {
    messages,
    sendMessage,
    connected
  };
}