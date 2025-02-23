import { WebSocketServer } from 'ws';
import { storage } from './storage';
import { ChatMessage, WebSocketClient, ChatRoom } from './types';
import * as crypto from 'crypto';
import { parse as parseCookie } from 'cookie';
import { IncomingMessage } from 'http';
import type { Express } from 'express';

const rooms = new Map<string, ChatRoom>();

export function setupWebSocket(wss: WebSocketServer, app: Express) {
  wss.on('connection', async (ws: WebSocketClient, req: IncomingMessage) => {
    try {
      // Extract session ID from cookie
      const cookies = parseCookie(req.headers.cookie || '');
      const sessionID = cookies['connect.sid'];

      if (!sessionID) {
        console.log('WebSocket connection rejected: No session ID');
        ws.close();
        return;
      }

      // Get session data
      const sessionData = await new Promise((resolve) => {
        storage.sessionStore.get(sessionID, (err, session) => {
          resolve(session);
        });
      });

      if (!sessionData || !sessionData.passport?.user) {
        console.log('WebSocket connection rejected: Invalid session');
        ws.close();
        return;
      }

      const userId = sessionData.passport.user;
      console.log(`WebSocket client connected. UserID: ${userId}`);

      ws.on('message', async (message: string) => {
        try {
          const data = JSON.parse(message);
          console.log('Received message:', data);

          switch (data.type) {
            case 'join':
              await handleJoin(ws, data, userId);
              break;
            case 'message':
              await handleMessage(ws, data, userId);
              break;
            case 'leave':
              handleLeave(ws);
              break;
          }
        } catch (error) {
          console.error('Error handling message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected. UserID: ${userId}`);
        handleLeave(ws);
      });

    } catch (error) {
      console.error('Error in WebSocket connection:', error);
      ws.close();
    }
  });
}

async function handleJoin(ws: WebSocketClient, data: any, userId: number) {
  const { rideId } = data;
  ws.userId = userId;
  ws.rideId = rideId;

  // Verify user is a participant in the ride
  const ride = await storage.getRide(rideId);
  if (!ride || !ride.participants.includes(userId)) {
    console.log(`Join rejected: User ${userId} not in ride ${rideId}`);
    ws.close();
    return;
  }

  let room = rooms.get(rideId.toString());
  if (!room) {
    room = { rideId: rideId, clients: new Set() };
    rooms.set(rideId.toString(), room);
  }
  room.clients.add(ws);
  console.log(`User ${userId} joined ride ${rideId}`);
}

async function handleMessage(ws: WebSocketClient, data: any, userId: number) {
  if (!ws.rideId) return;

  const user = await storage.getUser(userId);
  if (!user) {
    console.error(`Message rejected: User ${userId} not found`);
    return;
  }

  const message: ChatMessage = {
    id: crypto.randomUUID(),
    rideId: ws.rideId,
    userId: userId,
    username: user.username,
    content: data.content,
    timestamp: new Date()
  };

  // Store message in database
  await storage.createMessage(userId, {
    rideId: ws.rideId,
    content: data.content,
    type: 'text',
    timestamp: message.timestamp.toISOString()
  });

  // Broadcast to all clients in the room
  const room = rooms.get(ws.rideId.toString());
  if (room) {
    const messageStr = JSON.stringify({ type: 'message', message });
    room.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }
}

function handleLeave(ws: WebSocketClient) {
  if (ws.rideId) {
    const room = rooms.get(ws.rideId.toString());
    if (room) {
      room.clients.delete(ws);
      if (room.clients.size === 0) {
        rooms.delete(ws.rideId.toString());
      }
      console.log(`User left ride ${ws.rideId}`);
    }
  }
}

//  This is a placeholder.  A real implementation would be needed.
export interface WebSocketClient extends WebSocket {
  userId?: number;
  rideId?: number;
}

export interface ChatMessage {
    id: string;
    rideId: number;
    userId: number;
    username: string;
    content: string;
    timestamp: Date;
}

export interface ChatRoom {
    rideId: number;
    clients: Set<WebSocketClient>;
}