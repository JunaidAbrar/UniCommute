import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { generateToken, sendPasswordResetEmail } from "./email";
import { insertRideSchema, insertRequestSchema, insertMessageSchema } from "@shared/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function setupRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Password Reset Flow
  app.post("/api/forgot-password", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    try {
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal whether the email exists
        return res.status(200).json({
          message: "If an account exists with this email, you will receive a password reset link."
        });
      }

      // Generate token with 15 minutes expiry
      const token = await generateToken();
      const expires = new Date(Date.now() + 15 * 60 * 1000);

      await storage.setResetToken(user.id, token, expires);
      await sendPasswordResetEmail(user, token);

      res.status(200).json({
        message: "If an account exists with this email, you will receive a password reset link."
      });
    } catch (error) {
      console.error('Error in forgot password:', error);
      res.status(500).json({
        message: "Error processing password reset request"
      });
    }
  });

  app.post("/api/reset-password", async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({
        message: "Token and new password are required"
      });
    }

    try {
      const user = await storage.getUserByResetToken(token);
      if (!user) {
        return res.status(400).json({
          message: "Invalid or expired reset token"
        });
      }

      // Hash the new password
      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(password, salt, 64)) as Buffer;
      const hashedPassword = `${buf.toString("hex")}.${salt}`;

      await storage.updatePassword(user.id, hashedPassword);

      res.status(200).json({
        message: "Password has been reset successfully. Please log in with your new password."
      });
    } catch (error) {
      console.error('Error in reset password:', error);
      res.status(500).json({
        message: "Error resetting password"
      });
    }
  });

  const httpServer = createServer(app);

  // Set up periodic check for rides that need to be archived (every 5 minutes)
  setInterval(async () => {
    try {
      await storage.autoArchiveExpiredRides();
    } catch (error) {
      console.error("Error auto-archiving rides:", error);
    }
  }, 5 * 60 * 1000);

  // Rides
  app.post("/api/rides", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parseResult = insertRideSchema.safeParse(req.body);
    if (!parseResult.success) return res.status(400).json(parseResult.error);

    // Validate seats available
    if (parseResult.data.seatsAvailable < 1) {
      return res.status(400).json({
        message: "Number of available seats must be at least 1"
      });
    }

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

  // Modified delete route to handle archiving
  app.delete("/api/rides/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      await storage.deleteRide(parseInt(req.params.id), req.user.id);
      res.sendStatus(200);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to archive ride" });
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

  // Add new route to get archived rides for a user
  app.get("/api/rides/archived", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const archivedRides = await storage.getArchivedRides(req.user.id);
      res.json(archivedRides);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to fetch archived rides" });
    }
  });

  return httpServer;
}