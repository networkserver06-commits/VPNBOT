import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { createAsset, createService, getDashboardCounts, listAssets, listServices, setAssetPublished, setServicePublished } from "./db";

const assetInput = z.object({
  title: z.string().min(1).max(160),
  category: z.string().min(1).max(80).default("General"),
  description: z.string().max(1000).optional(),
  kind: z.enum(["file", "config"]),
  fileName: z.string().max(255).optional(),
  mimeType: z.string().max(120).optional(),
  storageKey: z.string().max(500).optional(),
  contentText: z.string().max(20000).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }),
  }),
  catalog: router({ assets: publicProcedure.query(() => listAssets()), services: publicProcedure.query(() => listServices()) }),
  admin: router({
    overview: adminProcedure.query(() => getDashboardCounts()),
    assets: adminProcedure.query(() => listAssets(true)),
    services: adminProcedure.query(() => listServices(true)),
    createConfig: adminProcedure.input(assetInput).mutation(({ input }) => { if (input.kind !== "config" || !input.contentText) throw new TRPCError({ code: "BAD_REQUEST", message: "A config must include text content." }); return createAsset({ ...input, kind: "config", published: 1 }); }),
    createFile: adminProcedure.input(assetInput).mutation(({ input }) => { if (input.kind !== "file" || !input.storageKey) throw new TRPCError({ code: "BAD_REQUEST", message: "A file must include a storage key." }); return createAsset({ ...input, kind: "file", published: 1 }); }),
    createService: adminProcedure.input(z.object({ title: z.string().min(1).max(160), category: z.string().min(1).max(80), description: z.string().min(1).max(2000), url: z.string().url().max(500).optional().or(z.literal("")) })).mutation(({ input }) => createService({ ...input, url: input.url || null, published: 1 })),
    setAssetPublished: adminProcedure.input(z.object({ id: z.number().int().positive(), published: z.boolean() })).mutation(({ input }) => setAssetPublished(input.id, input.published)),
    setServicePublished: adminProcedure.input(z.object({ id: z.number().int().positive(), published: z.boolean() })).mutation(({ input }) => setServicePublished(input.id, input.published)),
  }),
});

export type AppRouter = typeof appRouter;
