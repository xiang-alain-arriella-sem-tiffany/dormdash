import { useQuery } from "@tanstack/react-query";
import { supabase } from "../supabase";

const SAVED_LISTING_SELECT =
  "id, title, description, price_cents, created_at, available_quantity, condition, status, listing_images(url, sort_order), categories(name)";

export const savedListingQueryKeys = {
  ids: ["savedListings", "ids"] as const,
  list: ["savedListings", "list"] as const,
};

const getCurrentUserId = async () => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
};

export const fetchSavedListingIds = async (): Promise<number[]> => {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("saved_listings")
    .select("listing_id")
    .eq("user_id", userId);

  if (error) throw error;
  return (data || [])
    .map((row: any) => Number(row.listing_id))
    .filter((value) => Number.isFinite(value));
};

export const fetchSavedListings = async () => {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("saved_listings")
    .select(
      `
      created_at,
      listings!inner(${SAVED_LISTING_SELECT})
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || [])
    .map((row: any) => {
      const listing = Array.isArray(row.listings)
        ? row.listings[0]
        : row.listings;
      return listing || null;
    })
    .filter(Boolean);
};

export const toggleSavedListing = async (listingId: number) => {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error("You must be logged in to save items.");
  }

  const { data: existing, error: lookupError } = await supabase
    .from("saved_listings")
    .select("id")
    .eq("user_id", userId)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await supabase
      .from("saved_listings")
      .delete()
      .eq("id", existing.id);
    if (error) throw error;
    return { saved: false };
  }

  const { error } = await supabase.from("saved_listings").insert({
    user_id: userId,
    listing_id: listingId,
  });
  if (error) throw error;
  return { saved: true };
};

export const useSavedListingIds = () => {
  return useQuery({
    queryKey: savedListingQueryKeys.ids,
    queryFn: fetchSavedListingIds,
  });
};

export const useSavedListings = () => {
  return useQuery({
    queryKey: savedListingQueryKeys.list,
    queryFn: fetchSavedListings,
  });
};
