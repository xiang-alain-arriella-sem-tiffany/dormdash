import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CheckCircle,
  Mail,
  Home,
  Receipt,
  MapPin,
  Zap,
} from "lucide-react-native";
import { finalizePaidBounty } from "../lib/api/bounties";
import type { NavigationProp, RouteProp } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { Colors, Typography, Spacing, BorderRadius } from "../assets/styles";
import { supabase } from "../lib/supabase";

type Props = {
  navigation: NavigationProp<any>;
  route: RouteProp<any>;
};

const PaymentSuccess: React.FC<Props> = ({ navigation, route }) => {
  const queryClient = useQueryClient();
  const [processingOrder, setProcessingOrder] = useState(true);
  const [processingWarning, setProcessingWarning] = useState<string | null>(
    null,
  );
  const [orderId, setOrderId] = useState<number | null>(null);
  const [bountyId, setBountyId] = useState<number | null>(null);
  const [isPickupOrder, setIsPickupOrder] = useState(false);
  const hasFinalizedRef = useRef(false);

  useEffect(() => {
    if (hasFinalizedRef.current) return;
    hasFinalizedRef.current = true;

    const finalizeOrder = async () => {
      try {
        // 1. Wait for auth session to be ready (critical after Stripe redirect)
        let user = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.user) {
            user = session.user;
            break;
          }
          // Wait before retrying — session may still be loading from storage
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        if (!user) {
          // Final attempt with getUser()
          const {
            data: { user: lastTry },
          } = await supabase.auth.getUser();
          user = lastTry;
        }
        if (!user) {
          console.error("No user found after retries");
          setProcessingOrder(false);
          return;
        }

        // 2. Resolve bountyId or orderId from multiple sources (in priority order)
        let resolvedBountyId: number | null = null;
        let orderId: number | null = null;

        // 2a. URL query params (most reliable — embedded in Stripe success_url)
        if (Platform.OS === "web") {
          try {
            const urlParams = new URLSearchParams(window.location.search);
            const urlBountyId = urlParams.get("bountyId");
            const urlOrderId = urlParams.get("orderId");
            if (urlBountyId) {
              resolvedBountyId = Number(urlBountyId);
              console.log("Got bountyId from URL:", resolvedBountyId);
            } else if (urlOrderId) {
              orderId = Number(urlOrderId);
              console.log("Got orderId from URL:", orderId);
            }
          } catch {
            // URL parsing failed, continue to fallbacks
          }
        }

        // 2b. Route params (React Navigation parses query params into route.params)
        if (!resolvedBountyId && !orderId && route.params) {
          const routeBountyId = (route.params as any).bountyId;
          const routeOrderId = (route.params as any).orderId;
          if (routeBountyId) {
            resolvedBountyId = Number(routeBountyId);
            console.log("Got bountyId from route params:", resolvedBountyId);
          } else if (routeOrderId) {
            orderId = Number(routeOrderId);
            console.log("Got orderId from route params:", orderId);
          }
        }

        // 2c. AsyncStorage (set before Stripe redirect)
        if (!resolvedBountyId && !orderId) {
          const pendingBountyId = await AsyncStorage.getItem("pendingBountyId");
          const pendingOrderId = await AsyncStorage.getItem("pendingOrderId");
          if (pendingBountyId) {
            resolvedBountyId = Number(pendingBountyId);
            console.log("Got bountyId from AsyncStorage:", resolvedBountyId);
          } else if (pendingOrderId) {
            orderId = Number(pendingOrderId);
            console.log("Got orderId from AsyncStorage:", orderId);
          }
        }

        // ── BOUNTY FLOW ──────────────────────────────────────────────────────
        if (resolvedBountyId && !Number.isNaN(resolvedBountyId)) {
          setBountyId(resolvedBountyId);
          try {
            await finalizePaidBounty(resolvedBountyId);
            console.log("Bounty finalized successfully:", resolvedBountyId);
          } catch (err) {
            console.error("Error finalizing bounty:", err);
            setProcessingWarning(
              "Payment succeeded, but bounty finalization needs a retry. Please contact support.",
            );
          }
          await AsyncStorage.removeItem("pendingBountyId");
          setProcessingOrder(false);
          return;
        }

        // ── ORDER FLOW ───────────────────────────────────────────────────────
        if (orderId && !Number.isNaN(orderId)) {
          setOrderId(orderId);
        }

        if (!orderId || Number.isNaN(orderId)) {
          console.warn(
            "No orderId or bountyId found in URL, route params, or storage",
          );
          setProcessingWarning(
            "We could not confirm which order to finalize. Please check your order history.",
          );
          setProcessingOrder(false);
          return;
        }

        // 3. Verify order ownership before finalization.
        const { data: orderBeforeFinalize, error: orderLookupError } =
          await supabase
            .from("orders")
            .select("id, status, delivery_method")
            .eq("id", orderId)
            .eq("user_id", user.id)
            .maybeSingle();

        if (orderLookupError || !orderBeforeFinalize) {
          console.error("Could not find order to finalize:", orderLookupError);
          setProcessingWarning(
            "Payment succeeded, but we could not find your order record. Please contact support.",
          );
          setProcessingOrder(false);
          return;
        }

        // 4. Finalize payment/inventory exactly once in the database.
        const { data: finalizeResult, error: finalizeError } =
          await supabase.rpc("finalize_paid_order", { p_order_id: orderId });

        if (finalizeError) {
          console.error("Error finalizing paid order:", finalizeError);
          setProcessingWarning(
            "Payment succeeded, but inventory finalization needs a retry from your Orders page.",
          );
          setProcessingOrder(false);
          return;
        }

        const finalizedOrder = Array.isArray(finalizeResult)
          ? finalizeResult[0]
          : finalizeResult;

        if (!finalizedOrder) {
          console.error("No finalization result returned for order:", orderId);
          setProcessingWarning(
            "Payment succeeded, but we could not confirm the final order state. Please check your Orders page.",
          );
          setProcessingOrder(false);
          return;
        }

        console.log(
          "Order finalized successfully:",
          orderId,
          "finalized_now:",
          Boolean(finalizedOrder.finalized_now),
        );

        // 5. Resolve final order state.
        const orderData = {
          id: Number(finalizedOrder.order_id ?? orderId),
          status: String(finalizedOrder.status ?? orderBeforeFinalize.status),
          delivery_method: String(
            finalizedOrder.delivery_method ??
              orderBeforeFinalize.delivery_method,
          ),
        };

        setIsPickupOrder(orderData.delivery_method === "pickup");

        // 6. Flush stale cached marketplace data so sold-out listings disappear immediately.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["cart"] }),
          queryClient.invalidateQueries({ queryKey: ["listing"] }),
          queryClient.invalidateQueries({ queryKey: ["listings"] }),
          queryClient.invalidateQueries({ queryKey: ["buyAgainListings"] }),
        ]);

        // 7. If delivery, create delivery_orders records for the dasher flow.
        if (
          orderData.delivery_method === "delivery" &&
          orderData.status === "paid"
        ) {
          const { data: rpcRows, error: rpcError } = await supabase.rpc(
            "create_delivery_orders_for_order",
            { p_order_id: orderId },
          );

          if (rpcError) {
            console.error(
              "Failed to create delivery orders via RPC for order:",
              orderId,
              rpcError,
            );
            const message =
              typeof rpcError?.message === "string" &&
              /missing pickup locations/i.test(rpcError.message)
                ? "Order paid, but at least one listing is missing a pickup location. Ask the seller to update listing location details."
                : "Order paid, but delivery assignment is still processing. Refresh Orders in a moment.";
            setProcessingWarning(message);
          } else {
            console.log(
              "Delivery orders created via RPC for order:",
              orderId,
              "count:",
              Array.isArray(rpcRows) ? rpcRows.length : 0,
            );
          }
        }

        // 8. Clean up AsyncStorage
        await AsyncStorage.removeItem("pendingOrderId");
        await AsyncStorage.removeItem("pendingOrderListingIds");
        await AsyncStorage.removeItem("pendingDeliveryOrder");
      } catch (error) {
        console.error("Error processing order:", error);
      } finally {
        setProcessingOrder(false);
      }
    };

    finalizeOrder();
  }, [queryClient, route.params]);

  const handleGoHome = () => {
    if (Platform.OS === "web") {
      window.location.href = "/feed";
    } else {
      navigation.reset({
        index: 0,
        routes: [{ name: "MainTabs", params: { screen: "FeedTab" } }],
      });
    }
  };

  const handleViewOrders = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs" }, { name: "PastOrders" }],
    });
  };

  const handleViewPickupLocation = () => {
    navigation.reset({
      index: 0,
      routes: [
        { name: "MainTabs" },
        { name: "PastOrders" },
        { name: "OrderDetails", params: { orderId } },
      ],
    });
  };

  const handleViewMyBounties = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs" }, { name: "MyBounties" }],
    });
  };

  if (processingOrder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={Colors.primary_green} />
          <Text style={[styles.subtitle, { marginTop: Spacing.lg }]}>
            Processing your order...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <CheckCircle size={120} color={Colors.primary_green} />
        </View>

        {/* Success Message */}
        <Text style={styles.title}>Payment Successful!</Text>
        <Text style={styles.subtitle}>
          {bountyId
            ? "Your bounty is now live! A dasher will claim it and deliver your item."
            : "Thank you for your purchase. Your order has been confirmed and is being processed."}
        </Text>

        {processingWarning ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>{processingWarning}</Text>
          </View>
        ) : null}

        {/* Order Info */}
        <View style={styles.infoBox}>
          <Mail size={24} color={Colors.primary_blue} />
          <Text style={styles.infoText}>
            A confirmation email will be sent to your registered email address.
          </Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleGoHome}>
            <Home
              size={20}
              color={Colors.white}
              style={{ marginRight: Spacing.sm }}
            />
            <Text style={styles.primaryButtonText}>Back to Home</Text>
          </TouchableOpacity>

          {bountyId ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleViewMyBounties}
            >
              <Zap
                size={20}
                color={Colors.primary_blue}
                style={{ marginRight: Spacing.sm }}
              />
              <Text style={styles.secondaryButtonText}>View My Bounties</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleViewOrders}
            >
              <Receipt
                size={20}
                color={Colors.primary_blue}
                style={{ marginRight: Spacing.sm }}
              />
              <Text style={styles.secondaryButtonText}>View Orders</Text>
            </TouchableOpacity>
          )}

          {isPickupOrder && orderId ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleViewPickupLocation}
            >
              <MapPin
                size={20}
                color={Colors.primary_blue}
                style={{ marginRight: Spacing.sm }}
              />
              <Text style={styles.secondaryButtonText}>
                View Pickup Location
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.heading2,
    color: Colors.darkTeal,
    textAlign: "center",
    marginBottom: Spacing.md,
    fontWeight: "700",
  },
  subtitle: {
    ...Typography.bodyMedium,
    color: Colors.mutedGray,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.lightMint,
    padding: Spacing.lg,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.xxl,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary_blue,
  },
  infoText: {
    ...Typography.bodySmall,
    color: Colors.darkTeal,
    marginLeft: Spacing.md,
    flex: 1,
  },
  warningBox: {
    width: "100%",
    backgroundColor: "#FFF7ED",
    borderColor: "#FB923C",
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  warningText: {
    ...Typography.bodySmall,
    color: "#9A3412",
    textAlign: "left",
    lineHeight: 20,
  },
  buttonContainer: {
    width: "100%",
    gap: Spacing.md,
  },
  primaryButton: {
    flexDirection: "row",
    backgroundColor: Colors.primary_green,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.medium,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  primaryButtonText: {
    ...Typography.bodyLarge,
    color: Colors.white,
    fontWeight: "600",
  },
  secondaryButton: {
    flexDirection: "row",
    backgroundColor: Colors.white,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.medium,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.primary_blue,
  },
  secondaryButtonText: {
    ...Typography.bodyLarge,
    color: Colors.primary_blue,
    fontWeight: "600",
  },
});

export default PaymentSuccess;
