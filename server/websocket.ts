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
      console.log('WebSocket connection attempt with cookie:', cookieHeader);

      const cookies = parseCookie(cookieHeader);
      const sessionID = cookies['connect.sid'];

      if (!sessionID) {
        console.log('WebSocket connection rejected: No session ID found');
        ws.close(1008, 'No session ID found');
        return;
      }

      // Clean session ID (remove 's:' prefix and signature)
      const cleanSessionID = decodeURIComponent(sessionID.replace(/^s:/, '').split('.')[0]);
      console.log('Clean session ID:', cleanSessionID);

      // Get session data with proper error handling
      let sessionData: any;
      try {
        sessionData = await new Promise((resolve, reject) => {
          storage.sessionStore.get(cleanSessionID, (err, session) => {
            if (err) {
              console.error('Session store error:', err);
              reject(err);
            } else {
              console.log('Session data retrieved:', session);
              resolve(session);
            }
          });
        });
      } catch (error) {
        console.error('Failed to retrieve session:', error);
        ws.close(1008, 'Session retrieval failed');
        return;
      }

      if (!sessionData || !sessionData.passport?.user) {
        console.log('Invalid session data:', sessionData);
        ws.close(1008, 'Invalid session');
        return;
      }

      const userId = sessionData.passport.user;
      console.log(`WebSocket client authenticated. UserID: ${userId}`);

      // Initialize client info
      ws.userId = userId;
      ws.isAlive = true;

      // Setup ping-pong for connection health check
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Send initial connection success message
      ws.send(JSON.stringify({ type: 'connected', userId }));

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
          }
        } catch (error) {
          console.error('Error processing message:', error);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Failed to process message' 
            }));
          }
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected. UserID: ${userId}`);
        ws.isAlive = false;
        handleLeave(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        ws.isAlive = false;
        handleLeave(ws);
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'Internal server error');
      }
    }
  });

  // Enhanced heartbeat to keep connections alive and clean up dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws: WebSocketClient) => {
      if (ws.isAlive === false) {
        console.log(`Terminating inactive connection for user ${ws.userId}`);
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeat);
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

    // Send confirmation and any existing messages
    if (ws.readyState === WebSocket.OPEN) {
      // Get existing messages for this ride
      const messages = await storage.getMessagesByRide(numericRideId);

      ws.send(JSON.stringify({ 
        type: 'joined', 
        rideId: numericRideId,
        messages: messages 
      }));
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

    // Create message object
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      rideId: ws.rideId,
      userId: userId,
      username: user.username,
      content: data.content,
      timestamp: new Date()
    };

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
      console.log(`User ${ws.userId} left ride ${ws.rideId}`);
    }
  }
}