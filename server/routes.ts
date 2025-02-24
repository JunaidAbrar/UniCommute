import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { generateToken, sendPasswordResetEmail } from "./email";
import { insertRideSchema, insertRequestSchema, insertMessageSchema } from "@shared/schema";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { log } from "./vite";

const scryptAsync = promisify(scrypt);

// Simple in-memory cache for ride data
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 30 * 1000; // 30 seconds cache

function getCachedData(key: string) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    log(`Cache hit for ${key}`);
    return cached.data;
  }
  log(`Cache miss for ${key}`);
  return null;
}

function setCachedData(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
  log(`Cache set for ${key} at ${new Date().toISOString()}`);
}

function clearRideCache() {
  const keysToDelete = [];
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith('ride:')) {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(key => {
    cache.delete(key);
    log(`Cache cleared for ${key} at ${new Date().toISOString()}`);
  });
}

// Utility function to measure execution time
async function measureExecutionTime<T>(operation: () => Promise<T>, operationName: string): Promise<[T, number]> {
  const start = Date.now();
  try {
    const result = await operation();
    const duration = Date.now() - start;
    log(`${operationName} completed in ${duration}ms`);
    return [result, duration];
  } catch (error) {
    const duration = Date.now() - start;
    log(`${operationName} failed after ${duration}ms: ${error}`);
    throw error;
  }
}

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
      await measureExecutionTime(
        () => storage.autoArchiveExpiredRides(),
        "Auto-archive expired rides"
      );
    } catch (error) {
      log("Error auto-archiving rides:", error);
    }
  }, 5 * 60 * 1000);

  // Rides
  app.get("/api/rides", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const cacheKey = 'rides:active';
    const cachedRides = getCachedData(cacheKey);

    if (cachedRides) {
      return res.json(cachedRides);
    }

    try {
      const [rides] = await measureExecutionTime(
        () => storage.getActiveRides(),
        "Fetch active rides"
      );

      // Validate rides data before caching
      if (Array.isArray(rides) && rides.every(ride =>
        ride.id &&
        ride.hostId &&
        ride.participants &&
        ride.host?.username
      )) {
        setCachedData(cacheKey, rides);
        res.json(rides);
      } else {
        log("Invalid rides data structure:", rides);
        throw new Error("Invalid rides data structure");
      }
    } catch (error) {
      log("Error fetching rides:", error);
      res.status(500).json({
        message: "Error fetching rides"
      });
    }
  });

  app.post("/api/rides", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parseResult = insertRideSchema.safeParse(req.body);
    if (!parseResult.success) return res.status(400).json(parseResult.error);

    if (parseResult.data.seatsAvailable < 1) {
      return res.status(400).json({
        message: "Number of available seats must be at least 1"
      });
    }

    try {
      const [ride] = await measureExecutionTime(
        () => storage.createRide(req.user.id, parseResult.data),
        "Create ride"
      );
      clearRideCache(); // Clear cache when ride is created
      res.status(201).json({ ride });
    } catch (error) {
      res.status(400).json({
        message: error instanceof Error ? error.message : "Failed to create ride"
      });
    }
  });

  // Modified delete route to handle archiving
  app.delete("/api/rides/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      await measureExecutionTime(
        () => storage.deleteRide(parseInt(req.params.id), req.user.id),
        "Delete ride"
      );
      clearRideCache();
      res.sendStatus(200);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to archive ride" });
    }
  });

  app.post("/api/rides/:id/leave", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const [ride] = await measureExecutionTime(
        () => storage.getRide(parseInt(req.params.id)),
        "Get ride"
      );
      if (!ride) throw new Error("Ride not found");

      // Only allow leaving if user is a participant but not the host
      if (!ride.participants.includes(req.user.id)) {
        throw new Error("You are not a participant in this ride");
      }
      if (ride.hostId === req.user.id) {
        throw new Error("As the host, you cannot leave the ride. You can delete it instead.");
      }

      const [updatedRide] = await measureExecutionTime(
        () => storage.removeParticipant(ride.id, req.user.id),
        "Remove participant"
      );
      clearRideCache();
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
      const [request, ride] = await measureExecutionTime(
        async () => {
          const request = await storage.createRequest(req.user.id, parseResult.data);
          const ride = await storage.addParticipant(request.rideId, req.user.id);
          return [request, ride];
        },
        "Create request and add participant"
      );
      clearRideCache();
      res.status(201).json({ request, ride });
    } catch (error) {
      res.status(400).json({
        message: error instanceof Error ? error.message : "Failed to join ride"
      });
    }
  });

  app.get("/api/rides/:rideId/requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const [requests] = await measureExecutionTime(
      () => storage.getRequestsByRide(parseInt(req.params.rideId)),
      "Get requests by ride"
    );
    res.json(requests);
  });

  // Messages
  app.get("/api/rides/:rideId/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    try {
      const [messages, executionTime] = await measureExecutionTime(
        () => storage.getMessagesByRide(parseInt(req.params.rideId)),
        "Fetch ride messages"
      );

      // Validate messages before sending
      if (Array.isArray(messages) && messages.every(msg =>
        msg.id &&
        msg.userId &&
        msg.content &&
        msg.timestamp
      )) {
        const paginatedMessages = messages.slice(offset, offset + limit);

        res.json({
          messages: paginatedMessages,
          pagination: {
            total: messages.length,
            page,
            limit,
            totalPages: Math.ceil(messages.length / limit)
          },
          performance: {
            executionTime,
            timestamp: new Date().toISOString()
          }
        });
      } else {
        log("Invalid messages data structure:", messages);
        throw new Error("Invalid messages data structure");
      }
    } catch (error) {
      log("Error fetching messages:", error);
      res.status(500).json({
        message: "Error fetching messages"
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
      const [message] = await measureExecutionTime(
        () => storage.createMessage(req.user.id, parseResult.data),
        "Create message"
      );
      clearRideCache();
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
      const [ride] = await measureExecutionTime(
        () => storage.getRide(rideId),
        "Get ride for kicking member"
      );
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

      const [updatedRide] = await measureExecutionTime(
        () => storage.removeParticipant(rideId, userIdToKick),
        "Remove participant (kick member)"
      );
      clearRideCache();
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
      const [archivedRides] = await measureExecutionTime(
        () => storage.getArchivedRides(req.user.id),
        "Get archived rides"
      );
      res.json(archivedRides);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to fetch archived rides" });
    }
  });

  return httpServer;
}