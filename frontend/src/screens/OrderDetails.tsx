import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Platform,
  Linking,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronLeft,
  Receipt,
  Ban,
  MapPin,
  Bike,
  ShoppingCart,
  MessageCircle,
  Navigation,
  CheckCircle,
  AlertTriangle,
  Clock,
} from "lucide-react-native";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { supabase } from "../lib/supabase";
import { Colors, Typography, Spacing, BorderRadius } from "../assets/styles";
import { alert } from "../lib/utils/platform";
import NativeOSMMap from "../components/NativeOSMMap";
import { getMapTileUrlTemplate } from "../lib/osm";
import { addOrderToCart, summarizeBatchResults } from "../lib/api/repeatBuying";
import { getOrCreateConversation } from "../lib/api/messages";
import { buildOpenInMapsUrl } from "../lib/mapsLinking";
import { confirmOrderReceipt, flagOrderIssue } from "../lib/api/orders";

type OrderDetailsNavigationProp = NativeStackNavigationProp<any>;

type RouteParams = {
  orderId: number | string;
};

interface OrderItem {
  id: number;
  listing_id: number;
  title: string;
  price_cents: number;
  quantity: number;
}

interface Order {
  id: number;
  status: string;
  delivery_method: string;
  delivery_address: string | null;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  subtotal_cents: number;
  tax_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  created_at: string;
  paid_at: string | null;
  buyer_confirmed: boolean | null;
  buyer_confirmed_at: string | null;
  buyer_flag_reason: string | null;
  order_items: OrderItem[];
}

interface DeliveryOrder {
  id: number;
  status: string;
  delivery_address: string;
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  dasher_id: string | null;
  created_at: string;
}

interface TrackingLocation {
  lat: number;
  lng: number;
  updatedAt: string | null;
}

interface PickupLocation {
  pickup_address: string;
  pickup_building_name?: string | null;
  pickup_lat: number;
  pickup_lng: number;
}

const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending_payment":
      return "Pending payment";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
};

const getStatusColors = (status: string) => {
  switch (status) {
    case "paid":
      return { bg: `${Colors.primary_green}1A`, fg: Colors.primary_green };
    case "pending_payment":
      return { bg: `${Colors.primary_accent}1A`, fg: Colors.primary_accent };
    case "cancelled":
      return { bg: `${Colors.mutedGray}1A`, fg: Colors.mutedGray };
    default:
      return { bg: `${Colors.mutedGray}1A`, fg: Colors.mutedGray };
  }
};

const getDeliveryTrackingLabel = (status: string) => {
  switch (status) {
    case "pending":
      return "Searching for a dasher";
    case "accepted":
      return "Dasher heading to pickup";
    case "picked_up":
      return "Out for delivery";
    case "delivered":
      return "Delivered";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
};

const FLAG_REASONS = [
  "Item not received",
  "Not as described",
  "Wrong item(s)",
  "Item damaged or defective",
  "Other",
];

const pickActiveDelivery = (deliveries: DeliveryOrder[]) => {
  return (
    deliveries.find((delivery) => delivery.status === "picked_up") ||
    deliveries.find((delivery) => delivery.status === "accepted") ||
    deliveries.find((delivery) => delivery.status === "pending") ||
    deliveries[0] ||
    null
  );
};

const canBuyerViewTracking = (status?: string | null) => {
  return status === "picked_up" || status === "delivered";
};

const OrderDetails: React.FC = () => {
  const navigation = useNavigation<OrderDetailsNavigationProp>();
  const route = useRoute();
  const orderIdParam = (route.params as RouteParams)?.orderId ?? 0;
  const orderId = Number(orderIdParam) || 0;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [trackingLocation, setTrackingLocation] =
    useState<TrackingLocation | null>(null);
  const [reordering, setReordering] = useState(false);
  const [openingConversationForListing, setOpeningConversationForListing] =
    useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [trackingNowMs, setTrackingNowMs] = useState(() => Date.now());
  const mapTileUrlTemplate = useMemo(() => getMapTileUrlTemplate(), []);

  const canCancel = useMemo(() => {
    if (!order) return false;
    return order.status === "paid" || order.status === "pending_payment";
  }, [order]);

  // Show the confirmation card when:
  // - Pickup orders: immediately after payment (buyer arranges pickup independently)
  // - Delivery orders: once all delivery_orders have reached 'delivered'
  const showConfirmationCard = useMemo(() => {
    if (!order || order.status !== "paid") return false;
    if (order.delivery_method === "pickup") return true;
    if (order.delivery_method === "delivery") {
      return (
        deliveryOrders.length > 0 &&
        deliveryOrders.every((d) => d.status === "delivered")
      );
    }
    return false;
  }, [order, deliveryOrders]);

  const isConfirmWindowOpen = useMemo(() => {
    if (!order?.paid_at) return false;
    return new Date(order.paid_at).getTime() > Date.now() - 48 * 60 * 60 * 1000;
  }, [order?.paid_at]);

  const activeDelivery = useMemo(
    () => pickActiveDelivery(deliveryOrders),
    [deliveryOrders],
  );
  const canShowTrackingMap = canBuyerViewTracking(activeDelivery?.status);

  const loadTrackingForDelivery = useCallback(
    async (deliveryOrderId: number, deliveryStatus?: string | null) => {
      if (!canBuyerViewTracking(deliveryStatus)) {
        setTrackingLocation(null);
        return;
      }

      const { data } = await supabase
        .from("delivery_tracking")
        .select("lat, lng, updated_at")
        .eq("delivery_order_id", deliveryOrderId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) {
        setTrackingLocation(null);
        return;
      }

      setTrackingLocation({
        lat: data.lat,
        lng: data.lng,
        updatedAt: data.updated_at || null,
      });
    },
    [],
  );

  const openPickupInMaps = useCallback(async (loc: PickupLocation) => {
    const platform =
      Platform.OS === "ios"
        ? "ios"
        : Platform.OS === "android"
          ? "android"
          : "web";
    const url = buildOpenInMapsUrl({
      platform,
      address: loc.pickup_address,
      coordinate: { latitude: loc.pickup_lat, longitude: loc.pickup_lng },
    });
    try {
      await Linking.openURL(url);
    } catch {
      alert("Error", "Could not open maps.");
    }
  }, []);

  const fetchOrder = useCallback(async () => {
    setErrorMsg(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setOrder(null);
        setErrorMsg("Please log in to view this order.");
        return;
      }

      const withCoordsSelect =
        "id, status, delivery_method, delivery_address, delivery_lat, delivery_lng, subtotal_cents, tax_cents, delivery_fee_cents, total_cents, created_at, paid_at, buyer_confirmed, buyer_confirmed_at, buyer_flag_reason, order_items(id, listing_id, title, price_cents, quantity)";
      const withoutCoordsSelect =
        "id, status, delivery_method, delivery_address, subtotal_cents, tax_cents, delivery_fee_cents, total_cents, created_at, paid_at, buyer_confirmed, buyer_confirmed_at, buyer_flag_reason, order_items(id, listing_id, title, price_cents, quantity)";

      let orderData: any = null;
      let orderError: any = null;
      const withCoordsResult = await supabase
        .from("orders")
        .select(withCoordsSelect)
        .eq("id", orderId)
        .eq("user_id", user.id)
        .single();

      orderData = withCoordsResult.data;
      orderError = withCoordsResult.error;

      if (
        orderError &&
        /delivery_lat|delivery_lng/i.test(orderError.message || "")
      ) {
        const fallbackResult = await supabase
          .from("orders")
          .select(withoutCoordsSelect)
          .eq("id", orderId)
          .eq("user_id", user.id)
          .single();
        orderData = fallbackResult.data;
        orderError = fallbackResult.error;
      }

      if (orderError) {
        console.error("Error fetching order:", orderError);
        setOrder(null);
        setErrorMsg("Couldn't load this order. Please try again.");
        return;
      }

      setOrder((orderData as Order) || null);

      if (orderData?.delivery_method === "delivery") {
        const { data: deliveries, error: deliveriesError } = await supabase
          .from("delivery_orders")
          .select(
            "id, status, delivery_address, delivery_lat, delivery_lng, dasher_id, created_at",
          )
          .eq("order_id", orderId)
          .eq("buyer_id", user.id)
          .order("created_at", { ascending: true })
          .limit(50);

        if (!deliveriesError) {
          const rows = (deliveries || []) as DeliveryOrder[];
          setDeliveryOrders(rows);
          const selected = pickActiveDelivery(rows);
          if (selected) {
            await loadTrackingForDelivery(selected.id, selected.status);
          } else {
            setTrackingLocation(null);
          }
        }
      } else if (orderData?.delivery_method === "pickup") {
        setDeliveryOrders([]);
        setTrackingLocation(null);
        const { data: pickupData } = await supabase.rpc(
          "get_pickup_locations_for_order",
          { p_order_id: orderId },
        );
        setPickupLocations((pickupData as PickupLocation[]) || []);
      } else {
        setDeliveryOrders([]);
        setTrackingLocation(null);
      }
    } catch (e) {
      console.error("Error fetching order:", e);
      setOrder(null);
      setErrorMsg("Couldn't load this order. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [orderId, loadTrackingForDelivery]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void fetchOrder();
    }, [fetchOrder]),
  );

  useEffect(() => {
    if (!order || order.delivery_method !== "delivery") return;

    const channel = supabase
      .channel(`order-delivery-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_orders",
          filter: `order_id=eq.${orderId}`,
        },
        (payload: any) => {
          const updated = payload.new as DeliveryOrder | null;
          if (!updated) return;
          setDeliveryOrders((prev) => {
            const index = prev.findIndex((item) => item.id === updated.id);
            if (index === -1) return [...prev, updated];
            const next = [...prev];
            next[index] = updated;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, order]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTrackingNowMs(Date.now());
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeDelivery?.id) {
      setTrackingLocation(null);
      return;
    }

    if (!canBuyerViewTracking(activeDelivery.status)) {
      setTrackingLocation(null);
      return;
    }

    let didCancel = false;
    void loadTrackingForDelivery(activeDelivery.id, activeDelivery.status);

    if (activeDelivery.status !== "picked_up") {
      return () => {
        didCancel = true;
      };
    }

    const channel = supabase
      .channel(`order-tracking-${activeDelivery.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "delivery_tracking",
          filter: `delivery_order_id=eq.${activeDelivery.id}`,
        },
        (payload: any) => {
          if (!payload.new) return;
          if (didCancel) return;
          setTrackingLocation({
            lat: payload.new.lat,
            lng: payload.new.lng,
            updatedAt: payload.new.updated_at || null,
          });
        },
      )
      .subscribe();

    return () => {
      didCancel = true;
      void supabase.removeChannel(channel);
    };
  }, [activeDelivery?.id, activeDelivery?.status, loadTrackingForDelivery]);

  const handleCancel = async () => {
    if (!order || !canCancel || cancelling) return;

    alert(
      "Cancel order?",
      "If you cancel, this order will be marked as cancelled.",
      [
        { text: "Keep order", style: "cancel" },
        {
          text: "Cancel order",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (!user) {
                alert("Error", "Please log in to cancel this order.");
                return;
              }

              const { error: cancelError } = await supabase
                .from("orders")
                .update({ status: "cancelled" })
                .eq("id", order.id)
                .eq("user_id", user.id)
                .in("status", ["paid", "pending_payment"]);

              if (cancelError) {
                console.error("Error cancelling order:", cancelError);
                alert("Error", "Couldn't cancel this order. Please try again.");
                return;
              }

              if (order.delivery_method === "delivery") {
                try {
                  await supabase
                    .from("delivery_orders")
                    .update({ status: "cancelled", dasher_id: null })
                    .eq("order_id", order.id)
                    .in("status", ["pending", "accepted", "picked_up"]);
                } catch (deliveryCancelError) {
                  console.warn(
                    "Best-effort delivery cancel failed:",
                    deliveryCancelError,
                  );
                }
              }

              alert("Order cancelled", "Your order has been cancelled.");
              setOrder((prev) =>
                prev ? { ...prev, status: "cancelled" } : prev,
              );
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  const handleOrderAgain = async () => {
    if (!order || reordering) return;

    try {
      setReordering(true);
      const rows = await addOrderToCart(order.id);
      const summary = summarizeBatchResults(rows);
      const message =
        summary.total === 0 || summary.skipped === summary.total
          ? "No currently available items from this order could be added."
          : [
              `${summary.added + summary.merged} item${summary.added + summary.merged === 1 ? "" : "s"} added to cart.`,
              summary.skipped > 0
                ? `${summary.skipped} unavailable item${summary.skipped === 1 ? "" : "s"} skipped.`
                : null,
            ]
              .filter(Boolean)
              .join(" ");

      alert("Added to cart", message, [
        { text: "Stay here", style: "cancel" },
        {
          text: "Open cart",
          onPress: () =>
            navigation.navigate("MainTabs" as any, { screen: "CartTab" }),
        },
      ]);
    } catch (error) {
      console.error("Order-again failed:", error);
      alert("Error", "Couldn't add this order to your cart.");
    } finally {
      setReordering(false);
    }
  };

  const handleMessageSeller = async (listingId: number) => {
    if (!listingId || openingConversationForListing) return;
    setOpeningConversationForListing(listingId);

    try {
      const conversation = await getOrCreateConversation(listingId);
      navigation.navigate("Conversation", {
        conversationId: Number(conversation.id),
        listingId,
      });
    } catch (error: any) {
      console.error("Unable to open seller chat:", error);
      alert(
        "Unable to start chat",
        error?.message || "Please try again in a moment.",
      );
    } finally {
      setOpeningConversationForListing(null);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!order || confirming) return;
    setConfirming(true);
    try {
      await confirmOrderReceipt(order.id);
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              buyer_confirmed: true,
              buyer_confirmed_at: new Date().toISOString(),
            }
          : prev,
      );
    } catch (e: any) {
      alert(
        "Error",
        e?.message || "Couldn't confirm receipt. Please try again.",
      );
    } finally {
      setConfirming(false);
    }
  };

  const handleReportIssue = async (reason: string) => {
    if (!order || reporting) return;
    setShowReportModal(false);
    setReporting(true);
    try {
      await flagOrderIssue(order.id, reason);
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              buyer_confirmed: false,
              buyer_confirmed_at: new Date().toISOString(),
              buyer_flag_reason: reason,
            }
          : prev,
      );
    } catch (e: any) {
      alert("Error", e?.message || "Couldn't report issue. Please try again.");
    } finally {
      setReporting(false);
    }
  };

  const statusColors = order ? getStatusColors(order.status) : null;

  const summaryRows = useMemo(() => {
    if (!order) return [];
    const rows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Subtotal", value: formatPrice(order.subtotal_cents) },
      { label: "Tax", value: formatPrice(order.tax_cents) },
    ];
    if (order.delivery_fee_cents > 0) {
      rows.push({
        label: "Delivery fee",
        value: formatPrice(order.delivery_fee_cents),
      });
    }
    rows.push({
      label: "Total",
      value: formatPrice(order.total_cents),
      bold: true,
    });
    return rows;
  }, [order]);

  const dropoffLat =
    (order as any)?.delivery_lat ?? activeDelivery?.delivery_lat ?? null;
  const dropoffLng =
    (order as any)?.delivery_lng ?? activeDelivery?.delivery_lng ?? null;

  const mapCenter = useMemo(() => {
    if (trackingLocation) {
      return {
        latitude: trackingLocation.lat,
        longitude: trackingLocation.lng,
      };
    }
    if (dropoffLat != null && dropoffLng != null) {
      return { latitude: dropoffLat, longitude: dropoffLng };
    }
    return null;
  }, [trackingLocation, dropoffLat, dropoffLng]);

  const routeLine = useMemo(() => {
    if (trackingLocation && dropoffLat != null && dropoffLng != null) {
      return [
        { latitude: trackingLocation.lat, longitude: trackingLocation.lng },
        { latitude: dropoffLat, longitude: dropoffLng },
      ];
    }
    return [];
  }, [trackingLocation, dropoffLat, dropoffLng]);
  const trackingAgeMs = useMemo(() => {
    if (!trackingLocation?.updatedAt) return null;
    const updatedAtMs = Date.parse(trackingLocation.updatedAt);
    if (!Number.isFinite(updatedAtMs)) return null;
    return trackingNowMs - updatedAtMs;
  }, [trackingLocation?.updatedAt, trackingNowMs]);
  const isTrackingStale =
    activeDelivery?.status === "picked_up" &&
    trackingAgeMs != null &&
    trackingAgeMs > 45000;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate("PastOrders" as any)}
        >
          <ChevronLeft color={Colors.darkTeal} size={32} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.headerTitle}>Order Details</Text>
          {order?.id ? (
            <Text style={styles.headerSubtitle}>Order #{order.id}</Text>
          ) : null}
        </View>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={Colors.primary_blue}
          style={{ marginTop: 20 }}
        />
      ) : errorMsg ? (
        <View style={styles.emptyContainer}>
          <Receipt color={Colors.lightGray} size={80} />
          <Text style={styles.emptyText}>Unable to load order</Text>
          <Text style={styles.emptySubtext}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchOrder}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !order ? (
        <View style={styles.emptyContainer}>
          <Receipt color={Colors.lightGray} size={80} />
          <Text style={styles.emptyText}>Order not found</Text>
          <Text style={styles.emptySubtext}>
            This order may have been removed.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: Spacing.xxxl }}
        >
          <View style={styles.card}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Status</Text>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: statusColors?.bg },
                ]}
              >
                <Text style={[styles.statusText, { color: statusColors?.fg }]}>
                  {getStatusLabel(order.status)}
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Placed</Text>
              <Text style={styles.metaValue}>
                {formatDateTime(order.created_at)}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Method</Text>
              <Text style={styles.metaValue}>
                {order.delivery_method === "delivery" ? "Delivery" : "Pickup"}
              </Text>
            </View>

            {order.delivery_method === "delivery" && order.delivery_address ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Address</Text>
                <Text
                  style={[styles.metaValue, { flex: 1, textAlign: "right" }]}
                >
                  {order.delivery_address}
                </Text>
              </View>
            ) : null}

            {order.delivery_method === "pickup" &&
            pickupLocations.length > 0 ? (
              <>
                {pickupLocations.map((loc, i) => (
                  <View key={i}>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>Pickup Location</Text>
                      <Text
                        style={[
                          styles.metaValue,
                          { flex: 1, textAlign: "right" },
                        ]}
                      >
                        {loc.pickup_building_name
                          ? `${loc.pickup_building_name}\n${loc.pickup_address}`
                          : loc.pickup_address}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.mapsButton}
                      onPress={() => openPickupInMaps(loc)}
                    >
                      <Navigation size={18} color={Colors.primary_blue} />
                      <Text style={styles.mapsButtonText}>
                        Open in Google Maps
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            ) : null}
          </View>

          {order.delivery_method === "delivery" ? (
            <>
              <Text style={styles.sectionTitle}>Delivery Tracking</Text>
              <View style={styles.card}>
                <View style={styles.trackingHeader}>
                  <Bike size={18} color={Colors.primary_blue} />
                  <Text style={styles.trackingStatusText}>
                    {activeDelivery
                      ? getDeliveryTrackingLabel(activeDelivery.status)
                      : "Preparing delivery"}
                  </Text>
                </View>
                {trackingLocation?.updatedAt ? (
                  <Text style={styles.trackingUpdatedText}>
                    Updated {formatDateTime(trackingLocation.updatedAt)}
                  </Text>
                ) : null}
                {isTrackingStale ? (
                  <Text style={styles.trackingStaleText}>
                    Location signal is delayed. Waiting for the dasher's latest
                    update.
                  </Text>
                ) : null}

                {!canShowTrackingMap ? (
                  <View style={styles.mapFallback}>
                    <MapPin size={16} color={Colors.primary_blue} />
                    <Text style={styles.mapFallbackText}>
                      Live tracking starts after the dasher picks up your order.
                    </Text>
                  </View>
                ) : mapCenter ? (
                  <View style={styles.mapContainer}>
                    <NativeOSMMap
                      initialRegion={{
                        latitude: mapCenter.latitude,
                        longitude: mapCenter.longitude,
                        latitudeDelta: 0.02,
                        longitudeDelta: 0.02,
                      }}
                      tileUrlTemplate={mapTileUrlTemplate}
                      showsUserLocation
                      dropoff={
                        dropoffLat != null && dropoffLng != null
                          ? {
                              coordinate: {
                                latitude: dropoffLat,
                                longitude: dropoffLng,
                              },
                              title: "Dropoff",
                              description: order.delivery_address || "Dropoff",
                              pinColor: Colors.primary_green,
                            }
                          : undefined
                      }
                      dasher={
                        trackingLocation
                          ? {
                              coordinate: {
                                latitude: trackingLocation.lat,
                                longitude: trackingLocation.lng,
                              },
                              title: "Dasher",
                              pinColor: Colors.primary_blue,
                            }
                          : undefined
                      }
                      routeCoordinates={
                        routeLine.length > 1 ? routeLine : undefined
                      }
                    />
                  </View>
                ) : (
                  <View style={styles.mapFallback}>
                    <MapPin size={16} color={Colors.primary_blue} />
                    <Text style={styles.mapFallbackText}>
                      Tracking map is unavailable until delivery coordinates are
                      available.
                    </Text>
                  </View>
                )}

                {deliveryOrders.length > 0 ? (
                  <View style={styles.deliveryList}>
                    {deliveryOrders.map((delivery) => (
                      <View key={delivery.id} style={styles.deliveryRow}>
                        <Text style={styles.deliveryRowTitle}>
                          Delivery #{delivery.id}
                        </Text>
                        <Text style={styles.deliveryRowStatus}>
                          {getDeliveryTrackingLabel(delivery.status)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.trackingUpdatedText}>
                    Waiting for delivery assignment.
                  </Text>
                )}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Items</Text>
          <View style={styles.card}>
            {(order.order_items || []).map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <View style={styles.lineItemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineItemTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.lineItemMeta}>
                      {formatPrice(item.price_cents)} · Qty {item.quantity}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.messageSellerButton,
                        openingConversationForListing === item.listing_id && {
                          opacity: 0.75,
                        },
                      ]}
                      onPress={() =>
                        handleMessageSeller(Number(item.listing_id))
                      }
                      disabled={
                        openingConversationForListing === item.listing_id
                      }
                    >
                      {openingConversationForListing === item.listing_id ? (
                        <ActivityIndicator
                          color={Colors.primary_blue}
                          size="small"
                        />
                      ) : (
                        <>
                          <MessageCircle
                            color={Colors.primary_blue}
                            size={14}
                          />
                          <Text style={styles.messageSellerButtonText}>
                            Message Seller
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.lineItemTotal}>
                    {formatPrice(item.price_cents * item.quantity)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.card}>
            {summaryRows.map((row) => (
              <View key={row.label} style={styles.summaryRow}>
                <Text
                  style={[styles.summaryLabel, row.bold && styles.summaryBold]}
                >
                  {row.label}
                </Text>
                <Text
                  style={[styles.summaryValue, row.bold && styles.summaryBold]}
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>

          {showConfirmationCard ? (
            <>
              <Text style={styles.sectionTitle}>Receipt Confirmation</Text>
              <View style={styles.card}>
                {order.buyer_confirmed === true ? (
                  <View style={styles.confirmBadge}>
                    <CheckCircle size={18} color={Colors.primary_green} />
                    <Text
                      style={[
                        styles.confirmBadgeText,
                        { color: Colors.primary_green },
                      ]}
                    >
                      You confirmed receipt
                    </Text>
                  </View>
                ) : order.buyer_confirmed === false ? (
                  <View style={styles.confirmBadge}>
                    <AlertTriangle size={18} color={Colors.warning} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.confirmBadgeText,
                          { color: Colors.warning },
                        ]}
                      >
                        Issue reported
                      </Text>
                      {order.buyer_flag_reason ? (
                        <Text style={styles.confirmBadgeReason}>
                          {order.buyer_flag_reason}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : isConfirmWindowOpen ? (
                  <>
                    <Text style={styles.confirmPrompt}>
                      Did you receive your order as expected?
                    </Text>
                    <Text style={styles.confirmSubprompt}>
                      You have 48 hours from payment to confirm or report an
                      issue.
                    </Text>
                    <View style={styles.confirmActions}>
                      <TouchableOpacity
                        style={[
                          styles.confirmButton,
                          confirming && { opacity: 0.7 },
                        ]}
                        onPress={handleConfirmReceipt}
                        disabled={confirming || reporting}
                      >
                        {confirming ? (
                          <ActivityIndicator
                            color={Colors.white}
                            size="small"
                          />
                        ) : (
                          <>
                            <CheckCircle size={16} color={Colors.white} />
                            <Text style={styles.confirmButtonText}>
                              Confirm Receipt
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.reportButton,
                          reporting && { opacity: 0.7 },
                        ]}
                        onPress={() => setShowReportModal(true)}
                        disabled={confirming || reporting}
                      >
                        {reporting ? (
                          <ActivityIndicator
                            color={Colors.warning}
                            size="small"
                          />
                        ) : (
                          <>
                            <AlertTriangle size={16} color={Colors.warning} />
                            <Text style={styles.reportButtonText}>
                              Report an Issue
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <View style={styles.confirmBadge}>
                    <Clock size={18} color={Colors.mutedGray} />
                    <Text
                      style={[
                        styles.confirmBadgeText,
                        { color: Colors.mutedGray },
                      ]}
                    >
                      Auto-confirmed
                    </Text>
                  </View>
                )}
              </View>
            </>
          ) : null}

          {(order.order_items || []).length > 0 ? (
            <TouchableOpacity
              style={[styles.orderAgainButton, reordering && { opacity: 0.75 }]}
              onPress={handleOrderAgain}
              disabled={reordering}
            >
              {reordering ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <ShoppingCart size={18} color={Colors.white} />
                  <Text style={styles.orderAgainButtonText}>Order Again</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {canCancel ? (
            <TouchableOpacity
              style={[styles.cancelButton, cancelling && { opacity: 0.7 }]}
              onPress={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ban size={18} color={Colors.white} />
                  <Text style={styles.cancelButtonText}>Cancel order</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}

      <Modal
        visible={showReportModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Report an Issue</Text>
            <Text style={styles.modalSubtitle}>
              What went wrong with your order?
            </Text>
            {FLAG_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                style={styles.modalReasonButton}
                onPress={() => handleReportIssue(reason)}
              >
                <Text style={styles.modalReasonText}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowReportModal(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    fontSize: 20,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.lightGray,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
  },
  sectionTitle: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    fontSize: 17,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  metaLabel: {
    fontSize: 14,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
  },
  metaValue: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.darkTeal,
    fontWeight: "600",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    fontWeight: "700",
  },
  trackingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  trackingStatusText: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  trackingUpdatedText: {
    marginTop: Spacing.xs,
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
  },
  trackingStaleText: {
    marginTop: Spacing.xs,
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.warning,
  },
  mapContainer: {
    marginTop: Spacing.md,
    height: 220,
    borderRadius: BorderRadius.medium,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  mapFallback: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.white,
  },
  mapFallbackText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    lineHeight: 18,
  },
  deliveryList: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  deliveryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.small,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  deliveryRowTitle: {
    fontSize: 13,
    color: Colors.darkTeal,
    fontFamily: Typography.bodySmall.fontFamily,
    fontWeight: "600",
  },
  deliveryRowStatus: {
    fontSize: 12,
    color: Colors.mutedGray,
    fontFamily: Typography.bodySmall.fontFamily,
  },
  lineItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  lineItemTitle: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.darkTeal,
    fontWeight: "600",
  },
  lineItemMeta: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
  },
  messageSellerButton: {
    marginTop: Spacing.sm,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.lightMint,
  },
  messageSellerButtonText: {
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    fontWeight: "700",
    color: Colors.primary_blue,
  },
  lineItemTotal: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.darkTeal,
    fontWeight: "700",
  },
  separator: {
    height: 1,
    backgroundColor: Colors.borderLight,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.darkTeal,
  },
  summaryBold: {
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  mapsButton: {
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    borderColor: Colors.primary_blue,
    paddingVertical: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.xs,
    backgroundColor: Colors.white,
  },
  mapsButtonText: {
    color: Colors.primary_blue,
    fontSize: 15,
    fontWeight: "600",
    fontFamily: Typography.buttonText.fontFamily,
  },
  cancelButton: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.medium,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  orderAgainButton: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary_blue,
    borderRadius: BorderRadius.medium,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  orderAgainButtonText: {
    fontSize: 15,
    color: Colors.white,
    fontFamily: Typography.buttonText.fontFamily,
    fontWeight: "700",
  },
  cancelButtonText: {
    fontSize: 15,
    color: Colors.white,
    fontFamily: Typography.buttonText.fontFamily,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: 20,
    color: Colors.darkTeal,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
  },
  emptySubtext: {
    marginTop: Spacing.xs,
    fontSize: 14,
    color: Colors.mutedGray,
    fontFamily: Typography.bodySmall.fontFamily,
    textAlign: "center",
    lineHeight: 20,
  },
  retryButton: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary_blue,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  retryButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: Typography.buttonText.fontFamily,
  },
  confirmPrompt: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.darkTeal,
    fontFamily: Typography.bodyMedium.fontFamily,
    marginBottom: Spacing.xs,
  },
  confirmSubprompt: {
    fontSize: 13,
    color: Colors.mutedGray,
    fontFamily: Typography.bodySmall.fontFamily,
    marginBottom: Spacing.md,
  },
  confirmActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  confirmButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.primary_green,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.sm,
  },
  confirmButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.white,
    fontFamily: Typography.buttonText.fontFamily,
  },
  reportButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    borderRadius: BorderRadius.medium,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.warning,
    backgroundColor: Colors.white,
  },
  reportButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warning,
    fontFamily: Typography.buttonText.fontFamily,
  },
  confirmBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  confirmBadgeText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: Typography.bodyMedium.fontFamily,
  },
  confirmBadgeReason: {
    fontSize: 13,
    color: Colors.mutedGray,
    fontFamily: Typography.bodySmall.fontFamily,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.darkTeal,
    fontFamily: Typography.heading4.fontFamily,
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.mutedGray,
    fontFamily: Typography.bodySmall.fontFamily,
    marginBottom: Spacing.md,
  },
  modalReasonButton: {
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  modalReasonText: {
    fontSize: 15,
    color: Colors.darkTeal,
    fontFamily: Typography.bodyMedium.fontFamily,
  },
  modalCancelButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.mutedGray,
    fontFamily: Typography.bodyMedium.fontFamily,
  },
});

export default OrderDetails;
