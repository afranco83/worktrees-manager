import { z } from "zod";

export const directoryEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
});

export const directoryListingSchema = z.object({
  path: z.string(),
  parentPath: z.string().nullable(),
  directories: z.array(directoryEntrySchema),
});

export type DirectoryListing = z.infer<typeof directoryListingSchema>;
