import { apiRequest } from "@/lib/api-client";

import { directoryListingSchema, type DirectoryListing } from "../schemas";

export async function fetchDirectoryListing(path?: string): Promise<DirectoryListing> {
  const query = path ? `?path=${encodeURIComponent(path)}` : "";

  return directoryListingSchema.parse(await apiRequest(`/api/filesystem/directories${query}`));
}
