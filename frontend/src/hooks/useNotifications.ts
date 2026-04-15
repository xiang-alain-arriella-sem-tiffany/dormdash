import { useEffect, useRef, useCallback } from "react";
import { Platform, AppState, AppStateStatus } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponse,
} from "../lib/notifications";

type NavigationProp = NativeStackNavigationProp<{
  MainTabs: { screen?: string };
  PastOrders: undefined;
  OrderDetails: { orderId: number };
  DeliveryDetail: { deliveryOrderId: number };
}>;

interface NotificationData {
  type?: string;
  deliveryOrderId?: number;
  orderId?: number;
  screen?: string;
}

export function useNotifications() {
  const navigation = useNavigation<NavigationProp>();
  const notificationReceivedRef =
    useRef<Notifications.EventSubscription | null>(null);
  const notificationResponseRef =
    useRef<Notifications.EventSubscription | null>(null);
  const hasCheckedInitialRef = useRef(false);

  const handleNotificationNavigation = useCallback(
    (data: NotificationData | undefined) => {
      if (!data) return;

      const { type, deliveryOrderId, orderId, screen } = data;

      // Handle different notification types
      switch (type) {
        case "seller_item_bought":
        case "seller_item_picked_up":
        case "seller_item_delivered":
          // Sellers go to their past orders/sales
          navigation.navigate("PastOrders");
          break;

        case "buyer_item_picked_up":
        case "buyer_item_delivered":
          // Buyers go to order details
          if (orderId) {
            navigation.navigate("OrderDetails", { orderId });
          } else {
            navigation.navigate("PastOrders");
          }
          break;

        case "dasher_new_delivery":
          // Dashers go to the delivery detail or dashboard
          if (deliveryOrderId) {
            navigation.navigate("DeliveryDetail", { deliveryOrderId });
          } else {
            navigation.navigate("MainTabs", { screen: "DashTab" });
          }
          break;

        default:
          // Generic fallback based on screen hint
          if (screen === "OrderDetails" && orderId) {
            navigation.navigate("OrderDetails", { orderId });
          } else if (screen === "DeliveryDetail" && deliveryOrderId) {
            navigation.navigate("DeliveryDetail", { deliveryOrderId });
          } else if (screen === "DashTab") {
            navigation.navigate("MainTabs", { screen: "DashTab" });
          } else if (screen === "PastOrders") {
            navigation.navigate("PastOrders");
          }
      }
    },
    [navigation],
  );

  useEffect(() => {
    if (Platform.OS === "web") return;

    // Register for push notifications on mount
    registerForPushNotifications().then((result) => {
      if (!result.success && result.error) {
        console.log("Push notification registration:", result.error);
      }
    });

    // Handle notifications received while app is in foreground
    notificationReceivedRef.current = addNotificationReceivedListener(
      (notification) => {
        // Optionally show an in-app toast or banner
        const { title, body } = notification.request.content;
        console.log("Notification received:", title, body);
        // The notification handler already shows the system notification
      },
    );

    // Handle notification taps (user interaction)
    notificationResponseRef.current = addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content
          .data as NotificationData;
        handleNotificationNavigation(data);
      },
    );

    // Check for notification that launched the app (cold start)
    const checkInitialNotification = async () => {
      if (hasCheckedInitialRef.current) return;
      hasCheckedInitialRef.current = true;

      const response = await getLastNotificationResponse();
      if (response) {
        const data = response.notification.request.content
          .data as NotificationData;
        // Small delay to ensure navigation is ready
        setTimeout(() => {
          handleNotificationNavigation(data);
        }, 500);
      }
    };

    checkInitialNotification();

    // Re-register when app comes to foreground (handles token refresh)
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state: AppStateStatus) => {
        if (state === "active") {
          registerForPushNotifications();
        }
      },
    );

    return () => {
      notificationReceivedRef.current?.remove();
      notificationResponseRef.current?.remove();
      appStateSubscription.remove();
    };
  }, [handleNotificationNavigation]);
}
