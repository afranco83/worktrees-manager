import { useQuery } from "@tanstack/react-query";

import { fetchDirectoryListing } from "./filesystem-api";

export function useDirectoryListing({ path, enabled }: { path?: string; enabled: boolean }) {
  return useQuery({
    queryKey: ["directory-listing", path ?? null],
    queryFn: () => fetchDirectoryListing(path),
    enabled,
  });
}
