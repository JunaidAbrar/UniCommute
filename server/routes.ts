import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertRideSchema, insertRequestSchema, insertMessageSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Rides
  app.post("/api/rides", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parseResult = insertRideSchema.safeParse(req.body);
    if (!parseResult.success) return res.status(400).json(parseResult.error);

    const ride = await storage.createRide(req.user.id, parseResult.data);
    res.status(201).json(ride);
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

    const request = await storage.createRequest(req.user.id, parseResult.data);
    const ride = await storage.addParticipant(request.rideId, req.user.id);
    res.status(201).json({ request, ride });
  });

  app.get("/api/rides/:rideId/requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const requests = await storage.getRequestsByRide(parseInt(req.params.rideId));
    res.json(requests);
  });

  // Messages
  wss.on('connection', (ws) => {
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        const parseResult = insertMessageSchema.safeParse(message);

        if (parseResult.success) {
          const savedMessage = await storage.createMessage(message.userId, parseResult.data);

          // Broadcast to all connected clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(savedMessage));
            }
          });
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
  });

  return httpServer;
}