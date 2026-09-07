import express, { type Express, type Request, type Response } from "express";
import { createContext } from "./_core/context";
import { storagePut } from "./storage";

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180) || "upload.bin";
}

export function registerAdminUpload(app: Express) {
  app.post(
    "/api/admin/upload",
    express.raw({ type: "*/*", limit: "50mb" }),
    async (req: Request, res: Response) => {
      try {
        const context = await createContext({ req, res } as never);
        if (!context.user || context.user.role !== "admin") {
          res.status(403).json({ ok: false, message: "Admin access required" });
          return;
        }
        const body = req.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          res.status(400).json({ ok: false, message: "Choose a file to upload" });
          return;
        }
        const fileName = safeFileName(String(req.header("x-file-name") || "upload.bin"));
        const contentType = req.header("content-type") || "application/octet-stream";
        const stored = await storagePut(`dashboard-assets/${fileName}`, body, contentType);
        res.json({ ok: true, ...stored, sizeBytes: body.length, fileName, mimeType: contentType });
      } catch (error) {
        console.error("[AdminUpload] failed:", error);
        res.status(500).json({ ok: false, message: "Upload failed" });
      }
    },
  );
}
