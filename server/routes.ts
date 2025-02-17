import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertRideSchema, insertRequestSchema, insertMessageSchema } from "@shared/schema";
import { parse as parseCookie } from "cookie";
import { promisify } from "util";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    verifyClient: async ({ req }, done) => {
      try {
        // Parse session from cookie
        const cookies = parseCookie(req.headers.cookie || '');
        const sessionId = cookies['connect.sid'];

        if (!sessionId) {
          done(false, 401, 'Unauthorized');
          return;
        }

        // Get session data
        const session = await promisify(storage.sessionStore.get.bind(storage.sessionStore))(sessionId);

        if (!session?.passport?.user) {
          done(false, 401, 'Unauthorized');
          return;
        }

        // Attach user data to websocket request for later use
        (req as any).userId = session.passport.user;
        done(true);
      } catch (error) {
        console.error('WebSocket authentication error:', error);
        done(false, 500, 'Internal Server Error');
      }
    }
  });

  // Rides
  app.post("/api/rides", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parseResult = insertRideSchema.safeParse(req.body);
    if (!parseResult.success) return res.status(400).json(parseResult.error);

    try {
      const ride = await storage.createRide(req.user.id, parseResult.data);
      const rides = await storage.getActiveRides();
      res.status(201).json({ ride, rides });
    } catch (error) {
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to create ride" 
      });
    }
  });

  app.get("/api/rides", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const rides = await storage.getActiveRides();
    res.json(rides);
  });

  app.delete("/api/rides/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      await storage.deleteRide(parseInt(req.params.id), req.user.id);
      res.sendStatus(200);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to delete ride" });
    }
  });

  // Requests
  app.post("/api/requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parseResult = insertRequestSchema.safeParse(req.body);
    if (!parseResult.success) return res.status(400).json(parseResult.error);

    try {
      const request = await storage.createRequest(req.user.id, parseResult.data);
      const ride = await storage.addParticipant(request.rideId, req.user.id);
      res.status(201).json({ request, ride });
    } catch (error) {
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to join ride" 
      });
    }
  });

  app.get("/api/rides/:rideId/requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const requests = await storage.getRequestsByRide(parseInt(req.params.rideId));
    res.json(requests);
  });

  // Messages
  app.get("/api/rides/:rideId/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messages = await storage.getMessagesByRide(parseInt(req.params.rideId));
      res.json(messages);
    } catch (error) {
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch messages" 
      });
    }
  });

  wss.on('connection', async (ws, req) => {
    console.log('WebSocket connection established');
    const userId = (req as any).userId;

    if (!userId) {
      console.error('No user ID found in WebSocket connection');
      ws.close(1008, 'Unauthorized');
      return;
    }

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received WebSocket message:', message);

        // Verify the message is from the authenticated user
        if (message.userId !== userId) {
          console.error('Message user ID does not match connection user ID');
          return;
        }

        const parseResult = insertMessageSchema.safeParse(message);

        if (parseResult.success) {
          const savedMessage = await storage.createMessage(userId, parseResult.data);
          console.log('Saved message:', savedMessage);

          // Broadcast to all connected clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(savedMessage));
            }
          });
        } else {
          console.error('Invalid message format:', parseResult.error);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
  });

  return httpServer;
}