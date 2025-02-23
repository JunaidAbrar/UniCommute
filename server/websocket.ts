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
      log(`Incoming WebSocket connection with cookies: ${cookieHeader}`);

      const cookies = parseCookie(cookieHeader);
      const sessionID = cookies['connect.sid'];

      if (!sessionID) {
        log('Connection rejected: No session ID found');
        ws.close(1008, 'No session ID found');
        return;
      }

      // Clean session ID (remove 's:' prefix and signature)
      const cleanSessionID = decodeURIComponent(sessionID.replace(/^s:/, '').split('.')[0]);
      log(`Processing session ID: ${cleanSessionID}`);

      // Get session data
      const sessionData = await new Promise((resolve, reject) => {
        storage.sessionStore.get(cleanSessionID, (err, session) => {
          if (err) {
            log(`Session store error: ${err.message}`);
            reject(err);
            return;
          }
          log(`Retrieved session data: ${JSON.stringify(session)}`);
          resolve(session);
        });
      });

      if (!sessionData || !sessionData.passport?.user) {
        log('Invalid session data or missing user');
        ws.close(1008, 'Invalid session');
        return;
      }

      const userId = sessionData.passport.user;

      // Get user data
      const user = await storage.getUser(userId);
      if (!user) {
        log(`User not found for ID: ${userId}`);
        ws.close(1008, 'User not found');
        return;
      }

      log(`WebSocket client authenticated. UserID: ${userId}, Username: ${user.username}`);

      // Initialize client info
      ws.userId = userId;
      // Store username for later use
      ws.username = user.username;

      ws.on('message', async (message: string) => {
        try {
          const data = JSON.parse(message);
          log(`Message from user ${userId} (${user.username}): ${JSON.stringify(data)}`);

          switch (data.type) {
            case 'join':
              await handleJoin(ws, data);
              break;
            case 'message':
              await handleMessage(ws, data);
              break;
            case 'leave':
              handleLeave(ws);
              break;
            default:
              log(`Unknown message type: ${data.type}`);
          }
        } catch (error) {
          log(`Error processing message: ${error}`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Failed to process message' 
            }));
          }
        }
      });

      ws.on('close', () => {
        log(`Client disconnected. UserID: ${userId}, Username: ${user.username}`);
        handleLeave(ws);
      });

      ws.on('error', (error) => {
        log(`WebSocket error for user ${userId}: ${error}`);
        handleLeave(ws);
      });

    } catch (error) {
      log(`WebSocket connection error: ${error}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'Internal server error');
      }
    }
  });
}

async function handleJoin(ws: WebSocketClient, data: any) {
  try {
    const { rideId } = data;
    if (!rideId || !ws.userId) {
      throw new Error('Invalid join request');
    }

    const numericRideId = parseInt(rideId);
    if (isNaN(numericRideId)) {
      throw new Error('Invalid rideId format');
    }

    // Verify user is a participant in the ride
    const ride = await storage.getRide(numericRideId);
    if (!ride || !ride.participants.includes(ws.userId)) {
      throw new Error(`User ${ws.userId} not authorized for ride ${numericRideId}`);
    }

    ws.rideId = numericRideId;

    let room = rooms.get(numericRideId.toString());
    if (!room) {
      room = { rideId: numericRideId, clients: new Set() };
      rooms.set(numericRideId.toString(), room);
    }
    room.clients.add(ws);

    log(`User ${ws.userId} (${ws.username}) joined ride ${numericRideId}`);

    // Send confirmation
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'joined', rideId: numericRideId }));
    }
  } catch (error) {
    log(`Error in handleJoin: ${error}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Failed to join ride'
      }));
    }
  }
}

async function handleMessage(ws: WebSocketClient, data: any) {
  try {
    if (!ws.rideId || !ws.userId || !ws.username) {
      throw new Error('Invalid message: Missing required client data');
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      rideId: ws.rideId,
      userId: ws.userId,
      username: ws.username,
      content: data.content,
      timestamp: new Date()
    };

    log(`Broadcasting message from ${ws.username} in ride ${ws.rideId}`);

    // Store in database first
    await storage.createMessage(ws.userId, {
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
    log(`Error in handleMessage: ${error}`);
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
      log(`User ${ws.userId} (${ws.username}) left ride ${ws.rideId}`);
    }
  }
}