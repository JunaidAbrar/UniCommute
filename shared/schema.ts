import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  university: text("university").notNull(),
  gender: text("gender").notNull(),
  avatar: text("avatar")
});

export const transportType = z.enum(["PERSONAL", "UBER", "CNG"]);
export type TransportType = z.infer<typeof transportType>;

export const rides = pgTable("rides", {
  id: serial("id").primaryKey(),
  hostId: integer("host_id").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  stopPoints: text("stop_points").array().notNull().default([]),
  departureTime: timestamp("departure_time", { mode: 'string' }).notNull(),
  transportType: text("transport_type").notNull(),
  seatsAvailable: integer("seats_available").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  participants: integer("participants").array().notNull().default([])
});

export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  rideId: integer("ride_id").notNull(),
  userId: integer("user_id").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow()
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  rideId: integer("ride_id").notNull(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp", { mode: 'string' }).notNull().defaultNow(),
  type: text("type").notNull().default('text'),
  attachment: text("attachment")
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  university: true,
  gender: true
});

export const insertRideSchema = z.object({
  origin: z.string().min(1, "Origin is required"),
  destination: z.string().min(1, "Destination is required"),
  stopPoints: z.array(z.string()).optional(),
  departureTime: z.coerce.date(),
  transportType: transportType,
  seatsAvailable: z.number().min(1).max(6)
});

export const insertRequestSchema = createInsertSchema(requests).pick({
  rideId: true
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  rideId: true,
  content: true,
  type: true,
  attachment: true
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertRide = z.infer<typeof insertRideSchema>;
export type InsertRequest = z.infer<typeof insertRequestSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type User = typeof users.$inferSelect;
export type Ride = typeof rides.$inferSelect;
export type Request = typeof requests.$inferSelect;
export type Message = typeof messages.$inferSelect;