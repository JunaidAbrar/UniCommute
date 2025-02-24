import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
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
import { eq, and, not, sql, lt } from "drizzle-orm";
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async verifyEmail(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.verificationToken, token));

    if (!user) return undefined;

    const [updatedUser] = await db
      .update(users)
      .set({
        isVerified: true,
        verificationToken: null
      })
      .where(eq(users.id, user.id))
      .returning();

    return updatedUser;
  }

  async setResetToken(userId: number, token: string, expires: Date): Promise<void> {
    await db
      .update(users)
      .set({
        resetPasswordToken: token,
        resetPasswordExpires: expires.toISOString()
      })
      .where(eq(users.id, userId));
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.resetPasswordToken, token));

    return user;
  }

  async setVerificationOTP(userId: number, otp: string, expires: Date): Promise<void> {
    await db
      .update(users)
      .set({
        verificationOTP: otp,
        verificationOTPExpires: expires.toISOString()
      })
      .where(eq(users.id, userId));
  }

  async verifyOTP(email: string, otp: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.email, email),
          eq(users.verificationOTP, otp),
          sql`${users.verificationOTPExpires} > NOW()`
        )
      );

    if (!user) return undefined;

    // Only update isVerified if the user is not already verified
    if (!user.isVerified) {
      const [updatedUser] = await db
        .update(users)
        .set({
          isVerified: true,
          verificationOTP: null,
          verificationOTPExpires: null
        })
        .where(eq(users.id, user.id))
        .returning();

      return updatedUser;
    }

    return user;
  }

  // Replace setResetPasswordOTP and verifyResetPasswordOTP with the existing methods
  async setResetPasswordOTP(userId: number, otp: string, expires: Date): Promise<void> {
    return this.setVerificationOTP(userId, otp, expires);
  }

  async verifyResetPasswordOTP(email: string, otp: string): Promise<User | undefined> {
    return this.verifyOTP(email, otp);
  }

  async updatePassword(userId: number, newPassword: string): Promise<void> {
    await db
      .update(users)
      .set({
        password: newPassword,
        verificationOTP: null,
        verificationOTPExpires: null
      })
      .where(eq(users.id, userId));
  }


  // Ride Operations
  async hasActiveRide(userId: number): Promise<boolean> {
    // Improved to only check for active rides
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
    // First verify the host exists
    const host = await this.getUser(hostId);
    if (!host) {
      throw new Error("Host user not found");
    }

    // Check for existing active rides
    const hasActive = await this.hasActiveRide(hostId);
    if (hasActive) {
      throw new Error("You already have an active ride. Complete or cancel your existing ride first.");
    }

    // Check if it's a female-only ride
    if (ride.femaleOnly && host.gender !== 'female') {
      throw new Error("Only female users can create female-only rides");
    }

    // Validate departure time is in the future
    const departureTime = new Date(ride.departureTime);
    if (departureTime < new Date()) {
      throw new Error("Departure time must be in the future");
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
    if (!host) {
      // If host not found, we should mark the ride as inactive
      await db
        .update(ridesTable)
        .set({ isActive: false })
        .where(eq(ridesTable.id, id));
      return undefined;
    }

    return { ...ride, host };
  }

  async archiveRide(rideId: number): Promise<Ride> {
    const [archivedRide] = await db
      .update(ridesTable)
      .set({
        isActive: false,
        isArchived: true,
        archivedAt: new Date().toISOString()
      })
      .where(eq(ridesTable.id, rideId))
      .returning();

    if (!archivedRide) throw new Error("Ride not found");
    return archivedRide;
  }

  async deleteRide(rideId: number, userId: number): Promise<void> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found");
    if (ride.hostId !== userId) throw new Error("Unauthorized");

    // Archive instead of delete
    await this.archiveRide(rideId);
  }

  async autoArchiveExpiredRides(): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    await db
      .update(ridesTable)
      .set({
        isActive: false,
        isArchived: true,
        archivedAt: new Date().toISOString()
      })
      .where(
        and(
          lt(ridesTable.departureTime, oneHourAgo),
          eq(ridesTable.isActive, true),
          eq(ridesTable.isArchived, false)
        )
      );
  }

  async getActiveRides(): Promise<RideWithDetails[]> {
    const rides = await db
      .select()
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.isActive, true),
          eq(ridesTable.isArchived, false)
        )
      )
      .orderBy(ridesTable.departureTime);

    const ridesWithDetails = await Promise.all(
      rides.map(async (ride) => {
        const host = await this.getUser(ride.hostId);
        if (!host) {
          return null;
        }

        const participantUsers = await Promise.all(
          ride.participants.map(async (id) => {
            const user = await this.getUser(id);
            return user || null;
          })
        );

        // Filter out null values and assert the type
        const validParticipants = participantUsers.filter((user): user is User => user !== null);

        return {
          ...ride,
          host: {
            username: host.username,
            university: host.university
          },
          participants: validParticipants
        };
      })
    );

    // Filter out null values from the rides array
    return ridesWithDetails.filter((ride): ride is RideWithDetails => ride !== null);
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
  async getArchivedRides(userId: number): Promise<RideWithDetails[]> {
    const rides = await db
      .select()
      .from(ridesTable)
      .where(
        and(
          eq(ridesTable.isArchived, true),
          sql`${ridesTable.participants} @> array[${userId}]::int[]`
        )
      )
      .orderBy(ridesTable.departureTime);

    const ridesWithDetails = await Promise.all(
      rides.map(async (ride) => {
        const host = await this.getUser(ride.hostId);
        if (!host) throw new Error(`Host not found for ride ${ride.id}`);

        const participantUsers = await Promise.all(
          ride.participants.map(async (id) => {
            const user = await this.getUser(id);
            if (!user) throw new Error(`Participant not found: ${id}`);
            return user;
          })
        );

        const rideWithDetails: RideWithDetails = {
          ...ride,
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
  async clearUserSessions(userId: number): Promise<void> {
    // Using drizzle-orm's sql template literal for safe SQL injection
    await db.execute(
      sql`DELETE FROM session WHERE sess->>'passport'->>'user' = ${userId.toString()}`
    );
  }
}

export const storage = new DatabaseStorage();