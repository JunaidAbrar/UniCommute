import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './use-auth';

interface Message {
  id: string;
  rideId: number;
  userId: number;
  username: string;
  content: string;
  timestamp: Date;
}

export function useChat(rideId: number) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (!user) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);

        // Join the chat room
        ws.send(JSON.stringify({
          type: 'join',
          rideId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'message') {
            setMessages(prev => {
              // Avoid duplicate messages
              if (prev.some(m => m.id === data.message.id)) {
                return prev;
              }
              return [...prev, data.message];
            });
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        // Attempt to reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Failed to connect to chat server');
      };

    } catch (err) {
      console.error('Error creating WebSocket:', err);
      setError('Failed to create WebSocket connection');
    }
  }, [user, rideId]);

  // Initialize WebSocket connection
  useEffect(() => {
    connect();

    return () => {
      // Cleanup on unmount
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'leave' }));
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // Load existing messages
  useEffect(() => {
    if (!user) return;

    fetch(`/api/rides/${rideId}/messages`)
      .then(res => res.json())
      .then(data => setMessages(data))
      .catch(err => {
        console.error('Error loading messages:', err);
        setError('Failed to load messages');
      });
  }, [rideId, user]);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || !user || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to chat server');
      return;
    }

    if (!content.trim()) return;

    wsRef.current.send(JSON.stringify({
      type: 'message',
      content: content.trim()
    }));
  }, [user]);

  return {
    messages,
    sendMessage,
    isConnected,
    error
  };
}