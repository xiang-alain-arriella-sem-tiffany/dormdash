import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  Store,
  MapPin,
  Clock,
  ShoppingBag,
  PackageCheck,
  CheckCircle,
  Navigation,
  Zap,
} from "lucide-react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Typography, Spacing, BorderRadius } from "../assets/styles";
import { alert } from "../lib/utils/platform";
import { supabase } from "../lib/supabase";
import { SurfaceCard, StatusPill } from "../components";
import { buildOpenInMapsUrl } from "../lib/mapsLinking";
import type { NativeMapPlatform } from "../lib/mapsLinking";
import {
  claimBounty,
  setBountyStatus,
  fetchDasherActiveBounties,
} from "../lib/api/bounties";
import type { Bounty, BountyStatus } from "../lib/api/bounties";

type BountyFulfillNavigation = NativeStackNavigationProp<any>;

type RouteParams = {
  bountyId: number;
};

const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const openInMaps = (address: string) => {
  const platform: NativeMapPlatform =
    Platform.OS === "ios"
      ? "ios"
      : Platform.OS === "android"
        ? "android"
        : "web";
  const url = buildOpenInMapsUrl({ platform, address });
  if (url) void Linking.openURL(url);
};

const BountyFulfill: React.FC = () => {
  const navigation = useNavigation<BountyFulfillNavigation>();
  const route = useRoute();
  const bountyId = Number((route.params as RouteParams)?.bountyId);

  const [bounty, setBountyState] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBounty = useCallback(async () => {
    const { data, error } = await supabase
      .from("bounties")
      .select("*")
      .eq("id", bountyId)
      .single();

    if (!error && data) {
      setBountyState(data as Bounty);
    }
    setLoading(false);
  }, [bountyId]);

  useEffect(() => {
    void fetchBounty();
  }, [fetchBounty]);

  const handleClaim = async () => {
    setActionLoading(true);
    try {
      const updated = await claimBounty(bountyId);
      setBountyState(updated);
      alert(
        "Bounty Claimed!",
        "Head to the store to buy the item, then deliver it to the buyer.",
      );
    } catch (err: any) {
      console.error("Error claiming bounty:", err);
      alert(
        "Error",
        err?.message || "Failed to claim bounty. It may have been taken.",
      );
      void fetchBounty();
    } finally {
      setActionLoading(false);
    }
  };

  const handlePickedUp = async () => {
    setActionLoading(true);
    try {
      await setBountyStatus(bountyId, "picked_up");
      void fetchBounty();
      alert("Item Picked Up", "Now deliver it to the buyer's address.");
    } catch (err: any) {
      console.error("Error updating bounty status:", err);
      alert("Error", err?.message || "Failed to update status.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelivered = async () => {
    alert(
      "Confirm Delivery",
      "Have you delivered the item to the buyer's address?",
      [
        { text: "Not yet", style: "cancel" },
        {
          text: "Yes, Delivered",
          onPress: async () => {
            setActionLoading(true);
            try {
              await setBountyStatus(bountyId, "delivered");
              void fetchBounty();
              alert(
                "Delivery Complete!",
                `You earned up to ${bounty ? formatPrice(bounty.bounty_amount_cents) : ""}! The buyer will confirm receipt.`,
              );
            } catch (err: any) {
              console.error("Error marking delivered:", err);
              alert("Error", err?.message || "Failed to mark as delivered.");
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <ActivityIndicator
          size="large"
          color={Colors.primary_blue}
          style={{ flex: 1 }}
        />
      </SafeAreaView>
    );
  }

  if (!bounty) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <ChevronLeft color={Colors.darkTeal} size={28} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Bounty</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Bounty not found or unavailable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isPotentialProfit = bounty.bounty_amount_cents > 0;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <ChevronLeft color={Colors.darkTeal} size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bounty</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Earnings header */}
        <SurfaceCard variant="mint" style={styles.earningsCard}>
          <View style={styles.earningsRow}>
            <View>
              <Text style={styles.earningsLabel}>Bounty Amount</Text>
              <Text style={styles.earningsAmount}>
                {formatPrice(bounty.bounty_amount_cents)}
              </Text>
              <Text style={styles.earningsHint}>
                You keep what's left after buying the item
              </Text>
            </View>
            <StatusPill
              label={bounty.status.replace(/_/g, " ")}
              tone={
                bounty.status === "open"
                  ? "info"
                  : bounty.status === "claimed" || bounty.status === "picked_up"
                    ? "warning"
                    : "success"
              }
            />
          </View>
        </SurfaceCard>

        {/* Item to Buy */}
        <SurfaceCard variant="default" style={styles.card}>
          <View style={styles.cardHeader}>
            <ShoppingBag color={Colors.primary_blue} size={20} />
            <Text style={styles.cardTitle}>What to buy</Text>
          </View>
          <Text style={styles.itemDescription}>{bounty.item_description}</Text>
        </SurfaceCard>

        {/* Store */}
        <SurfaceCard variant="default" style={styles.card}>
          <View style={styles.cardHeader}>
            <Store color={Colors.primary_blue} size={20} />
            <Text style={styles.cardTitle}>Store</Text>
          </View>
          <Text style={styles.storeNameText}>{bounty.store_name}</Text>
          <TouchableOpacity
            style={styles.mapsLink}
            onPress={() => openInMaps(bounty.store_location)}
          >
            <Navigation color={Colors.primary_blue} size={16} />
            <Text style={styles.mapsLinkText}>{bounty.store_location}</Text>
          </TouchableOpacity>
        </SurfaceCard>

        {/* Deliver to */}
        <SurfaceCard variant="default" style={styles.card}>
          <View style={styles.cardHeader}>
            <MapPin color={Colors.primary_green} size={20} />
            <Text style={styles.cardTitle}>Deliver to</Text>
          </View>
          <TouchableOpacity
            style={styles.mapsLink}
            onPress={() => openInMaps(bounty.delivery_address)}
          >
            <Navigation color={Colors.primary_green} size={16} />
            <Text style={styles.mapsLinkText}>{bounty.delivery_address}</Text>
          </TouchableOpacity>
        </SurfaceCard>

        {/* Deadline */}
        <SurfaceCard variant="default" style={styles.card}>
          <View style={styles.cardHeader}>
            <Clock color={Colors.mutedGray} size={20} />
            <Text style={styles.cardTitle}>Deadline</Text>
          </View>
          <Text style={styles.deadlineText}>
            {formatDateTime(bounty.deadline)}
          </Text>
        </SurfaceCard>

        {/* Action Buttons */}
        <View style={styles.actionsBlock}>
          {bounty.status === "open" && (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                actionLoading && styles.buttonDisabled,
              ]}
              onPress={() => void handleClaim()}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <Zap color={Colors.white} size={20} />
                  <Text style={styles.primaryButtonText}>Claim Bounty</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {bounty.status === "claimed" && (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                actionLoading && styles.buttonDisabled,
              ]}
              onPress={() => void handlePickedUp()}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <PackageCheck color={Colors.white} size={20} />
                  <Text style={styles.primaryButtonText}>Confirm Pickup</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {bounty.status === "picked_up" && (
            <TouchableOpacity
              style={[
                styles.deliveredButton,
                actionLoading && styles.buttonDisabled,
              ]}
              onPress={() => void handleDelivered()}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <CheckCircle color={Colors.white} size={20} />
                  <Text style={styles.primaryButtonText}>
                    Mark as Delivered
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {bounty.status === "delivered" && (
            <View style={styles.waitingBox}>
              <CheckCircle color={Colors.primary_green} size={24} />
              <Text style={styles.waitingText}>
                Delivered! Waiting for buyer to confirm receipt.
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.base_bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.lightGray,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  earningsCard: {
    marginBottom: Spacing.md,
  },
  earningsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  earningsLabel: {
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  earningsAmount: {
    fontSize: 28,
    fontFamily: Typography.heading3.fontFamily,
    fontWeight: "700",
    color: Colors.primary_green,
    marginTop: 2,
  },
  earningsHint: {
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    fontStyle: "italic",
    marginTop: 4,
  },
  card: {
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  itemDescription: {
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.darkTeal,
    lineHeight: 22,
  },
  storeNameText: {
    fontSize: 17,
    fontFamily: Typography.bodyLarge.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
    marginBottom: Spacing.xs,
  },
  mapsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  mapsLinkText: {
    fontSize: 15,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.primary_blue,
    textDecorationLine: "underline",
    flex: 1,
  },
  deadlineText: {
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
  },
  actionsBlock: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary_blue,
    borderRadius: BorderRadius.large,
    paddingVertical: Spacing.lg,
  },
  deliveredButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary_green,
    borderRadius: BorderRadius.large,
    paddingVertical: Spacing.lg,
  },
  primaryButtonText: {
    fontSize: 17,
    fontFamily: Typography.bodyLarge.fontFamily,
    fontWeight: "700",
    color: Colors.white,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  waitingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.lightMint,
    borderRadius: BorderRadius.medium,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary_green,
  },
  waitingText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.darkTeal,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
    textAlign: "center",
  },
});

export default BountyFulfill;
