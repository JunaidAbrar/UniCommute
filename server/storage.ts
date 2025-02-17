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

    // Create new ride with atomic participant reference
    const [newRide] = await db
      .insert(ridesTable)
      .values({
        ...ride,
        hostId,
        isActive: true,
        participants: [hostId], // Host is automatically first participant
        stopPoints: ride.stopPoints || []
      })
      .returning();

    return newRide;
  }

  async getRide(id: number): Promise<Ride | undefined> {
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, id));
    return ride;
  }

  async getActiveRides(): Promise<Ride[]> {
    return await db
      .select()
      .from(ridesTable)
      .where(eq(ridesTable.isActive, true))
      .orderBy(ridesTable.departureTime);
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
    return await db
      .select()
      .from(messages)
      .where(eq(messages.rideId, rideId))
      .orderBy(messages.timestamp);
  }
}

export const storage = new DatabaseStorage();