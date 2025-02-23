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
    if (!user) {
      console.log('No user, skipping connection');
      return;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('Connecting to WebSocket:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected, joining room:', rideId);
        setIsConnected(true);
        setError(null);

        // Join the chat room
        ws.send(JSON.stringify({
          type: 'join',
          rideId: rideId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received WebSocket message:', data);

          if (data.type === 'message' && data.message) {
            setMessages(prev => {
              // Avoid duplicate messages
              if (prev.some(m => m.id === data.message.id)) {
                return prev;
              }
              return [...prev, {
                ...data.message,
                timestamp: new Date(data.message.timestamp)
              }];
            });
          } else if (data.type === 'error') {
            setError(data.message);
            // If it's an authentication error, try to reconnect
            if (data.message.includes('auth')) {
              if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
              }
              reconnectTimeoutRef.current = setTimeout(connect, 5000);
            }
          }
        } catch (err) {
          console.error('Error parsing message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected, scheduling reconnect');
        setIsConnected(false);
        // Attempt to reconnect after 5 seconds
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
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
      console.log('Cleaning up WebSocket connection');
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
    if (!user) {
      console.log('No user, skipping message load');
      return;
    }

    console.log('Loading existing messages for ride:', rideId);
    fetch(`/api/rides/${rideId}/messages`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Failed to load messages: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        console.log('Loaded messages:', data);
        setMessages(data.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        })));
      })
      .catch(err => {
        console.error('Error loading messages:', err);
        setError('Failed to load messages');
      });
  }, [rideId, user]);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || !user || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('Cannot send message: not connected');
      setError('Not connected to chat server');
      return;
    }

    if (!content.trim()) return;

    console.log('Sending message:', content);
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