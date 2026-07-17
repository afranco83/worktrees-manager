import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updateSettings } from "./settings-api";
import { SETTINGS_QUERY_KEY } from "./use-settings";

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
    },
  });
}
