import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  TrendingUp,
  ChevronLeft,
  Package,
  AlertTriangle,
} from "lucide-react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Typography, Spacing, BorderRadius } from "../assets/styles";
import {
  useSellerSales,
  useMarkSalesAsSeen,
  useMarkDisputesSeen,
  type SellerSale,
} from "../lib/api/sales";

type MySalesNavigationProp = NativeStackNavigationProp<any>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// ── Sale Card ─────────────────────────────────────────────────────────────────

const SaleCard: React.FC<{ item: SellerSale }> = ({ item }) => {
  const isUnseen = !item.seller_seen;
  const isDisputed = item.buyer_confirmed === false;
  return (
    <View
      style={[
        styles.saleCard,
        isUnseen && styles.saleCardUnseen,
        isDisputed && styles.saleCardDisputed,
      ]}
    >
      {isUnseen && <View style={styles.unseenDot} />}
      {isDisputed && <View style={styles.disputedDot} />}
      <View style={styles.saleIconContainer}>
        <TrendingUp
          color={isDisputed ? Colors.warning : Colors.primary_green}
          size={28}
        />
      </View>
      <View style={styles.saleInfo}>
        <Text style={styles.saleTitle} numberOfLines={2}>
          {item.listing_title}
        </Text>
        <Text style={styles.saleMeta}>
          {formatDate(item.paid_at)} ·{" "}
          {item.delivery_method === "delivery" ? "Delivery" : "Pickup"}
        </Text>
        <Text style={styles.saleMeta}>Buyer: {item.buyer_name}</Text>
        {isDisputed ? (
          <View style={styles.disputedRow}>
            <AlertTriangle size={13} color={Colors.warning} />
            <Text style={styles.disputedText}>
              Disputed
              {item.buyer_flag_reason ? `: ${item.buyer_flag_reason}` : ""}
            </Text>
          </View>
        ) : null}
        <View style={styles.saleAmountRow}>
          <Text style={styles.saleQty}>Qty {item.quantity}</Text>
          <Text style={styles.saleAmount}>
            {formatPrice(item.line_total_cents)}
          </Text>
        </View>
      </View>
    </View>
  );
};

// ── Summary header ────────────────────────────────────────────────────────────

const SummaryCard: React.FC<{
  orderCount: number;
  unitsSold: number;
  revenueCents: number;
}> = ({ orderCount, unitsSold, revenueCents }) => (
  <View style={styles.summaryCard}>
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{orderCount}</Text>
      <Text style={styles.summaryLabel}>Orders</Text>
    </View>
    <View style={styles.summaryDivider} />
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{unitsSold}</Text>
      <Text style={styles.summaryLabel}>Units Sold</Text>
    </View>
    <View style={styles.summaryDivider} />
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{formatPrice(revenueCents)}</Text>
      <Text style={styles.summaryLabel}>Revenue</Text>
    </View>
  </View>
);

// ── Screen ────────────────────────────────────────────────────────────────────

const MySales: React.FC = () => {
  const navigation = useNavigation<MySalesNavigationProp>();
  const {
    data: sales = [],
    isLoading,
    refetch,
    isRefetching,
  } = useSellerSales();
  const markSeenMutation = useMarkSalesAsSeen();
  const markDisputesSeenMutation = useMarkDisputesSeen();

  // Mark all unseen sales and unseen disputes as seen whenever the screen gains focus.
  // This resets the badge count and removes the unseen highlight on cards.
  useFocusEffect(
    useCallback(() => {
      markSeenMutation.mutate();
      markDisputesSeenMutation.mutate();
    }, []),
  );

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const totalRevenueCents = sales.reduce(
    (sum, s) => sum + s.line_total_cents,
    0,
  );
  const totalUnitsSold = sales.reduce((sum, s) => sum + s.quantity, 0);

  const renderContent = () => {
    if (isLoading) {
      return (
        <ActivityIndicator
          size="large"
          color={Colors.primary_blue}
          style={{ marginTop: 20 }}
        />
      );
    }

    if (sales.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Package color={Colors.borderGray} size={80} />
          <Text style={styles.emptyText}>No sales yet</Text>
          <Text style={styles.emptySubtext}>
            When buyers purchase your listings, they'll appear here
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={sales}
        keyExtractor={(item) => item.order_item_id.toString()}
        renderItem={({ item }) => <SaleCard item={item} />}
        ListHeaderComponent={
          <SummaryCard
            orderCount={sales.length}
            unitsSold={totalUnitsSold}
            revenueCents={totalRevenueCents}
          />
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={Colors.primary_accent}
            colors={[Colors.primary_accent]}
            progressBackgroundColor={Colors.white}
          />
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() =>
            navigation.navigate("MainTabs" as any, { screen: "ProfileTab" })
          }
        >
          <ChevronLeft color={Colors.darkTeal} size={32} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Sales</Text>
        <View style={styles.placeholder} />
      </View>
      <View style={styles.content}>{renderContent()}</View>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────

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
    backgroundColor: Colors.base_bg,
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
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 100,
  },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: Colors.lightMint,
    borderRadius: BorderRadius.medium,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.primary_green,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.darkTeal,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.secondary,
    opacity: 0.3,
  },
  saleCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.lightGray,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  saleCardUnseen: {
    backgroundColor: "#F0FDF9",
    borderWidth: 1,
    borderColor: Colors.primary_green,
  },
  saleCardDisputed: {
    backgroundColor: "#FFFBF0",
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  unseenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary_green,
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
  },
  disputedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.warning,
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
  },
  disputedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.xs,
  },
  disputedText: {
    fontSize: 12,
    color: Colors.warning,
    fontWeight: "600",
  },
  saleIconContainer: {
    marginRight: Spacing.md,
    paddingTop: 2,
  },
  saleInfo: {
    flex: 1,
  },
  saleTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.darkTeal,
    marginBottom: 4,
  },
  saleMeta: {
    fontSize: 13,
    color: Colors.mutedGray,
    marginTop: 2,
  },
  saleAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  saleQty: {
    fontSize: 13,
    color: Colors.mutedGray,
  },
  saleAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.primary_green,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.darkTeal,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.mutedGray,
    textAlign: "center",
  },
});

export default MySales;
