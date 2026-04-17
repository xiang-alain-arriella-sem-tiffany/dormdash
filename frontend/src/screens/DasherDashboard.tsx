import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Package,
  ArrowDown,
  MapPin,
  PackageCheck,
  CheckCircle,
  Bike,
  ArrowRight,
  Power,
  Info,
  Navigation,
} from "lucide-react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  WebLayout,
} from "../assets/styles";
import { supabase } from "../lib/supabase";
import { alert } from "../lib/utils/platform";
import {
  getActiveTrackingDeliveryOrderId,
  getCurrentDeviceLocation,
  startDeliveryTracking,
  stopDeliveryTracking,
} from "../lib/locationTracking";
import {
  formatDistanceMiles,
  haversineDistanceMiles,
} from "../lib/utils/distance";
import type { DasherInfo, DasherStatus, DeliveryOrder } from "../types/dasher";
import {
  fetchOpenBounties,
  fetchDasherActiveBounties,
} from "../lib/api/bounties";
import type { Bounty } from "../lib/api/bounties";
import {
  isTransferAmountValid,
  isValidRoutingNumber,
  normalizeRoutingNumber,
  parseTransferAmountToCents,
} from "../lib/transferToBank";
import {
  LiveBadge,
  SectionHeader,
  StatusPill,
  SurfaceCard,
} from "../components";

type DasherDashboardNavigationProp = NativeStackNavigationProp<{
  DasherRegister: undefined;
  DeliveryDetail: { deliveryOrderId: number };
  BountyFulfill: { bountyId: number };
}>;

const DasherDashboard: React.FC = () => {
  const navigation = useNavigation<DasherDashboardNavigationProp>();
  const isWeb = Platform.OS === "web";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dasherInfo, setDasherInfo] = useState<DasherInfo | null>(null);
  const [availableDeliveries, setAvailableDeliveries] = useState<
    DeliveryOrder[]
  >([]);
  const [myDeliveries, setMyDeliveries] = useState<DeliveryOrder[]>([]);
  const [openBounties, setOpenBounties] = useState<Bounty[]>([]);
  const [myActiveBounties, setMyActiveBounties] = useState<Bounty[]>([]);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferRoutingNumber, setTransferRoutingNumber] = useState("");
  const [transferAccountNumber, setTransferAccountNumber] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const realtimeRefreshTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const transferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transferAmountCentsRef = useRef<number>(0);
  const fetchDasherDataRef = useRef<() => Promise<void>>(async () => {});

  const getPickupDetails = useCallback((order: DeliveryOrder) => {
    const relation = (order as any).delivery_pickups;
    const pickupRow = Array.isArray(relation) ? relation[0] : relation;
    return {
      address:
        pickupRow?.pickup_address ||
        order.pickup_address ||
        "Private pickup location",
      lat:
        pickupRow?.pickup_lat != null
          ? Number(pickupRow.pickup_lat)
          : order.pickup_lat != null
            ? Number(order.pickup_lat)
            : null,
      lng:
        pickupRow?.pickup_lng != null
          ? Number(pickupRow.pickup_lng)
          : order.pickup_lng != null
            ? Number(order.pickup_lng)
            : null,
    };
  }, []);

  const refreshCurrentLocation = useCallback(async () => {
    const location = await getCurrentDeviceLocation();
    if (location) {
      setCurrentLocation({ lat: location.lat, lng: location.lng });
    }
  }, []);

  const fetchDasherData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch dasher info
      const { data: dasher, error: dasherError } = await supabase
        .from("dashers")
        .select("*")
        .eq("id", user.id)
        .single();

      if (dasherError) {
        // Not registered as dasher
        setDasherInfo(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setDasherInfo(dasher);

      const [
        availableResult,
        mineResult,
        openBountiesResult,
        myBountiesResult,
      ] = await Promise.all([
        supabase
          .from("delivery_orders")
          .select(
            "*, delivery_pickups(pickup_address, pickup_building_name, pickup_lat, pickup_lng)",
          )
          .eq("status", "pending")
          .is("dasher_id", null)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("delivery_orders")
          .select(
            "*, delivery_pickups(pickup_address, pickup_building_name, pickup_lat, pickup_lng)",
          )
          .eq("dasher_id", user.id)
          .in("status", ["accepted", "picked_up"])
          .order("created_at", { ascending: false }),
        fetchOpenBounties().catch(() => [] as Bounty[]),
        fetchDasherActiveBounties().catch(() => [] as Bounty[]),
      ]);

      setAvailableDeliveries(availableResult.data || []);
      setMyDeliveries(mineResult.data || []);
      setOpenBounties(openBountiesResult);
      setMyActiveBounties(myBountiesResult);

      if (!hasLoadedOnce) {
        setHasLoadedOnce(true);
      }

      // Non-blocking on mobile to avoid delaying dashboard render.
      if (!currentLocation) {
        void refreshCurrentLocation();
      }
    } catch (error) {
      console.error("Error fetching dasher data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentLocation, hasLoadedOnce, refreshCurrentLocation]);

  useEffect(() => {
    fetchDasherDataRef.current = fetchDasherData;
  }, [fetchDasherData]);

  useEffect(() => {
    return () => {
      if (transferTimeoutRef.current) {
        clearTimeout(transferTimeoutRef.current);
        transferTimeoutRef.current = null;
      }
    };
  }, []);

  const queueRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimeoutRef.current) {
      clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = setTimeout(() => {
      void fetchDasherDataRef.current();
    }, 350);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce) {
        setLoading(true);
      }
      void fetchDasherData();
      if (hasLoadedOnce) {
        void refreshCurrentLocation();
      }
    }, [fetchDasherData, hasLoadedOnce, refreshCurrentLocation]),
  );

  useEffect(() => {
    if (!dasherInfo || myDeliveries.length === 0) return;
    const activeDelivery = myDeliveries[0];
    if (!activeDelivery?.id) return;

    const startTrackingIfNeeded = async () => {
      const currentTrackingId = await getActiveTrackingDeliveryOrderId();
      if (currentTrackingId === activeDelivery.id) return;
      const result = await startDeliveryTracking(
        activeDelivery.id,
        dasherInfo.id,
      );
      if (!result.started && result.reason) {
        console.warn(
          "Unable to start active delivery tracking:",
          result.reason,
        );
      }
    };

    void startTrackingIfNeeded();
  }, [myDeliveries, dasherInfo]);

  useEffect(() => {
    if (!dasherInfo) return;
    if (myDeliveries.length > 0) return;
    void stopDeliveryTracking();
  }, [myDeliveries.length, dasherInfo]);

  useEffect(() => {
    let isMounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const watchRealtimeUpdates = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted || !user) return;

      channel = supabase
        .channel(`dasher-dashboard-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "delivery_orders" },
          (payload: any) => {
            const relevantStatuses = new Set([
              "pending",
              "accepted",
              "picked_up",
              "delivered",
              "cancelled",
            ]);

            const newStatus = payload?.new?.status as string | undefined;
            const oldStatus = payload?.old?.status as string | undefined;

            if (
              relevantStatuses.has(newStatus || "") ||
              relevantStatuses.has(oldStatus || "")
            ) {
              queueRealtimeRefresh();
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bounties" },
          () => {
            queueRealtimeRefresh();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "dashers",
            filter: `id=eq.${user.id}`,
          },
          () => {
            queueRealtimeRefresh();
          },
        )
        .subscribe();
    };

    void watchRealtimeUpdates();

    return () => {
      isMounted = false;
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
        realtimeRefreshTimeoutRef.current = null;
      }
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [queueRealtimeRefresh]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchDasherData();
    void refreshCurrentLocation();
  };

  const toggleOnlineStatus = async () => {
    if (!dasherInfo) return;
    if (dasherInfo.status === "busy") {
      alert(
        "You're currently on a delivery",
        "Complete your active delivery before changing your availability.",
      );
      return;
    }

    const newStatus: DasherStatus =
      dasherInfo.status === "offline" ? "online" : "offline";

    setTogglingStatus(true);
    try {
      const { error } = await supabase
        .from("dashers")
        .update({ status: newStatus })
        .eq("id", dasherInfo.id);

      if (error) throw error;

      setDasherInfo({ ...dasherInfo, status: newStatus });

      if (newStatus === "online") {
        alert("You're Online!", "You'll now see available deliveries.");
      } else {
        alert("You're Offline", "You won't receive new delivery requests.");
      }
    } catch (error: any) {
      console.error("Error toggling status:", error);
      alert("Error", "Failed to update status");
    } finally {
      setTogglingStatus(false);
    }
  };

  const acceptDelivery = async (order: DeliveryOrder) => {
    if (!dasherInfo) return;

    try {
      const { data: acceptedOrder, error } = await supabase.rpc(
        "accept_delivery_order",
        { p_order_id: order.id },
      );

      if (error) throw error;

      setDasherInfo({ ...dasherInfo, status: "busy" });

      const trackingResult = await startDeliveryTracking(
        acceptedOrder?.id ?? order.id,
        dasherInfo.id,
      );

      if (trackingResult.reason) {
        alert("Delivery Accepted!", trackingResult.reason);
      } else {
        alert(
          "Delivery Accepted!",
          "Head to the pickup location to collect the item.",
        );
      }
      void fetchDasherData();
    } catch (error: any) {
      console.error("Error accepting delivery:", error);
      alert("Error", "Failed to accept delivery. It may have been taken.");
      void fetchDasherData();
    }
  };

  const updateDeliveryStatus = async (
    order: DeliveryOrder,
    newStatus: string,
  ) => {
    try {
      const { error: statusError } = await supabase.rpc("set_delivery_status", {
        p_order_id: order.id,
        p_status: newStatus,
      });

      if (statusError) throw statusError;

      if (newStatus === "delivered" && dasherInfo) {
        const { error: dasherError } = await supabase
          .from("dashers")
          .update({
            total_deliveries: (dasherInfo.total_deliveries || 0) + 1,
            total_earnings_cents:
              (dasherInfo.total_earnings_cents || 0) + order.delivery_fee_cents,
          })
          .eq("id", dasherInfo.id);

        if (dasherError) {
          console.error("Error updating dasher stats:", dasherError);
        }

        await stopDeliveryTracking();
        setDasherInfo({
          ...dasherInfo,
          status: "online",
          total_deliveries: (dasherInfo.total_deliveries || 0) + 1,
          total_earnings_cents:
            (dasherInfo.total_earnings_cents || 0) + order.delivery_fee_cents,
          available_to_transfer_cents:
            getAvailableToTransferCents(dasherInfo) + order.delivery_fee_cents,
        });
        alert(
          "Delivery Complete!",
          `You earned ${formatPrice(order.delivery_fee_cents)}!`,
        );
      } else if (newStatus === "picked_up") {
        alert("Item Picked Up", "Now deliver it to the buyer's location.");
      }

      void fetchDasherData();
    } catch (error: any) {
      console.error("Error updating delivery:", error);
      alert("Error", "Failed to update delivery status");
    }
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  };

  const getAvailableToTransferCents = (info: DasherInfo | null) => {
    if (!info) return 0;
    if (typeof info.available_to_transfer_cents === "number") {
      return info.available_to_transfer_cents;
    }
    return info.total_earnings_cents || 0;
  };

  const getStatusColor = (status: DasherStatus) => {
    switch (status) {
      case "online":
        return Colors.primary_green;
      case "busy":
        return Colors.warning;
      default:
        return Colors.mutedGray;
    }
  };

  const getStatusLabel = (status: DasherStatus | undefined) => {
    if (status === "online") return "Online";
    if (status === "busy") return "Busy";
    return "Offline";
  };

  const getDistanceToPickup = useCallback(
    (order: DeliveryOrder) => {
      const pickup = getPickupDetails(order);
      if (!currentLocation || pickup.lat == null || pickup.lng == null) {
        return null;
      }

      return haversineDistanceMiles(
        { lat: currentLocation.lat, lng: currentLocation.lng },
        { lat: pickup.lat, lng: pickup.lng },
      );
    },
    [currentLocation, getPickupDetails],
  );

  const openDeliveryDetail = (order: DeliveryOrder) => {
    navigation.navigate("DeliveryDetail", {
      deliveryOrderId: order.id,
    });
  };

  const openBountyFulfill = (bountyId: number) => {
    navigation.navigate("BountyFulfill", { bountyId });
  };

  const handleTransferPress = () => {
    const availableToTransferCents = getAvailableToTransferCents(dasherInfo);

    if (availableToTransferCents <= 0) {
      alert(
        "No funds available",
        "You do not have any earnings to transfer yet.",
      );
      return;
    }

    setTransferError("");
    setTransferSuccess(false);
    setTransferRoutingNumber("");
    setTransferAccountNumber("");
    setTransferAmount("");
    setTransferModalVisible(true);
  };

  const closeTransferModal = () => {
    if (transferSubmitting) return;
    if (transferTimeoutRef.current) {
      clearTimeout(transferTimeoutRef.current);
      transferTimeoutRef.current = null;
    }
    setTransferModalVisible(false);
    setTransferError("");
    setTransferSuccess(false);
    transferAmountCentsRef.current = 0;
  };

  const handleRoutingNumberChange = (value: string) => {
    setTransferRoutingNumber(normalizeRoutingNumber(value));
  };

  const handleAccountNumberChange = (value: string) => {
    setTransferAccountNumber(value.replace(/\D/g, ""));
  };

  const handleAmountChange = (value: string) => {
    setTransferAmount(value.replace(/[^\d.]/g, ""));
  };

  const submitTransferRequest = () => {
    if (!dasherInfo) return;

    const availableToTransferCents = getAvailableToTransferCents(dasherInfo);
    const routingNumber = normalizeRoutingNumber(transferRoutingNumber);
    const accountNumber = transferAccountNumber.trim();
    const amountCents = parseTransferAmountToCents(transferAmount);

    if (!isValidRoutingNumber(routingNumber)) {
      setTransferError("Enter a valid 9-digit US routing number.");
      return;
    }

    if (!/^\d{6,17}$/.test(accountNumber)) {
      setTransferError("Enter a valid account number.");
      return;
    }

    if (
      amountCents == null ||
      !isTransferAmountValid(amountCents, availableToTransferCents)
    ) {
      setTransferError(
        `Enter an amount between $0.01 and ${formatPrice(availableToTransferCents)}.`,
      );
      return;
    }

    setTransferError("");
    setTransferSubmitting(true);
    setTransferSuccess(false);
    transferAmountCentsRef.current = amountCents;

    if (transferTimeoutRef.current) {
      clearTimeout(transferTimeoutRef.current);
    }

    transferTimeoutRef.current = setTimeout(() => {
      setTransferSubmitting(false);
      setTransferSuccess(true);
      setDasherInfo((current) => {
        if (!current) return current;

        const currentAvailable = getAvailableToTransferCents(current);
        const nextAvailable = Math.max(
          currentAvailable - transferAmountCentsRef.current,
          0,
        );

        return {
          ...current,
          available_to_transfer_cents: nextAvailable,
          total_cashed_out_cents:
            (current.total_cashed_out_cents || 0) +
            transferAmountCentsRef.current,
        };
      });
      transferAmountCentsRef.current = 0;
      transferTimeoutRef.current = null;
    }, 2000);
  };

  const renderAvailableBounty = ({ item }: { item: Bounty }) => (
    <SurfaceCard style={styles.deliveryCard} variant="default">
      <View style={styles.deliveryHeader}>
        <View style={styles.earningsBadge}>
          <Text style={styles.earningsText}>
            {formatPrice(item.bounty_amount_cents)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.deliveryTime}>
            Due{" "}
            {new Date(item.deadline).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>

      <View style={styles.deliveryRoute}>
        <View style={styles.routePoint}>
          <Package color={Colors.warning} size={20} />
          <Text style={styles.routeLabel}>Buy at</Text>
        </View>
        <Text style={styles.routeAddress} numberOfLines={1}>
          {item.store_name}
        </Text>
      </View>

      <View style={styles.routeDivider}>
        <View style={styles.routeLine} />
        <ArrowDown color={Colors.mutedGray} size={16} />
        <View style={styles.routeLine} />
      </View>

      <View style={styles.deliveryRoute}>
        <View style={styles.routePoint}>
          <MapPin color={Colors.primary_green} size={20} />
          <Text style={styles.routeLabel}>Deliver</Text>
        </View>
        <Text style={styles.routeAddress} numberOfLines={1}>
          {item.delivery_address}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.acceptButton}
        onPress={() => openBountyFulfill(item.id)}
      >
        <Text style={styles.acceptButtonText}>View &amp; Claim</Text>
      </TouchableOpacity>
    </SurfaceCard>
  );

  const renderMyActiveBounty = ({ item }: { item: Bounty }) => (
    <SurfaceCard
      style={[styles.deliveryCard, styles.myDeliveryCard]}
      variant="mint"
    >
      <View style={styles.deliveryHeader}>
        <View style={[styles.statusBadge, styles.statusBadgeActive]}>
          <Text style={[styles.statusText, styles.statusTextActive]}>
            {item.status === "claimed" ? "Buy Item" : "En Route"}
          </Text>
        </View>
        <Text style={styles.deliveryEarnings}>
          {formatPrice(item.bounty_amount_cents)}
        </Text>
      </View>

      <Text
        style={[styles.routeAddress, { marginBottom: Spacing.sm }]}
        numberOfLines={2}
      >
        {item.item_description}
      </Text>

      <TouchableOpacity
        style={[styles.mapButton, styles.mapButtonStandalone]}
        onPress={() => openBountyFulfill(item.id)}
      >
        <Navigation color={Colors.primary_blue} size={16} />
        <Text style={styles.mapButtonText}>Open Bounty</Text>
      </TouchableOpacity>
    </SurfaceCard>
  );

  const renderAvailableDelivery = ({ item }: { item: DeliveryOrder }) => (
    <SurfaceCard style={styles.deliveryCard} variant="default">
      <View style={styles.deliveryHeader}>
        <View style={styles.earningsBadge}>
          <Text style={styles.earningsText}>
            {formatPrice(item.delivery_fee_cents)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.deliveryTime}>
            {new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          <Text style={styles.distanceText}>
            {`Pickup ${formatDistanceMiles(getDistanceToPickup(item))}`}
          </Text>
        </View>
      </View>

      <View style={styles.deliveryRoute}>
        <View style={styles.routePoint}>
          <Package color={Colors.primary_blue} size={20} />
          <Text style={styles.routeLabel}>Pickup</Text>
        </View>
        <Text style={styles.routeAddress} numberOfLines={2}>
          {getPickupDetails(item).address}
        </Text>
      </View>

      <View style={styles.routeDivider}>
        <View style={styles.routeLine} />
        <ArrowDown color={Colors.mutedGray} size={16} />
        <View style={styles.routeLine} />
      </View>

      <View style={styles.deliveryRoute}>
        <View style={styles.routePoint}>
          <MapPin color={Colors.primary_green} size={20} />
          <Text style={styles.routeLabel}>Deliver</Text>
        </View>
        <Text style={styles.routeAddress} numberOfLines={2}>
          {item.delivery_address}
        </Text>
      </View>

      <View style={styles.deliveryActionRow}>
        <TouchableOpacity
          style={[styles.mapButton, styles.deliveryActionButtonHalf]}
          onPress={() => openDeliveryDetail(item)}
        >
          <Navigation color={Colors.primary_blue} size={16} />
          <Text style={styles.mapButtonText}>View Map</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => acceptDelivery(item)}
        >
          <Text style={styles.acceptButtonText}>Accept Delivery</Text>
        </TouchableOpacity>
      </View>
    </SurfaceCard>
  );

  const renderMyDelivery = ({ item }: { item: DeliveryOrder }) => (
    <SurfaceCard
      style={[styles.deliveryCard, styles.myDeliveryCard]}
      variant="mint"
    >
      <View style={styles.deliveryHeader}>
        <View
          style={[
            styles.statusBadge,
            item.status === "picked_up" && styles.statusBadgeActive,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              item.status === "picked_up" && styles.statusTextActive,
            ]}
          >
            {item.status === "accepted" ? "Pickup Required" : "In Transit"}
          </Text>
        </View>
        <Text style={styles.deliveryEarnings}>
          {formatPrice(item.delivery_fee_cents)}
        </Text>
      </View>

      <View style={styles.deliveryRoute}>
        <View style={styles.routePoint}>
          <Package
            color={
              item.status === "accepted"
                ? Colors.primary_blue
                : Colors.mutedGray
            }
            size={20}
          />
          <Text style={styles.routeLabel}>Pickup</Text>
        </View>
        <Text style={styles.routeAddress} numberOfLines={2}>
          {getPickupDetails(item).address}
        </Text>
      </View>

      <View style={styles.routeDivider}>
        <View style={styles.routeLine} />
        <ArrowDown color={Colors.mutedGray} size={16} />
        <View style={styles.routeLine} />
      </View>

      <View style={styles.deliveryRoute}>
        <View style={styles.routePoint}>
          <MapPin
            color={
              item.status === "picked_up"
                ? Colors.primary_green
                : Colors.mutedGray
            }
            size={20}
          />
          <Text style={styles.routeLabel}>Deliver</Text>
        </View>
        <Text style={styles.routeAddress} numberOfLines={2}>
          {item.delivery_address}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.mapButton, styles.mapButtonStandalone]}
        onPress={() => openDeliveryDetail(item)}
      >
        <Navigation color={Colors.primary_blue} size={16} />
        <Text style={styles.mapButtonText}>Open Live Map</Text>
      </TouchableOpacity>

      {item.status === "accepted" ? (
        <TouchableOpacity
          style={[styles.actionButton, styles.pickedUpButton]}
          onPress={() => updateDeliveryStatus(item, "picked_up")}
        >
          <PackageCheck color={Colors.white} size={20} />
          <Text style={styles.actionButtonText}>Confirm Pickup</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.actionButton, styles.deliveredButton]}
          onPress={() => updateDeliveryStatus(item, "delivered")}
        >
          <CheckCircle color={Colors.white} size={20} />
          <Text style={styles.actionButtonText}>Mark as Delivered</Text>
        </TouchableOpacity>
      )}
    </SurfaceCard>
  );

  // Not registered as dasher
  if (!loading && !dasherInfo) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.notDasherContainer}>
          <View style={styles.notDasherIcon}>
            <Bike color={Colors.primary_green} size={80} />
          </View>
          <Text style={styles.notDasherTitle}>Become a Dasher</Text>
          <Text style={styles.notDasherSubtitle}>
            Earn money by delivering items to fellow Penn students. Set your own
            schedule and dash when it works for you.
          </Text>
          <TouchableOpacity
            style={styles.registerButton}
            onPress={() => navigation.navigate("DasherRegister")}
          >
            <Text style={styles.registerButtonText}>Get Started</Text>
            <ArrowRight color={Colors.white} size={20} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary_blue} />
        </View>
      </SafeAreaView>
    );
  }

  const availableToTransferCents = getAvailableToTransferCents(dasherInfo);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar barStyle="dark-content" />

      <Modal
        visible={transferModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeTransferModal}
      >
        <View style={styles.transferModalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.transferModalKeyboardAvoiding}
          >
            <View style={styles.transferModalCard}>
              <View style={styles.transferModalHeader}>
                <Text style={styles.transferModalTitle}>Transfer to bank</Text>
                <TouchableOpacity onPress={closeTransferModal}>
                  <Text style={styles.transferModalCloseText}>Close</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.transferModalSubtitle}>
                Available to transfer: {formatPrice(availableToTransferCents)}
              </Text>

              {transferSuccess ? (
                <View style={styles.transferSuccessCard}>
                  <Text style={styles.transferSuccessTitle}>
                    Transfer submitted
                  </Text>
                  <Text style={styles.transferSuccessText}>
                    It will transfer in 3 business days.
                  </Text>
                  <TouchableOpacity
                    style={styles.transferSuccessButton}
                    onPress={closeTransferModal}
                  >
                    <Text style={styles.transferSuccessButtonText}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ScrollView
                  contentContainerStyle={styles.transferFormContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text style={styles.transferFieldLabel}>Routing number</Text>
                  <TextInput
                    style={styles.transferInput}
                    value={transferRoutingNumber}
                    onChangeText={handleRoutingNumberChange}
                    placeholder="9-digit routing number"
                    placeholderTextColor={Colors.mutedGray}
                    keyboardType="number-pad"
                    maxLength={9}
                  />

                  <Text style={styles.transferFieldLabel}>Account number</Text>
                  <TextInput
                    style={styles.transferInput}
                    value={transferAccountNumber}
                    onChangeText={handleAccountNumberChange}
                    placeholder="Account number"
                    placeholderTextColor={Colors.mutedGray}
                    keyboardType="number-pad"
                    maxLength={17}
                  />

                  <Text style={styles.transferFieldLabel}>
                    Amount to transfer
                  </Text>
                  <TextInput
                    style={styles.transferInput}
                    value={transferAmount}
                    onChangeText={handleAmountChange}
                    placeholder="0.00"
                    placeholderTextColor={Colors.mutedGray}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.transferHelperText}>
                    Maximum allowed: {formatPrice(availableToTransferCents)}
                  </Text>

                  {transferError ? (
                    <Text style={styles.transferErrorText}>
                      {transferError}
                    </Text>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.transferSubmitButton,
                      transferSubmitting && styles.transferSubmitButtonDisabled,
                    ]}
                    onPress={submitTransferRequest}
                    disabled={transferSubmitting}
                  >
                    {transferSubmitting ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.transferSubmitButtonText}>
                        Submit transfer
                      </Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <>
            {/* Page Header */}
            <View
              style={[
                styles.pageHeader,
                Platform.OS === "web" && styles.pageHeaderWeb,
              ]}
            >
              <View style={styles.pageHeaderTop}>
                <Text style={styles.pageTitle}>Dash</Text>
                <LiveBadge label="Dispatch live" />
              </View>
            </View>

            {/* Stats Header */}
            <View style={[styles.statsHeader, isWeb && styles.statsHeaderWeb]}>
              {/* Primary Stats Section - Deliveries & Total Earned */}
              <View style={styles.statsSection}>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {dasherInfo?.total_deliveries || 0}
                    </Text>
                    <Text style={styles.statLabel}>Deliveries</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatPrice(dasherInfo?.total_earnings_cents || 0)}
                    </Text>
                    <Text style={styles.statLabel}>Total earned</Text>
                  </View>
                </View>
              </View>

              {/* Secondary Stats Section - Cashed Out & Available */}
              <View style={styles.secondaryStatsSection}>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatPrice(dasherInfo?.total_cashed_out_cents || 0)}
                    </Text>
                    <Text style={styles.statLabel}>Cashed out</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                      {formatPrice(availableToTransferCents)}
                    </Text>
                    <Text style={styles.statLabel}>Ready to transfer</Text>
                  </View>
                </View>
              </View>

              {/* Payout Section */}
              <View style={styles.payoutSection}>
                <TouchableOpacity
                  style={[
                    styles.transferButton,
                    availableToTransferCents <= 0 &&
                      styles.transferButtonDisabled,
                  ]}
                  onPress={handleTransferPress}
                  disabled={availableToTransferCents <= 0}
                >
                  <Text style={styles.transferButtonText}>
                    Transfer to bank
                  </Text>
                  <ArrowRight color={Colors.white} size={18} />
                </TouchableOpacity>
              </View>

              {/* Status Section */}
              <View style={styles.statusSection}>
                {/* Online Toggle */}
                <TouchableOpacity
                  style={[
                    styles.statusToggle,
                    dasherInfo?.status === "online" &&
                      styles.statusToggleOnline,
                    dasherInfo?.status === "busy" && styles.statusToggleBusy,
                  ]}
                  onPress={toggleOnlineStatus}
                  disabled={togglingStatus}
                >
                  {togglingStatus ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <>
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor: getStatusColor(
                              dasherInfo?.status || "offline",
                            ),
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusToggleText,
                          dasherInfo?.status === "online" &&
                            styles.statusToggleTextOnline,
                          dasherInfo?.status === "busy" &&
                            styles.statusToggleTextBusy,
                        ]}
                      >
                        {getStatusLabel(dasherInfo?.status)}
                      </Text>
                      <Power
                        color={
                          dasherInfo?.status === "online" ||
                          dasherInfo?.status === "busy"
                            ? Colors.white
                            : Colors.mutedGray
                        }
                        size={20}
                      />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {/* My Active Bounties */}
            {myActiveBounties.length > 0 && (
              <View style={[styles.section, isWeb && styles.sectionWeb]}>
                <SectionHeader
                  title="My Active Bounties"
                  subtitle="Bounties you've claimed"
                  rightSlot={
                    <StatusPill
                      label={`${myActiveBounties.length} active`}
                      tone="warning"
                    />
                  }
                />
                {myActiveBounties.map((bounty) => (
                  <View key={bounty.id}>
                    {renderMyActiveBounty({ item: bounty })}
                  </View>
                ))}
              </View>
            )}

            {/* My Active Deliveries */}
            {myDeliveries.length > 0 && (
              <View style={[styles.section, isWeb && styles.sectionWeb]}>
                <SectionHeader
                  title="My Active Deliveries"
                  subtitle="Current assignments in progress"
                  rightSlot={
                    <StatusPill
                      label={`${myDeliveries.length} active`}
                      tone="success"
                    />
                  }
                />
                {myDeliveries.map((delivery) => (
                  <View key={delivery.id}>
                    {renderMyDelivery({ item: delivery })}
                  </View>
                ))}
              </View>
            )}

            {/* Available Deliveries */}
            <View style={[styles.section, isWeb && styles.sectionWeb]}>
              <SectionHeader
                title="Available Deliveries"
                subtitle="Nearby jobs ready to accept"
                rightSlot={
                  <StatusPill
                    label={`${availableDeliveries.length} open`}
                    tone="info"
                  />
                }
              />
              {dasherInfo?.status === "offline" ? (
                <View style={styles.offlineMessage}>
                  <Info color={Colors.mutedGray} size={24} />
                  <Text style={styles.offlineMessageText}>
                    Go online to see and accept deliveries
                  </Text>
                </View>
              ) : dasherInfo?.status === "busy" ? (
                <View style={styles.offlineMessage}>
                  <Info color={Colors.mutedGray} size={24} />
                  <Text style={styles.offlineMessageText}>
                    You are on an active delivery. Complete it before accepting
                    a new one.
                  </Text>
                </View>
              ) : availableDeliveries.length === 0 ? (
                <View style={styles.emptyState}>
                  <Package color={Colors.lightGray} size={60} />
                  <Text style={styles.emptyStateText}>
                    No deliveries available right now
                  </Text>
                  <Text style={styles.emptyStateSubtext}>
                    Pull down to refresh
                  </Text>
                </View>
              ) : (
                availableDeliveries.map((delivery) => (
                  <View key={delivery.id}>
                    {renderAvailableDelivery({ item: delivery })}
                  </View>
                ))
              )}
            </View>

            {/* Open Bounties */}
            <View style={[styles.section, isWeb && styles.sectionWeb]}>
              <SectionHeader
                title="Open Bounties"
                subtitle="Buy and deliver items for a profit"
                rightSlot={
                  <StatusPill
                    label={`${openBounties.length} open`}
                    tone="info"
                  />
                }
              />
              {dasherInfo?.status === "offline" ? (
                <View style={styles.offlineMessage}>
                  <Info color={Colors.mutedGray} size={24} />
                  <Text style={styles.offlineMessageText}>
                    Go online to see open bounties
                  </Text>
                </View>
              ) : dasherInfo?.status === "busy" ? (
                <View style={styles.offlineMessage}>
                  <Info color={Colors.mutedGray} size={24} />
                  <Text style={styles.offlineMessageText}>
                    Complete your active delivery or bounty first.
                  </Text>
                </View>
              ) : openBounties.length === 0 ? (
                <View style={styles.emptyState}>
                  <Package color={Colors.lightGray} size={60} />
                  <Text style={styles.emptyStateText}>
                    No open bounties right now
                  </Text>
                  <Text style={styles.emptyStateSubtext}>
                    Pull down to refresh
                  </Text>
                </View>
              ) : (
                openBounties.map((bounty) => (
                  <View key={bounty.id}>
                    {renderAvailableBounty({ item: bounty })}
                  </View>
                ))
              )}
            </View>
          </>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.base_bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  // Page Header
  pageHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.base_bg,
  },
  pageHeaderWeb: {
    maxWidth: WebLayout.maxContentWidth,
    alignSelf: "center",
    width: "100%",
  },
  pageHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageTitle: {
    fontSize: 28,
    fontFamily: Typography.heading3.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  // Stats Header
  statsHeader: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  statsHeaderWeb: {
    maxWidth: WebLayout.maxContentWidth,
    alignSelf: "center",
    width: "100%",
  },
  statsSection: {
    marginBottom: Spacing.lg,
  },
  secondaryStatsSection: {
    marginBottom: Spacing.xxl,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  payoutSection: {
    marginBottom: Spacing.xxl,
  },
  statusSection: {
    alignItems: "center",
  },
  payoutCard: {
    backgroundColor: Colors.lightMint,
    borderRadius: BorderRadius.large,
    padding: Spacing.lg,
    gap: Spacing.md,
    width: "100%",
  },
  statItem: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  statValue: {
    fontSize: 24,
    fontFamily: Typography.heading3.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  statLabel: {
    fontSize: 14,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.lightGray,
  },
  transferButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary_blue,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.md,
    width: "100%",
  },
  transferButtonDisabled: {
    backgroundColor: Colors.grayDisabled,
  },
  transferButtonText: {
    fontSize: 16,
    fontFamily: Typography.buttonText.fontFamily,
    fontWeight: "700",
    color: Colors.white,
  },
  transferModalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlayDark,
    justifyContent: "center",
    padding: Spacing.lg,
  },
  transferModalKeyboardAvoiding: {
    width: "100%",
    alignItems: "center",
  },
  transferModalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.large,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  transferModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transferModalTitle: {
    fontSize: 22,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  transferModalCloseText: {
    fontSize: 14,
    fontFamily: Typography.bodySemibold.fontFamily,
    color: Colors.primary_blue,
    fontWeight: "700",
  },
  transferModalSubtitle: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
  },
  transferFormContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  transferFieldLabel: {
    fontSize: 14,
    fontFamily: Typography.bodySemibold.fontFamily,
    color: Colors.darkTeal,
    marginTop: Spacing.sm,
  },
  transferInput: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.darkTeal,
    backgroundColor: Colors.lightGray,
  },
  transferHelperText: {
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    marginTop: -Spacing.xs,
  },
  transferErrorText: {
    fontSize: 13,
    fontFamily: Typography.bodySemibold.fontFamily,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  transferSubmitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary_blue,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  transferSubmitButtonDisabled: {
    backgroundColor: Colors.grayDisabled,
  },
  transferSubmitButtonText: {
    fontSize: 16,
    fontFamily: Typography.buttonText.fontFamily,
    fontWeight: "700",
    color: Colors.white,
  },
  transferSuccessCard: {
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  transferSuccessTitle: {
    fontSize: 20,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  transferSuccessText: {
    fontSize: 15,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
    textAlign: "center",
  },
  transferSuccessButton: {
    backgroundColor: Colors.primary_green,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  transferSuccessButtonText: {
    fontSize: 16,
    fontFamily: Typography.buttonText.fontFamily,
    fontWeight: "700",
    color: Colors.white,
  },
  // Status Toggle
  statusToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.lightGray,
    borderRadius: BorderRadius.large,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    width: "100%",
  },
  statusToggleOnline: {
    backgroundColor: Colors.primary_green,
  },
  statusToggleBusy: {
    backgroundColor: Colors.warning,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusToggleText: {
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
  },
  statusToggleTextOnline: {
    color: Colors.white,
  },
  statusToggleTextBusy: {
    color: Colors.white,
  },
  // List Content
  listContent: {
    paddingBottom: Spacing.xxxl,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionWeb: {
    maxWidth: WebLayout.maxContentWidth,
    width: "100%",
    alignSelf: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
    marginBottom: Spacing.md,
  },
  // Delivery Card
  deliveryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.large,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  myDeliveryCard: {
    borderColor: Colors.primary_green,
    borderWidth: 2,
  },
  deliveryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  earningsBadge: {
    backgroundColor: Colors.lightMint,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.small,
  },
  earningsText: {
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "700",
    color: Colors.primary_green,
  },
  deliveryTime: {
    fontSize: 14,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
  },
  distanceText: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.primary_blue,
    fontWeight: "600",
  },
  deliveryEarnings: {
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "700",
    color: Colors.primary_green,
  },
  statusBadge: {
    backgroundColor: Colors.lightGray,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.small,
  },
  statusBadgeActive: {
    backgroundColor: Colors.primary_green,
  },
  statusText: {
    fontSize: 14,
    fontFamily: Typography.bodySmall.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
  },
  statusTextActive: {
    color: Colors.white,
  },
  deliveryRoute: {
    marginBottom: Spacing.sm,
  },
  routePoint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: 4,
  },
  routeLabel: {
    fontSize: 14,
    fontFamily: Typography.bodySmall.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
  },
  routeAddress: {
    fontSize: 14,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    marginLeft: 28,
  },
  routeDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 9,
    marginVertical: Spacing.xs,
  },
  routeLine: {
    width: 1,
    height: 8,
    backgroundColor: Colors.lightGray,
  },
  deliveryActionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  mapButton: {
    borderColor: Colors.primary_blue,
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.xs,
    backgroundColor: Colors.white,
  },
  mapButtonStandalone: {
    marginTop: Spacing.md,
  },
  deliveryActionButtonHalf: {
    flex: 1,
  },
  mapButtonText: {
    fontSize: 14,
    fontFamily: Typography.bodySmall.fontFamily,
    fontWeight: "600",
    color: Colors.primary_blue,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: Colors.primary_blue,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButtonText: {
    fontSize: 16,
    fontFamily: Typography.buttonText.fontFamily,
    fontWeight: "600",
    color: Colors.white,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  pickedUpButton: {
    backgroundColor: Colors.primary_blue,
  },
  deliveredButton: {
    backgroundColor: Colors.primary_green,
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: Typography.buttonText.fontFamily,
    fontWeight: "600",
    color: Colors.white,
  },
  // Empty/Offline States
  offlineMessage: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.lightGray,
    borderRadius: BorderRadius.medium,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  offlineMessageText: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing.xxxl,
  },
  emptyStateText: {
    fontSize: 18,
    fontFamily: Typography.bodyLarge.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
    marginTop: Spacing.md,
  },
  emptyStateSubtext: {
    fontSize: 14,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    marginTop: Spacing.xs,
  },
  // Not Dasher
  notDasherContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xxxl,
  },
  notDasherIcon: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.lightMint,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  notDasherTitle: {
    fontSize: 28,
    fontFamily: Typography.heading3.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
    marginBottom: Spacing.sm,
  },
  notDasherSubtitle: {
    fontSize: 16,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary_green,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
    gap: Spacing.sm,
  },
  registerButtonText: {
    fontSize: 18,
    fontFamily: Typography.buttonText.fontFamily,
    fontWeight: "700",
    color: Colors.white,
  },
});

export default DasherDashboard;
