import { validate } from "../api/validator";
import { describe } from "../api/describe";
import { voteService } from "../services/vote.service";
import {
  castFairPlayVoteSchema,
  castMvpVoteSchema,
  matchVotesSchema,
  mutationResultSchema,
  recordVotePromptSchema,
  votePromptSchema,
} from "@skol-arena/shared/types/index";
import { requireAuth } from "../middleware/auth";
import { createAppHono } from "../types/hono";

/**
 * Fair-play and MVP votes. Mounted at the version root: its paths are
 * /matches/:id/votes…, /matches/:id/fair-play…, /matches/:id/mvp… and /me/vote-prompt.
 */
const votes = createAppHono();

const TAGS = ["Votes"];

const VOTES_RESPONSE = {
  description: "The user's votes on the match and the public aggregates",
  schema: matchVotesSchema,
};

const WRITE = { tags: TAGS, auth: true, role: true, notFound: true, conflict: true, success: VOTES_RESPONSE };

votes.get(
  "/matches/:id/votes",
  requireAuth,
  describe({ tags: TAGS, summary: "My votes on a match", auth: true, notFound: true, success: VOTES_RESPONSE }),
  async (c) => c.json(await voteService.getMatchVotes(c.req.param("id")!, c.get("appUserId"))),
);

votes.put(
  "/matches/:id/fair-play",
  requireAuth,
  describe({ ...WRITE, summary: "Give a 👍 to every opponent" }),
  async (c) => c.json(await voteService.castFairPlayTeamUp(c.req.param("id")!, c.get("appUserId"))),
);

votes.put(
  "/matches/:id/fair-play/:targetId",
  requireAuth,
  describe({ ...WRITE, summary: "Cast or change a fair-play vote" }),
  validate("json", castFairPlayVoteSchema),
  async (c) => {
    const { id, targetId } = c.req.param();
    return c.json(await voteService.castFairPlay(id, c.get("appUserId"), targetId, c.req.valid("json")));
  },
);

votes.delete(
  "/matches/:id/fair-play/:targetId",
  requireAuth,
  describe({ ...WRITE, summary: "Withdraw a fair-play vote" }),
  async (c) => {
    const { id, targetId } = c.req.param();
    return c.json(await voteService.removeFairPlay(id, c.get("appUserId"), targetId));
  },
);

votes.put(
  "/matches/:id/spectators/me",
  requireAuth,
  describe({ ...WRITE, summary: "Declare I watched this match" }),
  async (c) => c.json(await voteService.declareSpectator(c.req.param("id")!, c.get("appUserId"))),
);

votes.delete(
  "/matches/:id/spectators/me",
  requireAuth,
  describe({ ...WRITE, summary: "Withdraw my spectator declaration (and my MVP vote)" }),
  async (c) => c.json(await voteService.withdrawSpectator(c.req.param("id")!, c.get("appUserId"))),
);

votes.put(
  "/matches/:id/mvp",
  requireAuth,
  describe({ ...WRITE, summary: "Vote for, or change, the MVP of a match" }),
  validate("json", castMvpVoteSchema),
  async (c) => {
    const { targetId } = c.req.valid("json");
    return c.json(await voteService.castMvp(c.req.param("id")!, c.get("appUserId"), targetId));
  },
);

votes.delete(
  "/matches/:id/mvp",
  requireAuth,
  describe({ ...WRITE, summary: "Withdraw my MVP vote" }),
  async (c) => c.json(await voteService.removeMvp(c.req.param("id")!, c.get("appUserId"))),
);

const PROMPT_RESPONSE = {
  description: "The vote prompt to show, or null",
  schema: votePromptSchema.nullable(),
};

votes.get(
  "/matches/:id/vote-prompt",
  requireAuth,
  describe({ tags: TAGS, summary: "Vote prompt after entering a match", auth: true, notFound: true, success: PROMPT_RESPONSE }),
  async (c) => c.json(await voteService.getPromptForMatch(c.req.param("id")!, c.get("appUserId"))),
);

votes.post(
  "/matches/:id/vote-prompt",
  requireAuth,
  describe({
    tags: TAGS,
    summary: "Record how a vote prompt ended",
    auth: true,
    role: true,
    notFound: true,
    success: { description: "Recorded", schema: mutationResultSchema },
  }),
  validate("json", recordVotePromptSchema),
  async (c) => {
    const { outcome } = c.req.valid("json");
    await voteService.recordPrompt(c.req.param("id")!, c.get("appUserId"), outcome);
    return c.json({ success: true });
  },
);

votes.get(
  "/me/vote-prompt",
  requireAuth,
  describe({ tags: TAGS, summary: "Vote prompt to show on opening the app", auth: true, success: PROMPT_RESPONSE }),
  async (c) => c.json(await voteService.getPendingPrompt(c.get("appUserId"))),
);

export default votes;
