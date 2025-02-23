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
      const cookies = parseCookie(cookieHeader);
      const sessionID = cookies['connect.sid'];

      if (!sessionID) {
        console.log('WebSocket connection rejected: No session ID found');
        ws.close(1008, 'No session ID found');
        return;
      }

      // Parse session ID more carefully
      const cleanSessionID = decodeURIComponent(sessionID)
        .replace(/^s:/, '')
        .split('.')
        .shift();

      if (!cleanSessionID) {
        console.log('WebSocket connection rejected: Invalid session ID format');
        ws.close(1008, 'Invalid session ID format');
        return;
      }

      // Get session data with better error handling
      const sessionData: any = await new Promise((resolve, reject) => {
        storage.sessionStore.get(cleanSessionID, (err, session) => {
          if (err) {
            console.error('Session store error:', err);
            reject(new Error('Failed to retrieve session'));
          } else if (!session) {
            reject(new Error('Session not found'));
          } else {
            resolve(session);
          }
        });
      });

      if (!sessionData?.passport?.user) {
        console.log('WebSocket connection rejected: No authenticated user');
        ws.close(1008, 'Authentication required');
        return;
      }

      const userId = sessionData.passport.user;
      console.log(`WebSocket client authenticated. UserID: ${userId}`);

      // Initialize client info
      ws.userId = userId;

      // Send immediate connection confirmation
      ws.send(JSON.stringify({ 
        type: 'connected',
        userId,
        message: 'Successfully connected to chat'
      }));

      ws.on('message', async (message: string) => {
        try {
          const data = JSON.parse(message);
          console.log('Received message from user', userId, ':', data);

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
            default:
              console.log('Unknown message type:', data.type);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Unknown message type'
              }));
          }
        } catch (error) {
          console.error('Error processing message:', error);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: error instanceof Error ? error.message : 'Failed to process message' 
            }));
          }
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected. UserID: ${userId}`);
        handleLeave(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        handleLeave(ws);
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, error instanceof Error ? error.message : 'Internal server error');
      }
    }
  });
}

async function handleJoin(ws: WebSocketClient, data: any, userId: number) {
  try {
    const { rideId } = data;
    if (!rideId) {
      throw new Error('No rideId provided');
    }

    const numericRideId = parseInt(rideId);
    if (isNaN(numericRideId)) {
      throw new Error('Invalid rideId format');
    }

    // Verify user is a participant in the ride
    const ride = await storage.getRide(numericRideId);
    if (!ride || !ride.participants.includes(userId)) {
      throw new Error(`User ${userId} not authorized for ride ${numericRideId}`);
    }

    ws.rideId = numericRideId;

    let room = rooms.get(numericRideId.toString());
    if (!room) {
      room = { rideId: numericRideId, clients: new Set() };
      rooms.set(numericRideId.toString(), room);
    }
    room.clients.add(ws);

    console.log(`User ${userId} joined ride ${numericRideId}`);

    // Send confirmation
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'joined', rideId: numericRideId }));
    }
  } catch (error) {
    console.error('Error in handleJoin:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to join ride'
      }));
    }
  }
}

async function handleMessage(ws: WebSocketClient, data: any, userId: number) {
  try {
    if (!ws.rideId) {
      throw new Error('No active ride');
    }

    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Ensure we're using the correct username field from the user object
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      rideId: ws.rideId,
      userId: userId,
      username: user.username || 'Anonymous', // Fallback to Anonymous if username is not available
      content: data.content,
      timestamp: new Date()
    };

    console.log('Broadcasting message with user details:', {
      userId: message.userId,
      username: message.username,
      content: message.content
    });

    // Store in database first
    await storage.createMessage(userId, {
      rideId: ws.rideId,
      content: data.content,
      type: 'text'
    });

    // Then broadcast to room
    const room = rooms.get(ws.rideId.toString());
    if (room) {
      const messageToSend = JSON.stringify({
        type: 'message',
        message: {
          ...message,
          timestamp: message.timestamp.toISOString()
        }
      });

      room.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(messageToSend);
        }
      });
    }
  } catch (error) {
    console.error('Error in handleMessage:', error);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to send message'
      }));
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