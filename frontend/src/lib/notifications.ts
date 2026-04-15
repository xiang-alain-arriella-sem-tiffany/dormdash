import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// Configure notification handling behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushTokenResult {
  success: boolean;
  token?: string;
  error?: string;
}

/**
 * Request notification permissions and get the Expo push token.
 * Registers the token with Supabase if successful.
 */
export async function registerForPushNotifications(): Promise<PushTokenResult> {
  // Push notifications don't work on web
  if (Platform.OS === "web") {
    return { success: false, error: "Push notifications not supported on web" };
  }

  // Must be a physical device
  if (!Device.isDevice) {
    return {
      success: false,
      error: "Push notifications require a physical device",
    };
  }

  try {
    // Check existing permissions
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not already granted
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      return { success: false, error: "Notification permission not granted" };
    }

    // Get project ID for Expo push token
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn("No EAS project ID found, using fallback");
    }

    // Get the push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;

    // Register token with Supabase
    const { data: user } = await supabase.auth.getUser();
    if (user?.user) {
      const { error: rpcError } = await supabase.rpc("upsert_push_token", {
        p_token: token,
        p_platform: Platform.OS,
        p_device_id: Device.deviceName || null,
      });

      if (rpcError) {
        console.error("Error registering push token:", rpcError);
        return { success: false, token, error: rpcError.message };
      }
    }

    // Configure Android notification channel
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("delivery-updates", {
        name: "Delivery Updates",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#3B82F6",
      });
    }

    return { success: true, token };
  } catch (error) {
    console.error("Error registering for push notifications:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Deactivate the push token (e.g., on logout)
 */
export async function deactivatePushToken(): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    await supabase.rpc("deactivate_push_token", {
      p_token: tokenData.data,
    });
  } catch (error) {
    console.warn("Error deactivating push token:", error);
  }
}

/**
 * Add listener for notifications received while app is foregrounded
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add listener for notification responses (user tapped notification)
 */
export function addNotificationResponseReceivedListener(
  callback: (response: Notifications.NotificationResponse) => void,
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Get the last notification response (for handling cold-start from notification)
 */
export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  return await Notifications.getLastNotificationResponseAsync();
}

/**
 * Clear all delivered notifications
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
}

/**
 * Set the badge count (iOS only)
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}
