import { mkdir } from "node:fs/promises";
import path from "node:path";

import { env } from "./env.js";

export const uploadsRootDir = path.resolve(process.cwd(), "uploads");
export const avatarUploadsDir = path.join(uploadsRootDir, "avatars");
export const evidenceUploadsDir = path.join(uploadsRootDir, "evidences");
export const logoUploadsDir = path.join(uploadsRootDir, "logos");

export const ensureUploadDirectories = async (): Promise<void> => {
  await mkdir(avatarUploadsDir, {
    recursive: true,
  });
  await mkdir(evidenceUploadsDir, {
    recursive: true,
  });
  await mkdir(logoUploadsDir, {
    recursive: true,
  });
};

export const buildAvatarUrl = (fileName: string): string => {
  return `${env.BETTER_AUTH_URL}/uploads/avatars/${fileName}`;
};

export const buildLogoUrl = (fileName: string): string => {
  return `${env.BETTER_AUTH_URL}/uploads/logos/${fileName}`;
};
