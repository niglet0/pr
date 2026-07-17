/**
 * SPQR Oracle — v2
 *
 * Security hardening:
 *  - NO table/column names are ever exposed in tool schemas the LLM sees.
 *  - Abstract "area" names map server-side to real tables.
 *  - Specific write-action tools replace the generic write_data slot.
 *  - LLM output is checked for schema-name leakage before being returned.
 *
 * Write flow:
 *  - All write tools accept confirm:boolean.
 *  - confirm=false → returns a preview card (no DB write).
 *  - confirm=true  → executes the real write.
 *  - System prompt instructs the agent to always call with confirm=false first,
 *    show the preview, get user approval, THEN call with confirm=true.
 */

import { createClient } from "@supabase/supabase-js";
import { db, spqrMemoriesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://hajfuirqchzucmkeaxxd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhamZ1aXJxY2h6dWNta2VheHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDkwNTksImV4cCI6MjA5MjQyNTA1OX0.pzTjau8MGEFNpVu3lly5i3XPb6wpBAWZDB5BGg7Lls0";

const POLLINATIONS_URL = "https://text.pollinations.ai/openai/chat/completions";
const MODEL = "openai-fast";

// ── Area → actual table mapping (NEVER exposed to the LLM) ──────────────────
const AREA_TABLE: Record<string, string> = {
  launches: "v_launches",
  users: "users",
  bounties: "bounties",
  dev_stacks: "v_dev_stacks",
  posts: "v_posts",
  marketplace: "marketplace_listings",
  groups: "v_groups",
  collab_requests: "v_collab_requests",
};

// Safe columns per area (never give the LLM raw column names)
const AREA_COLUMNS: Record<string, string> = {
  launches: "id,headline,tagline,description,cover_url,screenshots,category,platform,pricing_model,price_display,tech_stack,upvotes_count,comments_count,launch_date,is_pinned,launcher_name,launcher_username,launcher_avatar,website_url,github_url",
  users: "id,username,display_name,bio,avatar_url,banner_url,verified,followers_count,following_count,tech_stack,hire_me,status",
  bounties: "id,title,description,bounty_amount,tags,urgency,status,created_at,creator_id",
  dev_stacks: "id,name,description,tools,upvotes_count,created_at,creator_name,creator_avatar,creator_username",
  posts: "id,content,image_url,link_url,likes_count,comments_count,reposts_count,created_at,username,display_name,avatar_url,verified",
  marketplace: "id,title,summary,cover_url,tech_stack,tags,price_cents,pricing_model,rating,reviews_count,purchases_count,is_featured",
  groups: "id,name,description,members_count,is_channel,banner_url,avatar_url,category,creator_username",
  collab_requests: "id,title,description,project_stage,roles_needed,tech_stack,equity_offered,paid,upvotes_count,creator_name,creator_avatar,creator_username",
};

const AREA_SORT_COL: Record<string, { top: string; latest: string }> = {
  launches: { top: "upvotes_count", latest: "launch_date" },
  users: { top: "followers_count", latest: "created_at" },
  bounties: { top: "created_at", latest: "created_at" },
  dev_stacks: { top: "upvotes_count", latest: "created_at" },
  posts: { top: "likes_count", latest: "created_at" },
  marketplace: { top: "purchases_count", latest: "created_at" },
  groups: { top: "members_count", latest: "created_at" },
  collab_requests: { top: "upvotes_count", latest: "created_at" },
};

// ── Card builders (use real schema fields) ───────────────────────────────────
export interface SpqrCard {
  type: string;
  id?: string;
  title: string;
  subtitle?: string;
  image?: string;
  screenshots?: string[];
  badges?: string[];
  techStack?: string[];
  stats?: { label: string; value: any }[];
  price?: string;
  actionType?: string;
  draftData?: Record<string, any>;
  creatorName?: string;
  creatorAvatar?: string;
  verified?: boolean;
  url?: string;
  githubUrl?: string;
  // Form card fields
  formType?: string;
  formFields?: Array<{
    key: string;
    label: string;
    placeholder?: string;
    inputType: "text" | "textarea" | "url" | "select" | "tags" | "number";
    required?: boolean;
    options?: string[];
    draftValue?: string | string[];
  }>;
  formSubmitLabel?: string;
  formIcon?: string;
}

type CardBuilder = (row: any) => SpqrCard | null;

const CARD_BUILDERS: Record<string, CardBuilder> = {
  v_launches: (r) => ({
    type: "launch",
    actionType: "launch",
    id: r.id,
    title: r.headline || "Untitled launch",
    subtitle: r.tagline || r.description?.slice(0, 120) || undefined,
    image: r.cover_url || r.listing_cover_url || undefined,
    screenshots: Array.isArray(r.screenshots) ? r.screenshots.slice(0, 3) : undefined,
    badges: [r.category, r.pricing_model].filter(Boolean),
    techStack: Array.isArray(r.tech_stack) ? r.tech_stack.slice(0, 5) : [],
    stats: [
      { label: "Upvotes", value: r.upvotes_count ?? 0 },
      { label: "Comments", value: r.comments_count ?? 0 },
    ],
    price: r.price_display || (r.pricing_model === "free" ? "Free" : undefined),
    creatorName: r.launcher_name || r.launcher_username || undefined,
    creatorAvatar: r.launcher_avatar || undefined,
    url: r.website_url || undefined,
    githubUrl: r.github_url || undefined,
  }),
  launches: (r) => CARD_BUILDERS.v_launches(r),
  users: (r) => ({
    type: "user",
    actionType: "user",
    id: r.id,
    title: r.display_name || r.username || "Unknown user",
    subtitle: r.bio?.slice(0, 120) || (r.username ? `@${r.username}` : undefined),
    image: r.avatar_url || undefined,
    badges: [
      r.verified ? "Verified" : null,
      r.hire_me ? "Open to Hire" : null,
    ].filter(Boolean) as string[],
    techStack: Array.isArray(r.tech_stack) ? r.tech_stack.slice(0, 6) : [],
    stats: [
      { label: "Followers", value: r.followers_count ?? 0 },
      { label: "Following", value: r.following_count ?? 0 },
    ],
    verified: r.verified,
  }),
  bounties: (r) => ({
    type: "bounty",
    actionType: "bounty",
    id: r.id,
    title: r.title || "Untitled bounty",
    subtitle: r.description?.slice(0, 120) || undefined,
    badges: [r.status, r.urgency].filter(Boolean),
    stats: [
      { label: "Reward", value: r.bounty_amount || "—" },
    ],
  }),
  v_dev_stacks: (r) => ({
    type: "stack",
    actionType: "stack",
    id: r.id,
    title: r.name || "Untitled stack",
    subtitle: r.description?.slice(0, 120) || undefined,
    techStack: typeof r.tools === "object" ? Object.values(r.tools).flat().slice(0, 8) as string[] : [],
    stats: [{ label: "Upvotes", value: r.upvotes_count ?? 0 }],
    creatorName: r.creator_name || r.creator_username || undefined,
    creatorAvatar: r.creator_avatar || undefined,
  }),
  dev_stacks: (r) => CARD_BUILDERS.v_dev_stacks(r),
  v_posts: (r) => ({
    type: "post",
    actionType: "post",
    id: r.id,
    title: r.display_name || "Post",
    subtitle: r.content?.slice(0, 160) || undefined,
    image: r.image_url || undefined,
    stats: [
      { label: "Likes", value: r.likes_count ?? 0 },
      { label: "Comments", value: r.comments_count ?? 0 },
    ],
    creatorName: r.display_name || r.username,
    creatorAvatar: r.avatar_url,
    verified: r.verified,
  }),
  posts: (r) => CARD_BUILDERS.v_posts(r),
  marketplace_listings: (r) => ({
    type: "listing",
    actionType: "listing",
    id: r.id,
    title: r.title || "Untitled listing",
    subtitle: r.summary?.slice(0, 120) || undefined,
    image: r.cover_url || undefined,
    techStack: Array.isArray(r.tech_stack) ? r.tech_stack.slice(0, 5) : [],
    stats: [
      { label: "Rating", value: r.rating ? `${Number(r.rating).toFixed(1)}★` : "—" },
      { label: "Sales", value: r.purchases_count ?? 0 },
    ],
    price: r.price_cents ? `$${(r.price_cents / 100).toFixed(2)}` : "Free",
    badges: r.is_featured ? ["Featured"] : [],
  }),
  marketplace: (r) => CARD_BUILDERS.marketplace_listings(r),
  v_groups: (r) => ({
    type: "group",
    actionType: "group",
    id: r.id,
    title: r.name || "Untitled group",
    subtitle: r.description?.slice(0, 120) || undefined,
    image: r.avatar_url || r.banner_url || undefined,
    badges: [r.is_channel ? "Channel" : "Group", r.category].filter(Boolean),
    stats: [{ label: r.is_channel ? "Subscribers" : "Members", value: r.members_count ?? 0 }],
    creatorName: r.creator_username,
  }),
  groups: (r) => CARD_BUILDERS.v_groups(r),
  v_collab_requests: (r) => ({
    type: "collab",
    actionType: "collab",
    id: r.id,
    title: r.title || "Untitled collab",
    subtitle: r.description?.slice(0, 120) || undefined,
    techStack: Array.isArray(r.tech_stack) ? r.tech_stack.slice(0, 5) : [],
    badges: [r.project_stage, r.equity_offered ? "Equity" : null, r.paid ? "Paid" : null].filter(Boolean) as string[],
    stats: [{ label: "Upvotes", value: r.upvotes_count ?? 0 }],
    creatorName: r.creator_name || r.creator_username,
    creatorAvatar: r.creator_avatar,
  }),
  collab_requests: (r) => CARD_BUILDERS.v_collab_requests(r),
};

// ── Security: strip any accidental schema leakage from LLM text ─────────────
const SCHEMA_LEAK_PATTERNS = [
  /\b(v_launches|v_posts|v_dev_stacks|v_groups|v_bounties|v_collab_requests)\b/gi,
  /\b(marketplace_listings|launch_upvotes|launch_bookmarks|launch_comments|entity_followers|bounty_milestones|stack_upvotes|group_members)\b/gi,
  /\b(postgres|supabase|schema|table name|column name|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/gi,
];
function sanitizeLLMOutput(text: string): string {
  let out = text;
  for (const pat of SCHEMA_LEAK_PATTERNS) {
    out = out.replace(pat, "[internal]");
  }
  return out;
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the SPQR Oracle — the built-in AI agent of Hatch, a social network and workspace for builders (product launches, bounties, dev stacks, marketplace, messaging, groups).

You have LIVE access to all Hatch data via tools and persistent memory across sessions.

═══ APP AREAS ═══
• Launches — product launches; community upvotes, bookmarks, comments
• Dev Hub — bounties with milestones, dev stacks (tech setups), sandbox IDE
• Marketplace — digital products for sale (tools, templates, services)
• Network — posts/feed, follow people, collab requests, groups & channels
• Messages — direct chats, groups, broadcast channels

═══ TOOLS ═══
• search — find LIVE content (launches, users, bounties, dev stacks, posts, marketplace, groups, collab_requests)
• show_form — display a FILLABLE CARD for the user to create something (ALWAYS use this for create actions)
• upvote_launch / bookmark_launch / comment_on_launch — engage with launches
• follow_user — follow someone
• create_post / create_bounty / launch_product / create_dev_stack / create_group — write actions
• remember / recall — persist facts across sessions

═══ HARD RULES — NEVER BREAK ═══
1. NEVER mention table names, column names, SQL, "database", "schema", "supabase", or raw UUIDs.
2. When search returns results, your text reply is ONE short sentence intro (e.g. "Here are the top launches:"). The cards carry the detail.
3. ALWAYS search before saying "I can't find". The search tool has live data. Never assume data doesn't exist without trying.
4. FORM-FIRST FOR ALL CREATE ACTIONS: When the user wants to create/launch/post/share ANYTHING, IMMEDIATELY call show_form with the right formType. Do NOT ask for fields one by one in chat. The form card lets the user fill everything at once.
   - Create product / launch → show_form(formType:"product_launch")
   - Create bounty → show_form(formType:"bounty")
   - Write post → show_form(formType:"post")
   - Share dev stack → show_form(formType:"dev_stack")
   - Create group/channel → show_form(formType:"group")
5. FORM SUBMISSIONS: When the user's message is a JSON object starting with {"_form":...}, it is a submitted form. Parse it immediately and call the corresponding write tool with confirm=false to show a preview card. Example: {"_form":"product_launch","data":{"headline":"X","tagline":"Y",...}} → call launch_product(headline:"X", tagline:"Y", ..., confirm:false).
6. WRITE CONFIRMATION: All write tools need confirm=false first (preview card shown), then confirm=true after user says "yes", "proceed", "publish", "create", "do it", or similar affirmative.
7. Never expose raw error messages. Report failures in plain product language.
8. Use remember() for anything worth persisting across sessions.
9. Tone: concise, warm, slightly imperial. Short replies — the visual cards carry the detail.`;

// ── Tool definitions (NO table/column names visible) ─────────────────────────
interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search",
      description: "Search and browse live content in Hatch. Use area to choose what to search: 'launches' (product launches), 'users' (people), 'bounties' (open dev bounties), 'dev_stacks' (tech stacks), 'posts' (activity feed), 'marketplace' (products for sale), 'groups' (groups & channels), 'collab_requests' (collab posts).",
      parameters: {
        type: "object",
        properties: {
          area: {
            type: "string",
            enum: ["launches", "users", "bounties", "dev_stacks", "posts", "marketplace", "groups", "collab_requests"],
            description: "What area to search.",
          },
          sort: {
            type: "string",
            enum: ["latest", "top", "oldest"],
            description: "Sort order. 'top' = most upvoted/liked, 'latest' = newest.",
          },
          keyword: { type: "string", description: "Keyword to search for in titles/content." },
          status: { type: "string", enum: ["open", "closed", "active"], description: "Filter by status (for bounties etc.)." },
          limit: { type: "number", description: "Max results, default 5, max 20." },
        },
        required: ["area"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upvote_launch",
      description: "Upvote a product launch on behalf of the user. ALWAYS call with confirm=false first to show a preview, then call again with confirm=true only after explicit user approval.",
      parameters: {
        type: "object",
        properties: {
          launch_id: { type: "string", description: "ID of the launch to upvote (from a previous search result)." },
          confirm: { type: "boolean", description: "false = preview only (default), true = execute the upvote." },
        },
        required: ["launch_id", "confirm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bookmark_launch",
      description: "Bookmark a product launch. ALWAYS call with confirm=false first to preview, then confirm=true after user approves.",
      parameters: {
        type: "object",
        properties: {
          launch_id: { type: "string", description: "ID of the launch to bookmark." },
          confirm: { type: "boolean", description: "false = preview only, true = execute." },
        },
        required: ["launch_id", "confirm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "comment_on_launch",
      description: "Post a comment on a product launch. Show preview (confirm=false) first, execute (confirm=true) after user approval.",
      parameters: {
        type: "object",
        properties: {
          launch_id: { type: "string", description: "ID of the launch." },
          body: { type: "string", description: "The comment text." },
          confirm: { type: "boolean", description: "false = preview only, true = post the comment." },
        },
        required: ["launch_id", "body", "confirm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "follow_user",
      description: "Follow another user. Show preview (confirm=false) first, then confirm=true after user approval.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "ID of the user to follow (from search results)." },
          confirm: { type: "boolean", description: "false = preview only, true = follow." },
        },
        required: ["user_id", "confirm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_post",
      description: "Create a post in the activity feed. Show preview (confirm=false) first, execute (confirm=true) after user approval.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Post text content." },
          image_url: { type: "string", description: "Optional image URL to attach." },
          confirm: { type: "boolean", description: "false = preview only, true = publish." },
        },
        required: ["content", "confirm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_bounty",
      description: "Create a new dev bounty with optional milestones. Show preview (confirm=false) first, create (confirm=true) after user approval.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          amount: { type: "string", description: "Reward amount string, e.g. '500 credits' or '$200'." },
          urgency: { type: "string", enum: ["Low", "Medium", "High", "Critical"] },
          tags: { type: "array", items: { type: "string" } },
          milestones: {
            type: "array",
            description: "Optional list of milestones.",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
              },
              required: ["title"],
            },
          },
          confirm: { type: "boolean", description: "false = preview only, true = create the bounty." },
        },
        required: ["title", "description", "amount", "confirm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "launch_product",
      description: "Publish a new product launch on Hatch. Show preview (confirm=false) first, publish (confirm=true) after user approval.",
      parameters: {
        type: "object",
        properties: {
          headline: { type: "string", description: "Product name / launch headline." },
          tagline: { type: "string", description: "One-sentence tagline." },
          description: { type: "string", description: "Full description." },
          website_url: { type: "string" },
          github_url: { type: "string" },
          category: { type: "string" },
          tech_stack: { type: "array", items: { type: "string" } },
          pricing_model: { type: "string", enum: ["free", "paid", "freemium", "subscription", "open_source"] },
          price_display: { type: "string", description: "Human-readable price, e.g. '$9/mo' or 'Free'." },
          confirm: { type: "boolean", description: "false = preview only, true = publish the launch." },
        },
        required: ["headline", "tagline", "confirm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_dev_stack",
      description: "Share a new dev stack (tech setup) on Hatch. Show preview (confirm=false) first, share (confirm=true) after approval.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          tools: {
            type: "object",
            description: "Tools by category, e.g. { 'Frontend': ['React', 'Tailwind'], 'Backend': ['Node.js'] }",
            additionalProperties: { type: "array", items: { type: "string" } },
          },
          confirm: { type: "boolean", description: "false = preview only, true = publish." },
        },
        required: ["name", "tools", "confirm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_group",
      description: "Create a new group or broadcast channel. Show preview (confirm=false) first, create (confirm=true) after approval.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          is_channel: { type: "boolean", description: "true = broadcast channel, false = group chat." },
          category: { type: "string" },
          confirm: { type: "boolean", description: "false = preview only, true = create." },
        },
        required: ["name", "is_channel", "confirm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_form",
      description: "Display a fillable form card to the user so they can enter details for creating something. ALWAYS call this instead of asking for fields one by one in chat. Use it when the user wants to: create a product launch, post a bounty, share a dev stack, write a post, or create a group/channel.",
      parameters: {
        type: "object",
        properties: {
          formType: {
            type: "string",
            enum: ["product_launch", "bounty", "post", "dev_stack", "group"],
            description: "The type of item to create.",
          },
          draftData: {
            type: "object",
            description: "Any values already collected from the conversation to pre-fill into the form.",
            additionalProperties: true,
          },
        },
        required: ["formType"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description: "Persist a fact, preference, or note about this user for future conversations.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Short identifier, e.g. 'main_project' or 'preferred_stack'." },
          value: { type: "string" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall",
      description: "Look up previously remembered facts. Omit key to list all remembered facts.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string" },
        },
      },
    },
  },
];

// ── Human-readable labels for the workflow animation ─────────────────────────
export const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  search:            { label: "Searching the archives",  icon: "Search"       },
  show_form:         { label: "Preparing your form",     icon: "ClipboardList" },
  upvote_launch:     { label: "Recording your upvote",   icon: "ArrowUp"      },
  bookmark_launch:   { label: "Saving to bookmarks",     icon: "Bookmark"     },
  comment_on_launch: { label: "Posting your comment",    icon: "MessageSquare"},
  follow_user:       { label: "Following the user",      icon: "UserPlus"     },
  create_post:       { label: "Publishing your post",    icon: "Send"         },
  create_bounty:     { label: "Creating bounty",         icon: "Coins"        },
  launch_product:    { label: "Launching your product",  icon: "Rocket"       },
  create_dev_stack:  { label: "Sharing your stack",      icon: "Layers"       },
  create_group:      { label: "Creating the group",      icon: "Users"        },
  remember:          { label: "Committing to memory",    icon: "Brain"        },
  recall:            { label: "Recalling memory",        icon: "Sparkles"     },
};

// ── Per-area keyword search column (each view uses a different field name) ────
const AREA_KEYWORD_COL: Record<string, string> = {
  launches:        "headline",
  users:           "display_name",
  bounties:        "title",
  dev_stacks:      "name",
  posts:           "content",
  marketplace:     "title",
  groups:          "name",
  collab_requests: "title",
};

// ── Supabase client factories ─────────────────────────────────────────────────
/** Public (anon-key only) — used for all READ queries so RLS doesn't block public data */
function publicSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
/** Scoped to the user's JWT — used for all WRITE operations so RLS enforces user identity */
function scopedSupabase(userAccessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userAccessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Form specs for show_form tool ─────────────────────────────────────────────
interface FormField {
  key: string;
  label: string;
  placeholder?: string;
  inputType: "text" | "textarea" | "url" | "select" | "tags" | "number";
  required?: boolean;
  options?: string[];
  draftValue?: string | string[];
}

interface FormSpec {
  formType: string;
  title: string;
  icon: string;
  submitLabel: string;
  fields: FormField[];
}

const FORM_SPECS: Record<string, Omit<FormSpec, "formType">> = {
  product_launch: {
    title: "Launch a Product",
    icon: "Rocket",
    submitLabel: "Preview Launch →",
    fields: [
      { key: "headline",      label: "Product Name",    placeholder: "e.g. Hatch AI",                    inputType: "text",     required: true },
      { key: "tagline",       label: "Tagline",         placeholder: "One sentence that grabs attention", inputType: "text",     required: true },
      { key: "description",   label: "Description",     placeholder: "What it does and why it matters",  inputType: "textarea" },
      { key: "website_url",   label: "Website",         placeholder: "https://...",                       inputType: "url" },
      { key: "github_url",    label: "GitHub",          placeholder: "https://github.com/...",            inputType: "url" },
      { key: "tech_stack",    label: "Tech Stack",      placeholder: "React, Node.js, Supabase…",        inputType: "tags" },
      { key: "category",      label: "Category",        placeholder: "AI, Productivity, Dev Tools…",     inputType: "text" },
      { key: "pricing_model", label: "Pricing Model",   inputType: "select",
        options: ["free", "paid", "freemium", "subscription", "open_source"] },
      { key: "price_display", label: "Price Display",   placeholder: "Free  /  $9/mo  /  $49",           inputType: "text" },
    ],
  },
  bounty: {
    title: "Create a Bounty",
    icon: "Coins",
    submitLabel: "Preview Bounty →",
    fields: [
      { key: "title",       label: "Bounty Title",  placeholder: "What needs to be built?",            inputType: "text",     required: true },
      { key: "description", label: "Description",   placeholder: "Describe the task in detail",        inputType: "textarea", required: true },
      { key: "amount",      label: "Reward",        placeholder: "$200  or  500 credits",              inputType: "text",     required: true },
      { key: "urgency",     label: "Urgency",       inputType: "select", options: ["Low","Medium","High","Critical"] },
      { key: "tags",        label: "Tags",          placeholder: "React, API, UI Design…",             inputType: "tags" },
    ],
  },
  post: {
    title: "New Post",
    icon: "MessageSquare",
    submitLabel: "Preview Post →",
    fields: [
      { key: "content",   label: "Content",         placeholder: "What's on your mind?",               inputType: "textarea", required: true },
      { key: "image_url", label: "Image URL",        placeholder: "https://… (optional)",               inputType: "url" },
    ],
  },
  dev_stack: {
    title: "Share Your Dev Stack",
    icon: "Layers",
    submitLabel: "Preview Stack →",
    fields: [
      { key: "name",        label: "Stack Name",    placeholder: "e.g. My SaaS Starter",              inputType: "text",     required: true },
      { key: "description", label: "Description",   placeholder: "What problem does this stack solve?",inputType: "textarea" },
      { key: "frontend",    label: "Frontend",      placeholder: "React, Next.js, Tailwind…",          inputType: "tags" },
      { key: "backend",     label: "Backend",       placeholder: "Node.js, Fastify, Express…",         inputType: "tags" },
      { key: "database",    label: "Database",      placeholder: "Postgres, Supabase, Redis…",         inputType: "tags" },
      { key: "devops",      label: "DevOps / Infra",placeholder: "Docker, Vercel, AWS…",               inputType: "tags" },
    ],
  },
  group: {
    title: "Create a Group",
    icon: "Users",
    submitLabel: "Preview Group →",
    fields: [
      { key: "name",        label: "Name",          placeholder: "e.g. React Builders",                inputType: "text",     required: true },
      { key: "description", label: "Description",   placeholder: "What is this group about?",          inputType: "textarea" },
      { key: "category",    label: "Category",      placeholder: "Design, Engineering, Marketing…",    inputType: "text" },
      { key: "is_channel",  label: "Type",          inputType: "select",
        options: ["group", "channel"],
        placeholder: "group = everyone posts · channel = admin only" },
    ],
  },
};

function truncateStrings(value: any, max = 280): any {
  if (typeof value === "string") return value.length > max ? value.slice(0, max) + "…" : value;
  if (Array.isArray(value)) return value.map((v) => truncateStrings(v, max));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) out[k] = truncateStrings(value[k], max);
    return out;
  }
  return value;
}

// ── Tool executor ────────────────────────────────────────────────────────────
async function runTool(
  name: string,
  args: Record<string, any>,
  ctx: { userId: string; userAccessToken: string },
  collectedCards: SpqrCard[],
): Promise<string> {
  try {
    // ── search ────────────────────────────────────────────────────────────
    if (name === "search") {
      const area = args.area as string;
      const table = AREA_TABLE[area];
      if (!table) return JSON.stringify({ error: "That content area is not available." });

      // Use PUBLIC client (anon key only) for reads — avoids RLS blocking public data
      const sb = publicSupabase();
      const cols = AREA_COLUMNS[area] || "*";
      let q: any = sb.from(table).select(cols);

      // keyword filter — use the correct column name per area (v_launches uses 'headline', not 'title')
      if (args.keyword) {
        const kwCol = AREA_KEYWORD_COL[area] || "title";
        q = q.ilike(kwCol, `%${args.keyword}%`);
      }
      // status filter
      if (args.status) {
        q = q.eq("status", args.status);
      }

      // sort
      const sortMap = AREA_SORT_COL[area];
      if (args.sort === "top" && sortMap) {
        q = q.order(sortMap.top, { ascending: false });
      } else if (args.sort === "oldest" && sortMap) {
        q = q.order(sortMap.latest, { ascending: true });
      } else if (sortMap) {
        q = q.order(sortMap.latest, { ascending: false });
      }

      q = q.limit(Math.min(Number(args.limit) || 5, 20));

      const { data, error } = await q;
      if (error) {
        logger.error({ err: error, area, table }, "spqr search failed");
        return JSON.stringify({ error: "Could not fetch that content right now.", detail: error.message });
      }

      const builder = CARD_BUILDERS[table] || CARD_BUILDERS[area];
      if (builder && Array.isArray(data)) {
        for (const row of data) {
          const card = builder(row);
          if (card && collectedCards.length < 10) collectedCards.push(card);
        }
      }

      const summary = Array.isArray(data)
        ? data.map((r: any) => ({ id: r.id, title: r.headline || r.title || r.name || r.display_name || r.content?.slice(0, 60) }))
        : [];
      return JSON.stringify({ count: summary.length, results: summary });
    }

    // ── show_form ─────────────────────────────────────────────────────────
    if (name === "show_form") {
      const formType = args.formType as string;
      const spec = FORM_SPECS[formType];
      if (!spec) return JSON.stringify({ error: `Unknown form type: ${formType}` });

      const draft = (args.draftData || {}) as Record<string, any>;
      const formCard: SpqrCard = {
        type: "form",
        formType,
        title: spec.title,
        formFields: spec.fields.map((f) => ({
          ...f,
          draftValue: draft[f.key] ?? undefined,
        })),
        formSubmitLabel: spec.submitLabel,
        formIcon: spec.icon,
      };
      collectedCards.push(formCard);
      return JSON.stringify({ form_shown: true, formType, message: "Form displayed to user. Wait for submission." });
    }

    // ── upvote_launch ─────────────────────────────────────────────────────
    if (name === "upvote_launch") {
      if (!args.confirm) {
        collectedCards.push({
          type: "launch",
          id: args.launch_id,
          title: "⚡ Preview: Upvote Launch",
          subtitle: `You are about to upvote launch ${args.launch_id}. Reply "yes" or "confirm" to proceed.`,
          badges: ["Pending confirmation"],
        });
        return JSON.stringify({ preview: true, action: "upvote_launch", launch_id: args.launch_id });
      }
      const sb = scopedSupabase(ctx.userAccessToken);
      const { error } = await sb
        .from("launch_upvotes")
        .insert({ launch_id: args.launch_id, user_id: ctx.userId });
      if (error) return JSON.stringify({ error: "Could not upvote — you may have already upvoted this launch." });
      return JSON.stringify({ success: true, message: "Upvote recorded." });
    }

    // ── bookmark_launch ───────────────────────────────────────────────────
    if (name === "bookmark_launch") {
      if (!args.confirm) {
        collectedCards.push({
          type: "launch",
          id: args.launch_id,
          title: "🔖 Preview: Bookmark Launch",
          subtitle: `You are about to bookmark launch ${args.launch_id}. Reply "yes" to proceed.`,
          badges: ["Pending confirmation"],
        });
        return JSON.stringify({ preview: true, action: "bookmark_launch", launch_id: args.launch_id });
      }
      const sb = scopedSupabase(ctx.userAccessToken);
      const { error } = await sb
        .from("launch_bookmarks")
        .insert({ launch_id: args.launch_id, user_id: ctx.userId });
      if (error) return JSON.stringify({ error: "Could not bookmark — it may already be saved." });
      return JSON.stringify({ success: true, message: "Launch bookmarked." });
    }

    // ── comment_on_launch ─────────────────────────────────────────────────
    if (name === "comment_on_launch") {
      if (!args.confirm) {
        collectedCards.push({
          type: "launch",
          id: args.launch_id,
          title: "💬 Preview: Post Comment",
          subtitle: `Comment to post: "${args.body?.slice(0, 100)}". Reply "yes" to confirm.`,
          badges: ["Pending confirmation"],
        });
        return JSON.stringify({ preview: true, action: "comment_on_launch", body: args.body });
      }
      const sb = scopedSupabase(ctx.userAccessToken);
      const { error } = await sb
        .from("launch_comments")
        .insert({ launch_id: args.launch_id, user_id: ctx.userId, body: args.body });
      if (error) return JSON.stringify({ error: "Could not post the comment." });
      return JSON.stringify({ success: true, message: "Comment posted." });
    }

    // ── follow_user ───────────────────────────────────────────────────────
    if (name === "follow_user") {
      if (!args.confirm) {
        collectedCards.push({
          type: "user",
          id: args.user_id,
          title: "👤 Preview: Follow User",
          subtitle: `You are about to follow user ${args.user_id}. Reply "yes" to confirm.`,
          badges: ["Pending confirmation"],
        });
        return JSON.stringify({ preview: true, action: "follow_user", user_id: args.user_id });
      }
      const sb = scopedSupabase(ctx.userAccessToken);
      const { error } = await sb
        .from("follows")
        .insert({ follower_id: ctx.userId, following_id: args.user_id });
      if (error) return JSON.stringify({ error: "Could not follow — you may already be following them." });
      return JSON.stringify({ success: true, message: "Following user." });
    }

    // ── create_post ───────────────────────────────────────────────────────
    if (name === "create_post") {
      if (!args.confirm) {
        collectedCards.push({
          type: "post",
          id: "preview",
          title: "📝 Preview: New Post",
          subtitle: args.content?.slice(0, 160),
          badges: ["Pending confirmation"],
        });
        return JSON.stringify({ preview: true, action: "create_post", content: args.content });
      }
      const sb = scopedSupabase(ctx.userAccessToken);
      const { data, error } = await sb
        .from("posts")
        .insert({
          author_id: ctx.userId,
          content: args.content,
          image_url: args.image_url || null,
          source: "oracle",
        })
        .select("id, content")
        .maybeSingle();
      if (error) return JSON.stringify({ error: "Could not publish the post." });
      collectedCards.push({
        type: "post",
        id: data?.id,
        title: "Post published",
        subtitle: (data?.content || args.content).slice(0, 160),
        badges: ["Just posted"],
      });
      return JSON.stringify({ success: true, id: data?.id });
    }

    // ── create_bounty ─────────────────────────────────────────────────────
    if (name === "create_bounty") {
      if (!args.confirm) {
        const milestoneList = Array.isArray(args.milestones) && args.milestones.length > 0
          ? ` with ${args.milestones.length} milestone(s)`
          : "";
        collectedCards.push({
          type: "bounty",
          id: "preview",
          title: `🎯 Preview: "${args.title}"`,
          subtitle: `${args.description?.slice(0, 120)}${milestoneList}. Reward: ${args.amount}. Reply "yes" to create.`,
          badges: ["Open", args.urgency || "Medium", "Pending confirmation"],
          stats: [{ label: "Reward", value: args.amount }],
        });
        return JSON.stringify({ preview: true, action: "create_bounty", title: args.title, amount: args.amount });
      }
      const sb = scopedSupabase(ctx.userAccessToken);
      const { data: bounty, error } = await sb
        .from("bounties")
        .insert({
          creator_id: ctx.userId,
          title: args.title,
          description: args.description,
          bounty_amount: args.amount,
          urgency: args.urgency || "Medium",
          tags: args.tags || [],
          status: "Open",
        })
        .select("id, title")
        .maybeSingle();
      if (error) return JSON.stringify({ error: "Could not create the bounty." });

      const bountyId = bounty?.id;
      if (bountyId && Array.isArray(args.milestones) && args.milestones.length > 0) {
        const milestoneRows = args.milestones.map((m: any, idx: number) => ({
          bounty_id: bountyId,
          title: m.title,
          description: m.description || null,
          sort_order: idx,
        }));
        await sb.from("bounty_milestones").insert(milestoneRows);
      }

      collectedCards.push({
        type: "bounty",
        id: bountyId,
        title: args.title,
        subtitle: args.description?.slice(0, 120),
        badges: ["Open", args.urgency || "Medium"],
        stats: [{ label: "Reward", value: args.amount }],
      });
      return JSON.stringify({ success: true, id: bountyId, milestones: args.milestones?.length || 0 });
    }

    // ── launch_product ────────────────────────────────────────────────────
    if (name === "launch_product") {
      if (!args.confirm) {
        collectedCards.push({
          type: "launch",
          id: "preview",
          title: `🚀 Preview: "${args.headline}"`,
          subtitle: args.tagline,
          badges: [args.category, args.pricing_model, "Pending confirmation"].filter(Boolean),
          techStack: args.tech_stack || [],
          price: args.price_display || (args.pricing_model === "free" ? "Free" : undefined),
          url: args.website_url,
          stats: [{ label: "Upvotes", value: 0 }],
        });
        return JSON.stringify({ preview: true, action: "launch_product", headline: args.headline });
      }
      const sb = scopedSupabase(ctx.userAccessToken);
      const { data: launch, error } = await sb
        .from("product_launches")
        .insert({
          launcher_id: ctx.userId,
          headline: args.headline,
          tagline: args.tagline,
          description: args.description || null,
          website_url: args.website_url || null,
          github_url: args.github_url || null,
          category: args.category || null,
          tech_stack: args.tech_stack || [],
          pricing_model: args.pricing_model || "free",
          price_display: args.price_display || null,
          launch_date: new Date().toISOString().split("T")[0],
        })
        .select("id, headline, tagline")
        .maybeSingle();
      if (error) return JSON.stringify({ error: "Could not publish the product launch." });

      collectedCards.push({
        type: "launch",
        id: launch?.id,
        title: args.headline,
        subtitle: args.tagline,
        badges: [args.category, args.pricing_model].filter(Boolean),
        techStack: args.tech_stack || [],
        stats: [{ label: "Upvotes", value: 0 }],
        price: args.price_display || (args.pricing_model === "free" ? "Free" : undefined),
        url: args.website_url,
      });
      return JSON.stringify({ success: true, id: launch?.id });
    }

    // ── create_dev_stack ──────────────────────────────────────────────────
    if (name === "create_dev_stack") {
      if (!args.confirm) {
        const allTools = Object.values(args.tools || {}).flat().slice(0, 8) as string[];
        collectedCards.push({
          type: "stack",
          id: "preview",
          title: `🛠️ Preview: "${args.name}"`,
          subtitle: args.description?.slice(0, 120) || `Tech: ${allTools.join(", ")}`,
          badges: ["Pending confirmation"],
          techStack: allTools,
          stats: [{ label: "Upvotes", value: 0 }],
        });
        return JSON.stringify({ preview: true, action: "create_dev_stack", name: args.name });
      }
      const sb = scopedSupabase(ctx.userAccessToken);
      const { data: stack, error } = await sb
        .from("dev_stacks")
        .insert({
          user_id: ctx.userId,
          name: args.name,
          description: args.description || null,
          tools: args.tools || {},
        })
        .select("id, name")
        .maybeSingle();
      if (error) return JSON.stringify({ error: "Could not share the dev stack." });

      collectedCards.push({
        type: "stack",
        id: stack?.id,
        title: args.name,
        subtitle: args.description?.slice(0, 120),
        techStack: Object.values(args.tools || {}).flat().slice(0, 8) as string[],
        stats: [{ label: "Upvotes", value: 0 }],
      });
      return JSON.stringify({ success: true, id: stack?.id });
    }

    // ── create_group ──────────────────────────────────────────────────────
    if (name === "create_group") {
      if (!args.confirm) {
        collectedCards.push({
          type: "group",
          id: "preview",
          title: `${args.is_channel ? "📢" : "👥"} Preview: "${args.name}"`,
          subtitle: args.description?.slice(0, 120) || `A new ${args.is_channel ? "channel" : "group"}. Reply "yes" to create.`,
          badges: [args.is_channel ? "Channel" : "Group", "Pending confirmation"],
          stats: [{ label: "Members", value: 1 }],
        });
        return JSON.stringify({ preview: true, action: "create_group", name: args.name });
      }
      const sb = scopedSupabase(ctx.userAccessToken);
      const { data: group, error } = await sb
        .from("groups")
        .insert({
          owner_id: ctx.userId,
          name: args.name,
          description: args.description || null,
          is_channel: !!args.is_channel,
          category: args.category || null,
          is_public: true,
          avatar_url: `https://picsum.photos/seed/${encodeURIComponent(args.name)}/200/200`,
        })
        .select("id, name, is_channel")
        .maybeSingle();
      if (error) return JSON.stringify({ error: "Could not create the group." });

      if (group?.id) {
        await sb.from("group_members").insert({ group_id: group.id, user_id: ctx.userId, role: "owner" });
      }

      collectedCards.push({
        type: "group",
        id: group?.id,
        title: args.name,
        subtitle: args.description?.slice(0, 120),
        badges: [args.is_channel ? "Channel" : "Group"],
        stats: [{ label: "Members", value: 1 }],
      });
      return JSON.stringify({ success: true, id: group?.id, kind: args.is_channel ? "channel" : "group" });
    }

    // ── remember ──────────────────────────────────────────────────────────
    if (name === "remember") {
      const key = String(args.key);
      const value = String(args.value);
      await db
        .insert(spqrMemoriesTable)
        .values({ userId: ctx.userId, key, value })
        .onConflictDoUpdate({
          target: [spqrMemoriesTable.userId, spqrMemoriesTable.key],
          set: { value, updatedAt: new Date() },
        });
      return JSON.stringify({ remembered: true });
    }

    // ── recall ────────────────────────────────────────────────────────────
    if (name === "recall") {
      const rows = args.key
        ? await db.select().from(spqrMemoriesTable).where(and(eq(spqrMemoriesTable.userId, ctx.userId), eq(spqrMemoriesTable.key, String(args.key))))
        : await db.select().from(spqrMemoriesTable).where(eq(spqrMemoriesTable.userId, ctx.userId));
      return JSON.stringify({ memories: rows.map((r) => ({ key: r.key, value: r.value })) });
    }

    return JSON.stringify({ error: `Unknown action.` });
  } catch (err: any) {
    logger.error({ err, tool: name }, "spqr tool execution failed");
    return JSON.stringify({ error: "Something went wrong. Please try again." });
  }
}

// ── Agent event types ─────────────────────────────────────────────────────────
export interface AgentEvent {
  type: "thinking" | "tool_start" | "tool_done" | "composing" | "done" | "error";
  label?: string;
  toolName?: string;
  toolIcon?: string;
  step?: number;
  totalSteps?: number;
  reply?: string;
  cards?: SpqrCard[];
  error?: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

// ── Main agent loop ───────────────────────────────────────────────────────────
export async function runSpqrAgent(
  history: ChatMessage[],
  ctx: { userId: string; userAccessToken: string },
  onEvent?: (event: AgentEvent) => void,
): Promise<{ reply: string; cards: SpqrCard[] }> {
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
  const cards: SpqrCard[] = [];
  let toolStep = 0;

  onEvent?.({ type: "thinking", label: "The Oracle is deliberating…" });

  for (let round = 0; round < 8; round++) {
    const resp = await fetch(POLLINATIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, private: true }),
    });

    if (!resp.ok) {
      logger.error({ status: resp.status }, "spqr upstream error");
      throw new Error("The Oracle is unreachable right now. Try again shortly.");
    }

    const data = (await resp.json()) as any;
    const choice = data?.choices?.[0];
    const msg = choice?.message;
    if (!msg) throw new Error("The Oracle returned no answer.");

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
      toolStep += msg.tool_calls.length;

      for (const call of msg.tool_calls) {
        const toolMeta = TOOL_LABELS[call.function.name] || { label: "Working…", icon: "Zap" };
        onEvent?.({
          type: "tool_start",
          toolName: call.function.name,
          toolIcon: toolMeta.icon,
          label: toolMeta.label,
          step: toolStep,
        });

        let args: Record<string, any> = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* ignore */ }

        const result = await runTool(call.function.name, args, ctx, cards);

        onEvent?.({ type: "tool_done", toolName: call.function.name, step: toolStep });
        messages.push({ role: "tool", content: result, tool_call_id: call.id, name: call.function.name });
      }
      continue;
    }

    onEvent?.({ type: "composing", label: "Composing the response…" });
    const reply = sanitizeLLMOutput(msg.content || "The Oracle is silent.");
    return { reply, cards };
  }

  return { reply: "The Oracle deliberated too long — try rephrasing your request.", cards };
}
