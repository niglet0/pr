import { pgTable, text, timestamp, uuid, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * SPQR Oracle — persistent chat history + long-term agent memory.
 * Keyed by Supabase user id (a plain text column here, since the app's
 * user/auth records live in Supabase, not this database).
 */

export const spqrConversationsTable = pgTable("spqr_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("New conversation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSpqrConversationSchema = createInsertSchema(spqrConversationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSpqrConversation = z.infer<typeof insertSpqrConversationSchema>;
export type SpqrConversation = typeof spqrConversationsTable.$inferSelect;

export const spqrMessagesTable = pgTable("spqr_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => spqrConversationsTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
  content: text("content").notNull(),
  toolCalls: jsonb("tool_calls"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSpqrMessageSchema = createInsertSchema(spqrMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSpqrMessage = z.infer<typeof insertSpqrMessageSchema>;
export type SpqrMessage = typeof spqrMessagesTable.$inferSelect;

/**
 * Long-term key/value memory the agent can write to and recall from across
 * conversations (e.g. user preferences, ongoing tasks, facts it learned).
 */
export const spqrMemoriesTable = pgTable(
  "spqr_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("spqr_memories_user_key_idx").on(table.userId, table.key)],
);

export const insertSpqrMemorySchema = createInsertSchema(spqrMemoriesTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertSpqrMemory = z.infer<typeof insertSpqrMemorySchema>;
export type SpqrMemory = typeof spqrMemoriesTable.$inferSelect;
