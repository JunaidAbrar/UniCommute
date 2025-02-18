import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertRideSchema, insertRequestSchema, insertMessageSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const httpServer = createServer(app);

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

  app.post("/api/rides/:id/leave", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const ride = await storage.getRide(parseInt(req.params.id));
      if (!ride) throw new Error("Ride not found");

      // Only allow leaving if user is a participant but not the host
      if (!ride.participants.includes(req.user.id)) {
        throw new Error("You are not a participant in this ride");
      }
      if (ride.hostId === req.user.id) {
        throw new Error("As the host, you cannot leave the ride. You can delete it instead.");
      }

      const updatedRide = await storage.removeParticipant(ride.id, req.user.id);
      res.json(updatedRide);
    } catch (error) {
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to leave ride" 
      });
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

  app.post("/api/rides/:rideId/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parseResult = insertMessageSchema.safeParse({
      ...req.body,
      rideId: parseInt(req.params.rideId)
    });

    if (!parseResult.success) {
      return res.status(400).json(parseResult.error);
    }

    try {
      const message = await storage.createMessage(req.user.id, parseResult.data);
      res.status(201).json(message);
    } catch (error) {
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to send message" 
      });
    }
  });

  // Add new route for kicking members
  app.post("/api/rides/:rideId/kick/:userId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const rideId = parseInt(req.params.rideId);
    const userIdToKick = parseInt(req.params.userId);

    try {
      const ride = await storage.getRide(rideId);
      if (!ride) throw new Error("Ride not found");

      // Only ride host can kick members
      if (ride.hostId !== req.user.id) {
        throw new Error("Only the ride host can remove members");
      }

      // Cannot kick the host
      if (userIdToKick === ride.hostId) {
        throw new Error("Cannot remove the ride host");
      }

      // Check if user is actually in the ride
      if (!ride.participants.includes(userIdToKick)) {
        throw new Error("User is not a participant in this ride");
      }

      const updatedRide = await storage.removeParticipant(rideId, userIdToKick);
      res.json(updatedRide);
    } catch (error) {
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to remove member" 
      });
    }
  });

  return httpServer;
}