import { WebSocketServer } from 'ws';
import { storage } from './storage';
import { ChatMessage, WebSocketClient, ChatRoom } from './types';
import * as crypto from 'crypto';
import { parse as parseCookie } from 'cookie';
import { IncomingMessage } from 'http';
import type { Express } from 'express';
import { WebSocket } from 'ws';
import { log } from './vite';

const rooms = new Map<string, ChatRoom>();

export function setupWebSocket(wss: WebSocketServer, app: Express) {
  wss.on('connection', async (ws: WebSocketClient, req: IncomingMessage) => {
    try {
      // Extract session ID from cookie
      const cookieHeader = req.headers.cookie || '';
      log('WebSocket connection attempt with cookie:', cookieHeader);

      const cookies = parseCookie(cookieHeader);
      const sessionID = cookies['connect.sid'];

      if (!sessionID) {
        log('WebSocket connection rejected: No session ID found');
        ws.close(1008, 'No session ID found');
        return;
      }

      // Clean session ID (remove 's:' prefix and signature)
      const cleanSessionID = decodeURIComponent(sessionID.replace(/^s:/, '').split('.')[0]);
      log('Clean session ID:', cleanSessionID);

      // Get session data
      const sessionData: any = await new Promise((resolve, reject) => {
        storage.sessionStore.get(cleanSessionID, (err, session) => {
          if (err) {
            log('Session store error:', err);
            reject(err);
          } else {
            log('Session data retrieved:', session);
            resolve(session);
          }
        });
      });

      if (!sessionData || !sessionData.passport?.user) {
        log('Invalid session data:', sessionData);
        ws.close(1008, 'Invalid session');
        return;
      }

      const userId = sessionData.passport.user;
      log(`WebSocket client authenticated. UserID: ${userId}`);

      // Initialize client info
      ws.userId = userId;

      ws.on('message', async (message: string) => {
        try {
          const data = JSON.parse(message);
          log('Received message from user', userId, ':', data);

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
              log('Unknown message type:', data.type);
          }
        } catch (error) {
          log('Error processing message:', error);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Failed to process message' 
            }));
          }
        }
      });

      ws.on('close', () => {
        log(`Client disconnected. UserID: ${userId}`);
        handleLeave(ws);
      });

      ws.on('error', (error) => {
        log('WebSocket error:', error);
        handleLeave(ws);
      });

    } catch (error) {
      log('WebSocket connection error:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'Internal server error');
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

    log(`User ${userId} joined ride ${numericRideId}`);

    // Send confirmation
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'joined', rideId: numericRideId }));
    }
  } catch (error) {
    log('Error in handleJoin:', error);
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

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      rideId: ws.rideId,
      userId: userId,
      username: user.username,
      content: data.content,
      timestamp: new Date()
    };

    log('Broadcasting message:', message);

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
    log('Error in handleMessage:', error);
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
      log(`User left ride ${ws.rideId}`);
    }
  }
}