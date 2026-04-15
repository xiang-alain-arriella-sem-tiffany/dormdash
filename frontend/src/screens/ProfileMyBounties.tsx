import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, Zap, Plus } from "lucide-react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Typography, Spacing, BorderRadius } from "../assets/styles";
import { StatusPill } from "../components";
import { useBuyerBounties } from "../lib/api/bounties";
import type { Bounty, BountyStatus } from "../lib/api/bounties";
import { useQueryClient } from "@tanstack/react-query";
import { bountyQueryKeys } from "../lib/api/bounties";

type MyBountiesNavigation = NativeStackNavigationProp<{
  BountyDetail: { bountyId: number };
  PlaceBounty: undefined;
}>;

const statusTone: Record<
  BountyStatus,
  "info" | "success" | "warning" | "neutral"
> = {
  open: "info",
  claimed: "warning",
  picked_up: "warning",
  delivered: "success",
  confirmed: "success",
  disputed: "warning",
  cancelled: "neutral",
};

const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const ProfileMyBounties: React.FC = () => {
  const navigation = useNavigation<MyBountiesNavigation>();
  const queryClient = useQueryClient();
  const { data: bounties = [], isLoading, refetch } = useBuyerBounties();

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({
        queryKey: bountyQueryKeys.buyerBounties,
      });
    }, [queryClient]),
  );

  const renderBounty = ({ item }: { item: Bounty }) => {
    const isCancelled = item.status === "cancelled";
    const isDisputed = item.status === "disputed";

    return (
      <TouchableOpacity
        style={[
          styles.bountyCard,
          isCancelled && styles.cancelledCard,
          isDisputed && styles.disputedCard,
        ]}
        onPress={() =>
          navigation.navigate("BountyDetail", { bountyId: item.id })
        }
      >
        <View style={styles.cardLeft}>
          <Zap
            color={isCancelled ? Colors.mutedGray : Colors.primary_green}
            size={28}
          />
        </View>
        <View style={styles.cardInfo}>
          <Text
            style={[
              styles.itemDescription,
              isCancelled && styles.cancelledText,
            ]}
            numberOfLines={2}
          >
            {item.item_description}
          </Text>
          <Text style={styles.storeName}>{item.store_name}</Text>
          <Text style={styles.meta}>
            {formatPrice(item.bounty_amount_cents)} · Deadline{" "}
            {formatDate(item.deadline)}
          </Text>
          <View style={styles.statusRow}>
            <StatusPill
              label={item.status.replace(/_/g, " ")}
              tone={statusTone[item.status] ?? "info"}
            />
          </View>
        </View>
        <ChevronRight
          color={isCancelled ? Colors.mutedGray : Colors.mutedGray}
          size={22}
        />
      </TouchableOpacity>
    );
  };

  const activeBounties = bounties.filter(
    (b) => !["confirmed", "cancelled"].includes(b.status),
  );
  const pastBounties = bounties.filter((b) =>
    ["confirmed", "cancelled"].includes(b.status),
  );

  const sections = [
    ...(activeBounties.length > 0
      ? [{ title: "Active", data: activeBounties }]
      : []),
    ...(pastBounties.length > 0
      ? [{ title: "Completed / Cancelled", data: pastBounties }]
      : []),
  ];

  const flatData: Array<
    { type: "header"; title: string } | { type: "item"; bounty: Bounty }
  > = [];
  for (const section of sections) {
    flatData.push({ type: "header", title: section.title });
    for (const bounty of section.data) {
      flatData.push({ type: "item", bounty });
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() =>
            navigation.navigate("MainTabs" as any, { screen: "ProfileTab" })
          }
        >
          <ChevronLeft color={Colors.darkTeal} size={28} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Bounties</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("PlaceBounty")}
        >
          <Plus color={Colors.primary_blue} size={24} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator
          size="large"
          color={Colors.primary_blue}
          style={{ marginTop: 40 }}
        />
      ) : bounties.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Zap color={Colors.lightGray} size={80} />
          <Text style={styles.emptyText}>No bounties yet</Text>
          <Text style={styles.emptySubtext}>
            Place a bounty and a dasher will buy and deliver it to you
          </Text>
          <TouchableOpacity
            style={styles.placeBountyButton}
            onPress={() => navigation.navigate("PlaceBounty")}
          >
            <Plus color={Colors.white} size={18} />
            <Text style={styles.placeBountyButtonText}>Place a Bounty</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item, index) =>
            item.type === "header"
              ? `header-${item.title}`
              : `bounty-${(item as any).bounty.id}`
          }
          renderItem={({ item }) => {
            if (item.type === "header") {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderText}>{item.title}</Text>
                </View>
              );
            }
            return renderBounty({ item: (item as any).bounty });
          }}
          contentContainerStyle={styles.listContent}
          onRefresh={() => void refetch()}
          refreshing={isLoading}
        />
      )}
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
    paddingVertical: Spacing.lg,
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
    fontSize: 24,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.lightMint,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  bountyCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    gap: Spacing.md,
  },
  cancelledCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  disputedCard: {
    borderColor: "#FECACA",
    borderWidth: 1.5,
  },
  cardLeft: {
    width: 36,
    alignItems: "center",
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  itemDescription: {
    fontSize: 15,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
  },
  cancelledText: {
    color: Colors.mutedGray,
  },
  storeName: {
    fontSize: 13,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
  },
  meta: {
    fontSize: 13,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
  },
  statusRow: {
    marginTop: 4,
    alignSelf: "flex-start",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xxxl,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 20,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
    textAlign: "center",
    lineHeight: 20,
  },
  placeBountyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.primary_blue,
    borderRadius: BorderRadius.large,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
  placeBountyButtonText: {
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "600",
    color: Colors.white,
  },
});

export default ProfileMyBounties;
