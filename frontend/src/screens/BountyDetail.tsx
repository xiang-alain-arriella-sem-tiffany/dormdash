import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  Zap,
  Store,
  MapPin,
  Clock,
  CheckCircle,
  AlertTriangle,
  X,
  Ban,
} from "lucide-react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Colors, Typography, Spacing, BorderRadius } from "../assets/styles";
import { alert } from "../lib/utils/platform";
import { supabase } from "../lib/supabase";
import { StatusPill, SurfaceCard } from "../components";
import type { Bounty, BountyStatus } from "../lib/api/bounties";
import {
  confirmBountyReceipt,
  flagBountyIssue,
  cancelBounty,
} from "../lib/api/bounties";

type BountyDetailNavigation = NativeStackNavigationProp<any>;

type RouteParams = {
  bountyId: number;
};

const statusLabel: Record<BountyStatus, string> = {
  open: "Waiting for dasher",
  claimed: "Dasher heading to store",
  picked_up: "Item picked up — en route",
  delivered: "Delivered — awaiting confirmation",
  confirmed: "Completed",
  disputed: "Issue reported",
  cancelled: "Cancelled",
};

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
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const isWithin48Hours = (isoTimestamp: string) => {
  const ts = new Date(isoTimestamp).getTime();
  return Date.now() - ts < 48 * 60 * 60 * 1000;
};

const BountyDetail: React.FC = () => {
  const navigation = useNavigation<BountyDetailNavigation>();
  const route = useRoute();
  const bountyId = Number((route.params as RouteParams)?.bountyId);

  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState("");

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchBounty = useCallback(async () => {
    const { data, error } = await supabase
      .from("bounties")
      .select("*")
      .eq("id", bountyId)
      .single();

    if (!error && data) {
      setBounty(data as Bounty);
    }
    setLoading(false);
  }, [bountyId]);

  useEffect(() => {
    void fetchBounty();

    channelRef.current = supabase
      .channel(`bounty-detail-${bountyId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bounties",
          filter: `id=eq.${bountyId}`,
        },
        (payload) => {
          setBounty(payload.new as Bounty);
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [bountyId, fetchBounty]);

  const handleConfirm = async () => {
    alert("Confirm Receipt", "Did you receive your item as requested?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes, Confirm",
        onPress: async () => {
          setActionLoading(true);
          try {
            await confirmBountyReceipt(bountyId);
            void fetchBounty();
          } catch (err: any) {
            alert("Error", err?.message || "Failed to confirm receipt.");
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleFlag = async () => {
    if (!flagReason.trim()) {
      alert("Required", "Please describe the issue.");
      return;
    }
    setActionLoading(true);
    try {
      await flagBountyIssue(bountyId, flagReason.trim());
      setShowFlagModal(false);
      setFlagReason("");
      void fetchBounty();
    } catch (err: any) {
      alert("Error", err?.message || "Failed to report issue.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = () => {
    alert(
      "Cancel Bounty",
      "Are you sure you want to cancel this bounty? The payment refund must be requested separately.",
      [
        { text: "Keep Bounty", style: "cancel" },
        {
          text: "Cancel Bounty",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            try {
              await cancelBounty(bountyId);
              void fetchBounty();
            } catch (err: any) {
              alert("Error", err?.message || "Failed to cancel bounty.");
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
          <Text style={styles.emptyText}>Bounty not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const canConfirm =
    bounty.status === "delivered" &&
    bounty.buyer_confirmed === null &&
    bounty.delivered_at != null &&
    isWithin48Hours(bounty.delivered_at);

  const canCancel = bounty.status === "open";

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
        <Text style={styles.headerTitle}>Bounty Details</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Status Card */}
        <SurfaceCard
          variant={bounty.status === "confirmed" ? "mint" : "default"}
          style={styles.statusCard}
        >
          <View style={styles.statusRow}>
            <Zap color={Colors.primary_green} size={24} />
            <View style={styles.statusTextBlock}>
              <Text style={styles.statusTitle}>
                {statusLabel[bounty.status] ?? bounty.status}
              </Text>
              <StatusPill
                label={bounty.status.replace(/_/g, " ")}
                tone={statusTone[bounty.status] ?? "info"}
              />
            </View>
            <Text style={styles.amountBadge}>
              {formatPrice(bounty.bounty_amount_cents)}
            </Text>
          </View>
        </SurfaceCard>

        {/* Details */}
        <SurfaceCard variant="default" style={styles.card}>
          <Text style={styles.cardSectionTitle}>What you requested</Text>
          <Text style={styles.itemDescription}>{bounty.item_description}</Text>
        </SurfaceCard>

        <SurfaceCard variant="default" style={styles.card}>
          <View style={styles.detailRow}>
            <Store color={Colors.mutedGray} size={18} />
            <View style={styles.detailTextBlock}>
              <Text style={styles.detailLabel}>Store</Text>
              <Text style={styles.detailValue}>{bounty.store_name}</Text>
              <Text style={styles.detailSub}>{bounty.store_location}</Text>
            </View>
          </View>

          <View style={[styles.detailRow, { marginTop: Spacing.md }]}>
            <MapPin color={Colors.mutedGray} size={18} />
            <View style={styles.detailTextBlock}>
              <Text style={styles.detailLabel}>Deliver to</Text>
              <Text style={styles.detailValue}>{bounty.delivery_address}</Text>
            </View>
          </View>

          <View style={[styles.detailRow, { marginTop: Spacing.md }]}>
            <Clock color={Colors.mutedGray} size={18} />
            <View style={styles.detailTextBlock}>
              <Text style={styles.detailLabel}>Deadline</Text>
              <Text style={styles.detailValue}>
                {formatDate(bounty.deadline)}
              </Text>
            </View>
          </View>
        </SurfaceCard>

        {/* Timeline */}
        <SurfaceCard variant="default" style={styles.card}>
          <Text style={styles.cardSectionTitle}>Timeline</Text>
          <TimelineRow
            label="Bounty placed"
            timestamp={bounty.created_at}
            done={true}
          />
          <TimelineRow
            label="Bounty paid"
            timestamp={bounty.paid_at}
            done={bounty.paid_at != null}
          />
          <TimelineRow
            label="Dasher claimed"
            timestamp={bounty.claimed_at}
            done={bounty.claimed_at != null}
          />
          <TimelineRow
            label="Item picked up"
            timestamp={bounty.picked_up_at}
            done={bounty.picked_up_at != null}
          />
          <TimelineRow
            label="Delivered"
            timestamp={bounty.delivered_at}
            done={bounty.delivered_at != null}
            isLast
          />
        </SurfaceCard>

        {/* Dispute info */}
        {bounty.status === "disputed" && bounty.buyer_flag_reason ? (
          <SurfaceCard
            variant="default"
            style={[styles.card, styles.disputeCard]}
          >
            <View style={styles.detailRow}>
              <AlertTriangle color="#DC2626" size={18} />
              <View style={styles.detailTextBlock}>
                <Text style={styles.disputeTitle}>Issue Reported</Text>
                <Text style={styles.disputeReason}>
                  {bounty.buyer_flag_reason}
                </Text>
              </View>
            </View>
          </SurfaceCard>
        ) : null}

        {/* Actions */}
        {canConfirm && (
          <View style={styles.actionsBlock}>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                actionLoading && styles.buttonDisabled,
              ]}
              onPress={() => void handleConfirm()}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <CheckCircle color={Colors.white} size={20} />
                  <Text style={styles.confirmButtonText}>Confirm Receipt</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.flagButton,
                actionLoading && styles.buttonDisabled,
              ]}
              onPress={() => setShowFlagModal(true)}
              disabled={actionLoading}
            >
              <AlertTriangle color="#DC2626" size={20} />
              <Text style={styles.flagButtonText}>Report Issue</Text>
            </TouchableOpacity>
          </View>
        )}

        {canCancel && (
          <View style={styles.actionsBlock}>
            <TouchableOpacity
              style={[
                styles.cancelButton,
                actionLoading && styles.buttonDisabled,
              ]}
              onPress={() => void handleCancel()}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#DC2626" size="small" />
              ) : (
                <>
                  <Ban color="#DC2626" size={20} />
                  <Text style={styles.cancelButtonText}>Cancel Bounty</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Flag Issue Modal */}
      <Modal
        visible={showFlagModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFlagModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report an Issue</Text>
              <TouchableOpacity onPress={() => setShowFlagModal(false)}>
                <X color={Colors.darkTeal} size={24} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Describe what went wrong with your bounty delivery.
            </Text>
            <TextInput
              style={styles.flagReasonInput}
              value={flagReason}
              onChangeText={setFlagReason}
              placeholder="e.g. Wrong item delivered, missing items..."
              placeholderTextColor={Colors.mutedGray}
              multiline
              numberOfLines={4}
              maxLength={500}
            />
            <TouchableOpacity
              style={[
                styles.flagSubmitButton,
                actionLoading && styles.buttonDisabled,
              ]}
              onPress={() => void handleFlag()}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={styles.flagSubmitButtonText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

interface TimelineRowProps {
  label: string;
  timestamp: string | null | undefined;
  done: boolean;
  isLast?: boolean;
}

const TimelineRow: React.FC<TimelineRowProps> = ({
  label,
  timestamp,
  done,
  isLast = false,
}) => (
  <View style={tlStyles.row}>
    <View style={tlStyles.indicator}>
      <View
        style={[tlStyles.dot, done ? tlStyles.dotDone : tlStyles.dotPending]}
      />
      {!isLast && (
        <View
          style={[
            tlStyles.line,
            done ? tlStyles.lineDone : tlStyles.linePending,
          ]}
        />
      )}
    </View>
    <View style={tlStyles.textBlock}>
      <Text style={[tlStyles.label, done && tlStyles.labelDone]}>{label}</Text>
      {timestamp ? (
        <Text style={tlStyles.timestamp}>
          {new Date(timestamp).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      ) : null}
    </View>
  </View>
);

const tlStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  indicator: {
    alignItems: "center",
    marginRight: Spacing.md,
    width: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 3,
  },
  dotDone: {
    backgroundColor: Colors.primary_green,
  },
  dotPending: {
    backgroundColor: Colors.lightGray,
    borderWidth: 1,
    borderColor: Colors.mutedGray,
  },
  line: {
    width: 2,
    height: 28,
    marginTop: 2,
  },
  lineDone: {
    backgroundColor: Colors.primary_green,
  },
  linePending: {
    backgroundColor: Colors.lightGray,
  },
  textBlock: {
    flex: 1,
    paddingBottom: Spacing.sm,
  },
  label: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
  },
  labelDone: {
    color: Colors.darkTeal,
    fontWeight: "600",
  },
  timestamp: {
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    marginTop: 2,
  },
});

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
  statusCard: {
    marginBottom: Spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  statusTextBlock: {
    flex: 1,
    gap: Spacing.xs,
  },
  statusTitle: {
    fontSize: 15,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
  },
  amountBadge: {
    fontSize: 18,
    fontFamily: Typography.bodyLarge.fontFamily,
    fontWeight: "700",
    color: Colors.primary_green,
  },
  card: {
    marginBottom: Spacing.md,
  },
  cardSectionTitle: {
    fontSize: 13,
    fontFamily: Typography.bodySmall.fontFamily,
    fontWeight: "600",
    color: Colors.mutedGray,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  itemDescription: {
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.darkTeal,
    lineHeight: 22,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  detailTextBlock: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: 15,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
    marginTop: 2,
  },
  detailSub: {
    fontSize: 13,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    marginTop: 2,
  },
  disputeCard: {
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  disputeTitle: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "700",
    color: "#DC2626",
  },
  disputeReason: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: "#991B1B",
    marginTop: 4,
  },
  actionsBlock: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary_green,
    borderRadius: BorderRadius.large,
    paddingVertical: Spacing.lg,
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: Typography.bodyLarge.fontFamily,
    fontWeight: "700",
    color: Colors.white,
  },
  flagButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.large,
    paddingVertical: Spacing.lg,
    borderWidth: 1.5,
    borderColor: "#DC2626",
  },
  flagButtonText: {
    fontSize: 16,
    fontFamily: Typography.bodyLarge.fontFamily,
    fontWeight: "600",
    color: "#DC2626",
  },
  cancelButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.large,
    paddingVertical: Spacing.lg,
    borderWidth: 1.5,
    borderColor: "#DC2626",
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: Typography.bodyLarge.fontFamily,
    fontWeight: "600",
    color: "#DC2626",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
    marginBottom: Spacing.md,
  },
  flagReasonInput: {
    backgroundColor: Colors.base_bg,
    borderWidth: 1,
    borderColor: Colors.lightGray,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    fontSize: 15,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.darkTeal,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: Spacing.md,
  },
  flagSubmitButton: {
    backgroundColor: "#DC2626",
    borderRadius: BorderRadius.large,
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  flagSubmitButtonText: {
    fontSize: 16,
    fontFamily: Typography.bodyLarge.fontFamily,
    fontWeight: "700",
    color: Colors.white,
  },
});

export default BountyDetail;
