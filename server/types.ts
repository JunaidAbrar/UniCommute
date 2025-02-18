import { User, InsertUser, Ride, InsertRide, Request, InsertRequest, Message, InsertMessage } from "@shared/schema";
import type { Store } from "express-session";

export interface IStorage {
  sessionStore: Store;

  // User Operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsersByIds(ids: number[]): Promise<User[]>;  // New method

  // Ride Operations
  createRide(hostId: number, ride: InsertRide): Promise<Ride>;
  getRide(id: number): Promise<Ride | undefined>;
  getActiveRides(): Promise<Ride[]>;
  getRideWithCreator(id: number): Promise<{ ride: Ride; creator: User } | undefined>;  // New method
  getActiveRidesWithCreators(): Promise<{ ride: Ride; creator: User }[]>;  // New method

  // Request Operations
  createRequest(userId: number, request: InsertRequest): Promise<Request>;
  getRequestsByRide(rideId: number): Promise<Request[]>;

  // Message Operations
  createMessage(userId: number, message: InsertMessage): Promise<Message>;
  getMessagesByRide(rideId: number): Promise<Message[]>;
}