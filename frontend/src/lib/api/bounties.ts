import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../supabase";

// ============ Types ============

export type BountyStatus =
  | "open"
  | "claimed"
  | "picked_up"
  | "delivered"
  | "confirmed"
  | "disputed"
  | "cancelled";

export interface Bounty {
  id: number;
  buyer_id: string;
  item_description: string;
  store_name: string;
  store_location: string;
  bounty_amount_cents: number;
  deadline: string;
  delivery_address: string;
  delivery_lat: number | null;
  delivery_lng: number | null;
  status: BountyStatus;
  paid_at: string | null;
  dasher_id: string | null;
  claimed_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  buyer_confirmed: boolean | null;
  buyer_confirmed_at: string | null;
  buyer_flag_reason: string | null;
  created_at: string;
}

export interface PlaceBountyInput {
  item_description: string;
  store_name: string;
  store_location: string;
  bounty_amount_cents: number;
  deadline: string; // ISO string
  delivery_address: string;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
}

// ============ Query Keys ============

export const bountyQueryKeys = {
  buyerBounties: ["bounties", "buyer"] as const,
  openBounties: ["bounties", "open"] as const,
  dasherActiveBounties: ["bounties", "dasher-active"] as const,
  detail: (id: number) => ["bounties", "detail", id] as const,
};

// ============ API Functions ============

export const placeBounty = async (input: PlaceBountyInput): Promise<number> => {
  const { data, error } = await supabase.rpc("place_bounty", {
    p_item_description: input.item_description,
    p_store_name: input.store_name,
    p_store_location: input.store_location,
    p_bounty_amount_cents: input.bounty_amount_cents,
    p_deadline: input.deadline,
    p_delivery_address: input.delivery_address,
    p_delivery_lat: input.delivery_lat ?? null,
    p_delivery_lng: input.delivery_lng ?? null,
  });

  if (error) throw error;
  return data as number;
};

export const finalizePaidBounty = async (
  bountyId: number,
): Promise<{ bounty_id: number; status: string; finalized_now: boolean }> => {
  const { data, error } = await supabase.rpc("finalize_paid_bounty", {
    p_bounty_id: bountyId,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row;
};

export const fetchBuyerBounties = async (): Promise<Bounty[]> => {
  const { data, error } = await supabase.rpc("get_buyer_bounties");
  if (error) throw error;
  return (data as Bounty[]) ?? [];
};

export const fetchOpenBounties = async (): Promise<Bounty[]> => {
  const { data, error } = await supabase.rpc("get_open_bounties");
  if (error) throw error;
  return (data as Bounty[]) ?? [];
};

export const fetchDasherActiveBounties = async (): Promise<Bounty[]> => {
  const { data, error } = await supabase.rpc("get_dasher_active_bounties");
  if (error) throw error;
  return (data as Bounty[]) ?? [];
};

export const claimBounty = async (bountyId: number): Promise<Bounty> => {
  const { data, error } = await supabase.rpc("claim_bounty", {
    p_bounty_id: bountyId,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as Bounty;
};

export const setBountyStatus = async (
  bountyId: number,
  status: "picked_up" | "delivered",
): Promise<void> => {
  const { error } = await supabase.rpc("set_bounty_status", {
    p_bounty_id: bountyId,
    p_status: status,
  });

  if (error) throw error;
};

export const confirmBountyReceipt = async (bountyId: number): Promise<void> => {
  const { error } = await supabase.rpc("confirm_bounty_receipt", {
    p_bounty_id: bountyId,
  });

  if (error) throw error;
};

export const flagBountyIssue = async (
  bountyId: number,
  reason: string,
): Promise<void> => {
  const { error } = await supabase.rpc("flag_bounty_issue", {
    p_bounty_id: bountyId,
    p_reason: reason,
  });

  if (error) throw error;
};

export const cancelBounty = async (bountyId: number): Promise<void> => {
  const { error } = await supabase.rpc("cancel_bounty", {
    p_bounty_id: bountyId,
  });

  if (error) throw error;
};

// ============ React Query Hooks ============

export const useBuyerBounties = () => {
  return useQuery({
    queryKey: bountyQueryKeys.buyerBounties,
    queryFn: fetchBuyerBounties,
  });
};

export const useOpenBounties = () => {
  return useQuery({
    queryKey: bountyQueryKeys.openBounties,
    queryFn: fetchOpenBounties,
  });
};

export const useClaimBounty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bountyId: number) => claimBounty(bountyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bountyQueryKeys.openBounties });
      queryClient.invalidateQueries({
        queryKey: bountyQueryKeys.dasherActiveBounties,
      });
    },
  });
};

export const useSetBountyStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bountyId,
      status,
    }: {
      bountyId: number;
      status: "picked_up" | "delivered";
    }) => setBountyStatus(bountyId, status),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: bountyQueryKeys.detail(variables.bountyId),
      });
      queryClient.invalidateQueries({
        queryKey: bountyQueryKeys.dasherActiveBounties,
      });
    },
  });
};

export const useConfirmBountyReceipt = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bountyId: number) => confirmBountyReceipt(bountyId),
    onSuccess: (_data, bountyId) => {
      queryClient.invalidateQueries({
        queryKey: bountyQueryKeys.detail(bountyId),
      });
      queryClient.invalidateQueries({
        queryKey: bountyQueryKeys.buyerBounties,
      });
    },
  });
};

export const useFlagBountyIssue = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bountyId, reason }: { bountyId: number; reason: string }) =>
      flagBountyIssue(bountyId, reason),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: bountyQueryKeys.detail(variables.bountyId),
      });
      queryClient.invalidateQueries({
        queryKey: bountyQueryKeys.buyerBounties,
      });
    },
  });
};

export const useCancelBounty = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bountyId: number) => cancelBounty(bountyId),
    onSuccess: (_data, bountyId) => {
      queryClient.invalidateQueries({
        queryKey: bountyQueryKeys.detail(bountyId),
      });
      queryClient.invalidateQueries({
        queryKey: bountyQueryKeys.buyerBounties,
      });
    },
  });
};
