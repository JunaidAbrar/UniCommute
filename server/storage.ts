import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertRideSchema, insertRequestSchema, insertMessageSchema } from "@shared/schema";
import { IStorage } from "./types";
import {
  users, rides as ridesTable, requests, messages,
  User, InsertUser,
  Ride, InsertRide,
  Request, InsertRequest,
  Message, InsertMessage
} from "@shared/schema";
import { db } from "./db";
import { eq, and, not, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

// Update RideWithDetails type to include estimatedFare
type RideWithDetails = Omit<Ride, 'participants'> & {
  host: Pick<User, 'username' | 'university'>;
  participants: User[];
  estimatedFare: number; // Added estimatedFare
};

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
      tableName: 'session'
    });
  }

  // User Operations
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  // Ride Operations
  async hasActiveRide(userId: number): Promise<boolean> {
    const activeRides = await db
      .select()
      .from(ridesTable)
      .where(
        and(
          sql`${ridesTable.participants} @> array[${userId}]::int[]`,
          eq(ridesTable.isActive, true)
        )
      );
    return activeRides.length > 0;
  }

  async createRide(hostId: number, ride: InsertRide): Promise<Ride> {
    // First check for existing active rides
    const hasActive = await this.hasActiveRide(hostId);
    if (hasActive) {
      throw new Error("You already have an active ride. Complete or cancel your existing ride first.");
    }

    // Check if it's a female-only ride
    if (ride.femaleOnly) {
      const host = await this.getUser(hostId);
      if (!host || host.gender !== 'female') {
        throw new Error("Only female users can create female-only rides");
      }
    }

    // Convert departureTime to ISO string if it's a Date object
    const rideData = {
      ...ride,
      departureTime: ride.departureTime instanceof Date ? ride.departureTime.toISOString() : ride.departureTime,
      hostId,
      isActive: true,
      participants: [hostId], // Host is automatically first participant
      stopPoints: ride.stopPoints || []
    };

    // Create new ride with atomic participant reference
    const [newRide] = await db
      .insert(ridesTable)
      .values(rideData)
      .returning();

    return newRide;
  }

  async getRide(id: number): Promise<Ride | undefined> {
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, id));
    return ride;
  }

  async getRideWithHost(id: number): Promise<(Ride & { host: User }) | undefined> {
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, id));
    if (!ride) return undefined;

    const host = await this.getUser(ride.hostId);
    if (!host) return undefined;

    return { ...ride, host };
  }

  // Update the getActiveRides method
  async getActiveRides(): Promise<RideWithDetails[]> {
    const rides = await db
      .select()
      .from(ridesTable)
      .where(eq(ridesTable.isActive, true))
      .orderBy(ridesTable.departureTime);

    const ridesWithDetails = await Promise.all(
      rides.map(async (ride) => {
        const host = await this.getUser(ride.hostId);
        if (!host) throw new Error(`Host not found for ride ${ride.id}`);

        // Fetch all participant details
        const participantUsers = await Promise.all(
          ride.participants.map(async (id) => {
            const user = await this.getUser(id);
            if (!user) throw new Error(`Participant not found: ${id}`);
            return user;
          })
        );

        // Create a ride with details object matching our extended type
        const rideWithDetails: RideWithDetails = {
          id: ride.id,
          hostId: ride.hostId,
          origin: ride.origin,
          destination: ride.destination,
          stopPoints: ride.stopPoints,
          departureTime: ride.departureTime,
          transportType: ride.transportType,
          seatsAvailable: ride.seatsAvailable,
          femaleOnly: ride.femaleOnly,
          isActive: ride.isActive,
          estimatedFare: ride.estimatedFare, // Added estimatedFare
          host: {
            username: host.username,
            university: host.university
          },
          participants: participantUsers
        };

        return rideWithDetails;
      })
    );

    return ridesWithDetails;
  }

  async deleteRide(rideId: number, userId: number): Promise<void> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found");
    if (ride.hostId !== userId) throw new Error("Unauthorized");

    // Different logic based on transport type
    if (ride.transportType === "PERSONAL") {
      // For personal vehicles, simply delete the ride
      await db.delete(ridesTable).where(eq(ridesTable.id, rideId));
    } else {
      // For CNG/UBER rides, handle ownership transfer if there are other participants
      const otherParticipants = ride.participants.filter(id => id !== userId);

      if (otherParticipants.length > 0) {
        // Transfer ownership to the first remaining participant
        await this.transferRideOwnership(rideId, otherParticipants[0]);
      } else {
        // If no other participants, delete the ride
        await db.delete(ridesTable).where(eq(ridesTable.id, rideId));
      }
    }
  }

  async transferRideOwnership(rideId: number, newHostId: number): Promise<Ride> {
    const [updatedRide] = await db
      .update(ridesTable)
      .set({
        hostId: newHostId,
        participants: sql`array_remove(${ridesTable.participants}, ${newHostId})`
      })
      .where(eq(ridesTable.id, rideId))
      .returning();

    if (!updatedRide) throw new Error("Ride not found");
    return updatedRide;
  }

  async addParticipant(rideId: number, userId: number): Promise<Ride> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found");

    // Check if user already has an active ride
    const hasActive = await this.hasActiveRide(userId);
    if (hasActive) {
      throw new Error("You already have an active ride. Leave your current ride before joining another.");
    }

    // Check if ride is full
    if (ride.participants.length >= ride.seatsAvailable) {
      throw new Error("This ride is full. No more seats available.");
    }

    // Check female-only ride restriction
    if (ride.femaleOnly) {
      const user = await this.getUser(userId);
      if (!user || user.gender !== 'female') {
        throw new Error("This ride is for female participants only");
      }
    }

    // Add participant atomically
    const [updatedRide] = await db
      .update(ridesTable)
      .set({
        participants: sql`array_append(${ridesTable.participants}, ${userId})`
      })
      .where(eq(ridesTable.id, rideId))
      .returning();

    return updatedRide;
  }

  async removeParticipant(rideId: number, userId: number): Promise<Ride> {
    const [updatedRide] = await db
      .update(ridesTable)
      .set({
        participants: sql`array_remove(${ridesTable.participants}, ${userId})`
      })
      .where(eq(ridesTable.id, rideId))
      .returning();

    if (!updatedRide) throw new Error("Ride not found");
    return updatedRide;
  }

  // Request Operations
  async createRequest(userId: number, request: InsertRequest): Promise<Request> {
    const [newRequest] = await db
      .insert(requests)
      .values({
        ...request,
        userId,
        status: "PENDING",
      })
      .returning();
    return newRequest;
  }

  async getRequestsByRide(rideId: number): Promise<Request[]> {
    return await db
      .select()
      .from(requests)
      .where(eq(requests.rideId, rideId));
  }

  // Message Operations
  async createMessage(userId: number, message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values({
        ...message,
        userId,
        type: message.type || 'text',
        attachment: message.attachment || null,
      })
      .returning();
    return newMessage;
  }

  async getMessagesByRide(rideId: number): Promise<Message[]> {
    const messagesWithUsers = await db
      .select({
        id: messages.id,
        rideId: messages.rideId,
        userId: messages.userId,
        content: messages.content,
        type: messages.type,
        attachment: messages.attachment,
        timestamp: messages.timestamp,
        username: users.username
      })
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(eq(messages.rideId, rideId))
      .orderBy(messages.timestamp);

    return messagesWithUsers;
  }
}

export const storage = new DatabaseStorage();