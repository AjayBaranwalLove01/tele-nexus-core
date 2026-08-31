import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const STATUSES_KEY = ["lead_statuses"];
export const TEMPS_KEY = ["lead_temperatures"];

export function useStatuses() {
  return useQuery({
    queryKey: STATUSES_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_statuses").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTemperatures() {
  return useQuery({
    queryKey: TEMPS_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_temperatures").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["crm_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("crm_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
  });
}
