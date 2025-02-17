import { IStorage } from "./types";
import {
  users, rides as ridesTable, requests, messages,
  User, InsertUser,
  Ride, InsertRide,
  Request, InsertRequest,
  Message, InsertMessage
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
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
          eq(ridesTable.hostId, userId),
          eq(ridesTable.isActive, true)
        )
      );
    return activeRides.length > 0;
  }

  async createRide(hostId: number, ride: InsertRide): Promise<Ride> {
    const hasActive = await this.hasActiveRide(hostId);
    if (hasActive) {
      throw new Error("You already have an active ride. Complete or cancel your existing ride first.");
    }

    const [newRide] = await db
      .insert(ridesTable)
      .values({
        ...ride,
        hostId,
        isActive: true,
        participants: [hostId],
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
    return await db.select().from(ridesTable).where(eq(ridesTable.isActive, true));
  }

  async deleteRide(rideId: number, userId: number): Promise<void> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found");
    if (ride.hostId !== userId) throw new Error("Unauthorized");

    if (ride.transportType === "PERSONAL") {
      await db.delete(ridesTable).where(eq(ridesTable.id, rideId));
    } else {
      // For CNG/UBER rides, transfer ownership if there are other participants
      const participants = ride.participants.filter(id => id !== userId);
      if (participants.length > 0) {
        await this.transferRideOwnership(rideId, participants[0]);
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
        participants: db.raw(`array_remove(participants, ${newHostId})`)
      })
      .where(eq(ridesTable.id, rideId))
      .returning();

    if (!updatedRide) throw new Error("Ride not found");
    return updatedRide;
  }

  async addParticipant(rideId: number, userId: number): Promise<Ride> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found");

    const [updatedRide] = await db
      .update(ridesTable)
      .set({
        participants: [...(ride.participants || []), userId],
      })
      .where(eq(ridesTable.id, rideId))
      .returning();

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