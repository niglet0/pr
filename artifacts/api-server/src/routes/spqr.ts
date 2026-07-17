/**
 * /api/spqr — the SPQR Oracle chat endpoint.
 *
 * Requires a valid Supabase Bearer token (verified by populateAuth in app.ts).
 * The same token is forwarded into the agent's tool calls so every read/write
 * it performs respects the user's own Supabase row-level security.
 *
 * Streams progress over SSE so the client can show a live "what the Oracle
 * is doing" workflow instead of a blank spinner, then ends with a `done`
 * event carrying the final reply and any structured cards.
 */

import { Router, type IRouter } from "express";
import { db, spqrConversationsTable, spqrMessagesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { runSpqrAgent, type SpqrCard } from "../services/spqrAgent";

const router: IRouter = Router();

router.post("/spqr/chat", async (req, res) => {
  const userId = (req as any).userId as string | undefined;
  const authHeader = req.headers.authorization;
  if (!userId || !authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Sign in required to consult the Oracle." });
    return;
  }
  const userAccessToken = authHeader.slice(7);

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    res.status(400).json({ error: "Message is required." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    let conversationId = typeof req.body?.conversationId === "string" ? req.body.conversationId : undefined;
    let conversation;
    if (conversationId) {
      [conversation] = await db
        .select()
        .from(spqrConversationsTable)
        .where(eq(spqrConversationsTable.id, conversationId));
    }
    if (!conversation || conversation.userId !== userId) {
      [conversation] = await db
        .insert(spqrConversationsTable)
        .values({ userId, title: message.slice(0, 60) })
        .returning();
    }
    conversationId = conversation.id;
    send({ type: "status", conversationId, label: "Reaching the Oracle…" });

    const priorRows = await db
      .select()
      .from(spqrMessagesTable)
      .where(eq(spqrMessagesTable.conversationId, conversationId))
      .orderBy(asc(spqrMessagesTable.createdAt))
      .limit(24);

    const history = priorRows
      .filter((r) => r.role !== "tool")
      .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
    history.push({ role: "user", content: message });

    await db.insert(spqrMessagesTable).values({ conversationId, role: "user", content: message });

    const { reply, cards } = await runSpqrAgent(history, { userId, userAccessToken }, (event) => {
      // Forward ALL event fields so the frontend WorkflowMap gets toolIcon, step, etc.
      send({ ...event });
    });

    await db
      .insert(spqrMessagesTable)
      .values({ conversationId, role: "assistant", content: reply, toolCalls: cards.length ? cards : null });
    await db
      .update(spqrConversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(spqrConversationsTable.id, conversationId));

    send({ type: "done", conversationId, reply, cards });
  } catch (err: any) {
    req.log.error({ err }, "spqr chat failed");
    send({ type: "error", error: err?.message || "The Oracle is unreachable. Retry." });
  } finally {
    res.end();
  }
});

router.get("/spqr/conversations/:id/messages", async (req, res) => {
  const userId = (req as any).userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  const [conversation] = await db
    .select()
    .from(spqrConversationsTable)
    .where(eq(spqrConversationsTable.id, req.params.id));
  if (!conversation || conversation.userId !== userId) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const rows = await db
    .select()
    .from(spqrMessagesTable)
    .where(eq(spqrMessagesTable.conversationId, conversation.id))
    .orderBy(asc(spqrMessagesTable.createdAt));
  res.json({
    messages: rows
      .filter((r) => r.role !== "tool")
      .map((r) => ({
        role: r.role,
        content: r.content,
        cards: (r.toolCalls as SpqrCard[] | null) || undefined,
      })),
  });
});

export default router;
