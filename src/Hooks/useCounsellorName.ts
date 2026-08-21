import { fetchPracticeSettings } from "@store/slices/practiceSettingsSlice";

import { useAppSelector, useFetchOnIdle } from "@/store/hooks";

export function useCounsellorName() {
  useFetchOnIdle((state) => state.practiceSettings.status, fetchPracticeSettings, "Failed to load practice settings");
  return useAppSelector((state) => state.practiceSettings.data?.counsellor_name) || "your therapist";
}
