import { IStorage } from "./types";
import {
  User, InsertUser,
  Ride, InsertRide,
  Request, InsertRequest,
  Message, InsertMessage,
  TransportType
} from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private rides: Map<number, Ride>;
  private requests: Map<number, Request>;
  private messages: Map<number, Message>;
  sessionStore: session.Store;
  currentId: { [key: string]: number };

  constructor() {
    this.users = new Map();
    this.rides = new Map();
    this.requests = new Map();
    this.messages = new Map();
    this.currentId = { users: 1, rides: 1, requests: 1, messages: 1 };
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = this.currentId.users++;
    const newUser = { ...user, id, avatar: null };
    this.users.set(id, newUser);
    return newUser;
  }

  async createRide(hostId: number, ride: InsertRide): Promise<Ride> {
    const id = this.currentId.rides++;
    const newRide = { 
      ...ride, 
      id, 
      hostId, 
      isActive: true, 
      participants: [hostId] 
    };
    this.rides.set(id, newRide);
    return newRide;
  }

  async getRide(id: number): Promise<Ride | undefined> {
    return this.rides.get(id);
  }

  async getActiveRides(): Promise<Ride[]> {
    return Array.from(this.rides.values()).filter(ride => ride.isActive);
  }

  async transferRideOwnership(rideId: number, newHostId: number): Promise<Ride> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found");

    const updatedRide = { ...ride, hostId: newHostId };
    this.rides.set(rideId, updatedRide);
    return updatedRide;
  }

  async deleteRide(rideId: number, userId: number): Promise<void> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found");
    if (ride.hostId !== userId) throw new Error("Unauthorized");

    if (ride.transportType === "PERSONAL") {
      this.rides.delete(rideId);
    } else {
      const participants = ride.participants.filter(id => id !== userId);
      if (participants.length > 0) {
        const newHostId = participants[0];
        await this.transferRideOwnership(rideId, newHostId);
      } else {
        this.rides.delete(rideId);
      }
    }
  }

  async addParticipant(rideId: number, userId: number): Promise<Ride> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found");

    const updatedRide = { 
      ...ride, 
      participants: [...ride.participants, userId]
    };
    this.rides.set(rideId, updatedRide);
    return updatedRide;
  }

  async createRequest(userId: number, request: InsertRequest): Promise<Request> {
    const id = this.currentId.requests++;
    const newRequest = { ...request, id, userId, status: "PENDING", createdAt: new Date() };
    this.requests.set(id, newRequest);
    return newRequest;
  }

  async getRequestsByRide(rideId: number): Promise<Request[]> {
    return Array.from(this.requests.values()).filter(
      request => request.rideId === rideId
    );
  }

  async createMessage(userId: number, message: InsertMessage): Promise<Message> {
    const id = this.currentId.messages++;
    const newMessage = { 
      ...message, 
      id, 
      userId, 
      timestamp: new Date(),
      type: message.type || 'text',
      attachment: message.attachment || null
    };
    this.messages.set(id, newMessage);
    return newMessage;
  }

  async getMessagesByRide(rideId: number): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => message.rideId === rideId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

export const storage = new MemStorage();