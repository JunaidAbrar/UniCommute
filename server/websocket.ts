import { WebSocketServer } from 'ws';
import { storage } from './storage';
import { ChatMessage, WebSocketClient, ChatRoom } from './types';
import * as crypto from 'crypto';
import { parse as parseCookie } from 'cookie';
import { IncomingMessage } from 'http';
import type { Express } from 'express';
import { WebSocket } from 'ws';

const rooms = new Map<string, ChatRoom>();

export function setupWebSocket(wss: WebSocketServer, app: Express) {
  wss.on('connection', async (ws: WebSocketClient, req: IncomingMessage) => {
    try {
      // Extract session ID from cookie
      const cookieHeader = req.headers.cookie || '';
      console.log('Received cookie header:', cookieHeader);

      const cookies = parseCookie(cookieHeader);
      const sessionID = cookies['connect.sid'];

      if (!sessionID) {
        console.log('WebSocket connection rejected: No session ID found in cookies');
        ws.close();
        return;
      }

      // Clean session ID (remove 's:' prefix if exists)
      const cleanSessionID = sessionID.replace(/^s:/, '').split('.')[0];
      console.log('Attempting to get session with ID:', cleanSessionID);

      // Get session data
      const sessionData: any = await new Promise((resolve) => {
        storage.sessionStore.get(cleanSessionID, (err, session) => {
          if (err) {
            console.error('Error getting session:', err);
            resolve(null);
          } else {
            console.log('Retrieved session data:', session);
            resolve(session);
          }
        });
      });

      if (!sessionData || !sessionData.passport?.user) {
        console.log('WebSocket connection rejected: Invalid session data', sessionData);
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
          if (error instanceof Error) {
            console.error('Error details:', error.message);
          }
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected. UserID: ${userId}`);
        handleLeave(ws);
      });

    } catch (error) {
      console.error('Error in WebSocket connection:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      ws.close();
    }
  });
}

async function handleJoin(ws: WebSocketClient, data: any, userId: number) {
  const { rideId } = data;

  if (!rideId) {
    console.log('Join rejected: No rideId provided');
    ws.close();
    return;
  }

  const numericRideId = parseInt(rideId);
  if (isNaN(numericRideId)) {
    console.log('Join rejected: Invalid rideId format');
    ws.close();
    return;
  }

  ws.userId = userId;
  ws.rideId = numericRideId;

  // Verify user is a participant in the ride
  const ride = await storage.getRide(numericRideId);
  if (!ride || !ride.participants.includes(userId)) {
    console.log(`Join rejected: User ${userId} not in ride ${numericRideId}`);
    ws.close();
    return;
  }

  let room = rooms.get(numericRideId.toString());
  if (!room) {
    room = { rideId: numericRideId, clients: new Set() };
    rooms.set(numericRideId.toString(), room);
  }
  room.clients.add(ws);
  console.log(`User ${userId} joined ride ${numericRideId}`);
}

async function handleMessage(ws: WebSocketClient, data: any, userId: number) {
  if (!ws.rideId) {
    console.log('Message rejected: No rideId associated with connection');
    return;
  }

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

  console.log('Creating message:', message);

  try {
    // Store message in database
    await storage.createMessage(userId, {
      rideId: ws.rideId,
      content: data.content,
      type: 'text'
    });

    // Broadcast to all clients in the room
    const room = rooms.get(ws.rideId.toString());
    if (room) {
      room.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'message',
            message: {
              ...message,
              timestamp: message.timestamp.toISOString()
            }
          }));
        }
      });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
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