// =============================
//      CART.TSX (FINAL)
//   Supabase-Connected Cart with React Query
// =============================

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StatusBar,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CheckSquare,
  Square,
  Minus,
  Plus,
  Trash2,
  ImageIcon,
  ArrowRight,
  BookmarkPlus,
  RotateCcw,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  WebLayout,
} from "../assets/styles";
import { alert } from "../lib/utils/platform";
import EmptyState from "../components/EmptyState";
import { CartItemSkeleton } from "../components/SkeletonLoader";
import {
  SectionHeader,
  StatusPill,
  StickyActionBar,
  SurfaceCard,
} from "../components";
import {
  formatStockLabel,
  isListingAvailable,
  type ListingCondition,
  type ListingStatus,
} from "../lib/utils/listings";
import {
  addSavedCartToCart,
  createSavedCartFromCurrentCart,
  fetchSavedCarts,
  summarizeBatchResults,
} from "../lib/api/repeatBuying";
import type { SavedCart } from "../types/repeatBuying";

type CartNavigationProp = NativeStackNavigationProp<{
  Checkout: { selectedItems: CartItem[] };
  SavedCarts: undefined;
}>;

interface CartItem {
  id: number; // cart_items table id
  listing_id: number;
  title: string;
  price_cents: number;
  image_url?: string | null;
  quantity: number;
  available_quantity?: number | null;
  condition?: ListingCondition | null;
  status?: ListingStatus | null;
}

const Cart: React.FC = () => {
  const navigation = useNavigation<CartNavigationProp>();
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [saveRoutineVisible, setSaveRoutineVisible] = useState(false);
  const [loadRoutineVisible, setLoadRoutineVisible] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [loadingRoutines, setLoadingRoutines] = useState(false);
  const [applyingRoutineId, setApplyingRoutineId] = useState<number | null>(
    null,
  );
  const [savedCarts, setSavedCarts] = useState<SavedCart[]>([]);

  // Get user ID on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id || null);
    });
  }, []);

  // React Query for cart data - instant on return visits
  const { data: cartData, isLoading: loading } = useQuery({
    queryKey: ["cart", userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from("cart_items")
        .select(
          `
          id,
          listing_id,
          quantity,
          listings (
            id,
            title,
            price_cents,
            available_quantity,
            condition,
            status,
            listing_images ( url )
          )
        `,
        )
        .eq("user_id", userId);

      if (error) {
        console.error("Error loading cart:", error);
        return [];
      }

      return data.map((item: any) => ({
        id: item.id,
        listing_id: item.listing_id,
        title: item.listings.title,
        price_cents: item.listings.price_cents,
        quantity: item.quantity,
        available_quantity: item.listings.available_quantity ?? 0,
        condition: item.listings.condition ?? null,
        status: item.listings.status ?? "active",
        image_url: item.listings.listing_images?.[0]?.url ?? null,
      }));
    },
    enabled: !!userId,
  });

  // Sync React Query data to local state
  useEffect(() => {
    if (cartData) {
      setCartItems(cartData);
      setSelectedItems(
        cartData
          .filter((item) =>
            isListingAvailable({
              available_quantity: item.available_quantity,
              status: item.status,
            }),
          )
          .map((i) => i.id),
      );
    }
  }, [cartData]);

  // Toggle select/unselect item
  const toggleItemSelection = (itemId: number) => {
    if (selectedItems.includes(itemId)) {
      setSelectedItems(selectedItems.filter((id) => id !== itemId));
    } else {
      setSelectedItems([...selectedItems, itemId]);
    }
  };

  // Update quantity in Supabase
  const updateQuantity = async (cartItemId: number, change: number) => {
    const item = cartItems.find((i) => i.id === cartItemId);
    if (!item) return;

    const maxQty = Math.max(1, Number(item.available_quantity || 1));
    const newQty = Math.min(maxQty, Math.max(1, item.quantity + change));

    if (newQty === item.quantity) {
      if (change > 0) {
        alert(
          "Stock limit",
          `Only ${formatStockLabel(item.available_quantity)}.`,
        );
      }
      return;
    }

    const { error } = await supabase
      .from("cart_items")
      .update({ quantity: newQty })
      .eq("id", cartItemId);

    if (error) {
      console.error("Error updating quantity:", error);
      return;
    }

    setCartItems(
      cartItems.map((i) =>
        i.id === cartItemId ? { ...i, quantity: newQty } : i,
      ),
    );

    // Keep cache in sync
    queryClient.invalidateQueries({ queryKey: ["cart", userId] });
  };

  // Remove item from Supabase
  const removeItem = (cartItemId: number) => {
    alert("Remove Item", "Are you sure you want to remove this item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await supabase.from("cart_items").delete().eq("id", cartItemId);

          setCartItems(cartItems.filter((i) => i.id !== cartItemId));
          setSelectedItems(selectedItems.filter((id) => id !== cartItemId));

          // Invalidate cart cache
          queryClient.invalidateQueries({ queryKey: ["cart", userId] });
        },
      },
    ]);
  };

  const calculateSubtotal = () => {
    return cartItems
      .filter((item) => selectedItems.includes(item.id))
      .reduce((sum, item) => sum + item.price_cents * item.quantity, 0);
  };

  // Philadelphia sales tax rate: 8%
  const PHILLY_TAX_RATE = 0.08;

  const calculateTax = () => {
    return Math.round(calculateSubtotal() * PHILLY_TAX_RATE);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  const handleCheckout = () => {
    const itemsToCheckout = cartItems.filter((item) =>
      selectedItems.includes(item.id),
    );
    const unavailableItems = itemsToCheckout.filter(
      (item) =>
        !isListingAvailable({
          available_quantity: item.available_quantity,
          status: item.status,
        }) || item.quantity > Number(item.available_quantity || 0),
    );

    if (itemsToCheckout.length === 0) {
      alert("No Items Selected", "Please select at least one item.");
      return;
    }

    if (unavailableItems.length > 0) {
      alert(
        "Update your cart",
        "One or more selected items are sold out or exceed the remaining stock.",
      );
      return;
    }

    navigation.navigate("Checkout", { selectedItems: itemsToCheckout });
  };

  const formatPrice = (priceCents: number) => {
    return (priceCents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  };

  const loadSavedRoutines = async () => {
    try {
      setLoadingRoutines(true);
      const rows = await fetchSavedCarts();
      setSavedCarts(rows);
    } catch (error) {
      console.error("Error loading saved routines:", error);
      alert("Error", "Couldn't load your saved routines.");
    } finally {
      setLoadingRoutines(false);
    }
  };

  const handleSaveRoutine = async () => {
    const trimmed = routineName.trim();
    if (!trimmed) {
      alert("Name required", "Please enter a name for this routine.");
      return;
    }

    try {
      setSavingRoutine(true);
      await createSavedCartFromCurrentCart(trimmed);
      setSaveRoutineVisible(false);
      setRoutineName("");
      alert("Saved", `"${trimmed}" is ready in your routines.`);
      void loadSavedRoutines();
    } catch (error: any) {
      console.error("Error saving routine:", error);
      const message =
        typeof error?.message === "string" &&
        error.message.toLowerCase().includes("empty cart")
          ? "Your cart is empty. Add at least one item first."
          : "Couldn't save routine right now.";
      alert("Error", message);
    } finally {
      setSavingRoutine(false);
    }
  };

  const handleOpenLoadRoutine = () => {
    setLoadRoutineVisible(true);
    void loadSavedRoutines();
  };

  const handleApplyRoutine = async (savedCart: SavedCart) => {
    if (applyingRoutineId) return;

    try {
      setApplyingRoutineId(savedCart.id);
      const rows = await addSavedCartToCart(savedCart.id);
      const summary = summarizeBatchResults(rows);
      const message =
        summary.total === 0 || summary.skipped === summary.total
          ? "No available items from this routine could be added."
          : [
              `${summary.added + summary.merged} item${summary.added + summary.merged === 1 ? "" : "s"} added to cart.`,
              summary.skipped > 0
                ? `${summary.skipped} unavailable item${summary.skipped === 1 ? "" : "s"} skipped.`
                : null,
            ]
              .filter(Boolean)
              .join(" ");

      alert("Routine loaded", message);
      setLoadRoutineVisible(false);
      queryClient.invalidateQueries({ queryKey: ["cart", userId] });
    } catch (error) {
      console.error("Error applying routine:", error);
      alert("Error", "Couldn't add this routine to cart.");
    } finally {
      setApplyingRoutineId(null);
    }
  };

  // Loading State
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View
          style={[
            styles.header,
            { paddingTop: Math.max(insets.top, Spacing.lg) },
            isWeb && styles.webHeader,
          ]}
        >
          <View
            style={[styles.headerContent, isWeb && styles.webHeaderContent]}
          >
            <Text style={styles.headerTitle}>Shopping Cart</Text>
          </View>
        </View>
        <View style={styles.scrollContent}>
          <CartItemSkeleton />
          <CartItemSkeleton />
          <CartItemSkeleton />
        </View>
      </View>
    );
  }

  // Empty Cart
  if (cartItems.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View
          style={[
            styles.header,
            { paddingTop: Math.max(insets.top, Spacing.lg) },
            isWeb && styles.webHeader,
          ]}
        >
          <View
            style={[styles.headerContent, isWeb && styles.webHeaderContent]}
          >
            <Text style={styles.headerTitle}>Shopping Cart</Text>
          </View>
        </View>
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          subtitle="Add items to your cart to get started shopping!"
        />
      </View>
    );
  }

  // Main Cart UI
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top, Spacing.lg) },
          isWeb && styles.webHeader,
        ]}
      >
        <View style={[styles.headerContent, isWeb && styles.webHeaderContent]}>
          <SectionHeader
            title="Shopping Cart"
            subtitle={`${cartItems.length} item${cartItems.length !== 1 ? "s" : ""}`}
            rightSlot={
              <StatusPill
                label={`${selectedItems.length} selected`}
                tone="info"
              />
            }
          />
        </View>
      </View>

      {/* Cart Items */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isWeb && styles.webScrollContent,
        ]}
      >
        <SurfaceCard variant="glass" style={styles.selectionInsightCard}>
          <Text style={styles.selectionInsightTitle}>Ready to checkout</Text>
          <Text style={styles.selectionInsightText}>
            Items stay selected as you adjust quantities.
          </Text>
          <View style={styles.routineRow}>
            <TouchableOpacity
              style={styles.routineButton}
              onPress={() => setSaveRoutineVisible(true)}
            >
              <BookmarkPlus color={Colors.darkTeal} size={14} />
              <Text style={styles.routineButtonText}>Save Routine</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.routineButton}
              onPress={handleOpenLoadRoutine}
            >
              <RotateCcw color={Colors.darkTeal} size={14} />
              <Text style={styles.routineButtonText}>Load Routine</Text>
            </TouchableOpacity>
          </View>
        </SurfaceCard>

        {cartItems.map((item) => {
          const itemAvailable = isListingAvailable({
            available_quantity: item.available_quantity,
            status: item.status,
          });

          return (
            <SurfaceCard
              key={item.id}
              variant="default"
              style={styles.cartItemCard}
            >
              {/* Checkbox */}
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => toggleItemSelection(item.id)}
                disabled={!itemAvailable}
              >
                {selectedItems.includes(item.id) ? (
                  <CheckSquare color={Colors.primary_blue} size={20} />
                ) : (
                  <Square color={Colors.mutedGray} size={20} />
                )}
              </TouchableOpacity>

              {/* Image */}
              <View style={styles.itemImage}>
                {item.image_url ? (
                  <Image
                    source={{ uri: item.image_url }}
                    style={styles.image}
                  />
                ) : (
                  <ImageIcon size={40} color={Colors.mutedGray} />
                )}
              </View>

              {/* Details */}
              <View style={styles.itemDetails}>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.itemPrice}>
                  {formatPrice(item.price_cents)}
                </Text>
                <Text
                  style={[
                    styles.itemMetaText,
                    !itemAvailable && styles.itemUnavailableText,
                  ]}
                >
                  {itemAvailable
                    ? formatStockLabel(item.available_quantity)
                    : "Unavailable"}
                </Text>

                {/* Quantity */}
                <View style={styles.quantityContainer}>
                  <TouchableOpacity
                    style={styles.quantityButton}
                    onPress={() => updateQuantity(item.id, -1)}
                    disabled={!itemAvailable}
                  >
                    <Minus color={Colors.darkTeal} size={18} />
                  </TouchableOpacity>

                  <Text style={styles.quantityText}>{item.quantity}</Text>

                  <TouchableOpacity
                    style={styles.quantityButton}
                    onPress={() => updateQuantity(item.id, 1)}
                    disabled={!itemAvailable}
                  >
                    <Plus color={Colors.darkTeal} size={18} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Remove */}
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeItem(item.id)}
              >
                <Trash2 color={Colors.error} size={24} />
              </TouchableOpacity>
            </SurfaceCard>
          );
        })}

        {/* Breakdown moved to ScrollView for better space efficiency */}
        <View style={styles.breakdownContainer}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Subtotal ({selectedItems.length} item
              {selectedItems.length !== 1 ? "s" : ""})
            </Text>
            <Text style={styles.summaryValue}>
              {formatPrice(calculateSubtotal())}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Philadelphia Tax (8%)</Text>
            <Text style={styles.summaryValue}>
              {formatPrice(calculateTax())}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Checkout Summary (Compact Fixed Footer) */}
      <StickyActionBar
        style={[styles.checkoutContainer, isWeb && styles.webCheckoutContainer]}
      >
        <View
          style={[styles.checkoutContent, isWeb && styles.webCheckoutContent]}
        >
          <View style={styles.summaryRowCompact}>
            <View>
              <Text style={styles.totalLabelSmall}>Total</Text>
              <Text style={styles.totalValue}>
                {formatPrice(calculateTotal())}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.checkoutButton,
                selectedItems.length === 0 && styles.checkoutButtonDisabled,
                isWeb && styles.webButton,
              ]}
              onPress={handleCheckout}
              disabled={selectedItems.length === 0}
            >
              <Text style={styles.checkoutButtonText}>Checkout</Text>
              <ArrowRight color={Colors.white} size={20} />
            </TouchableOpacity>
          </View>
        </View>
      </StickyActionBar>

      <Modal
        visible={saveRoutineVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveRoutineVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save current cart</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Routine name (ex: Weekday Lunch)"
              value={routineName}
              onChangeText={setRoutineName}
              maxLength={60}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setSaveRoutineVisible(false)}
                disabled={savingRoutine}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalPrimaryButton}
                onPress={() => void handleSaveRoutine()}
                disabled={savingRoutine}
              >
                {savingRoutine ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={loadRoutineVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLoadRoutineVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Load routine</Text>
            {loadingRoutines ? (
              <ActivityIndicator
                style={{ marginVertical: Spacing.md }}
                color={Colors.primary_blue}
              />
            ) : savedCarts.length === 0 ? (
              <Text style={styles.modalEmptyText}>
                No routines yet. Save your current cart first.
              </Text>
            ) : (
              <ScrollView style={styles.routineList}>
                {savedCarts.map((savedCart) => (
                  <TouchableOpacity
                    key={savedCart.id}
                    style={styles.routineListItem}
                    onPress={() => void handleApplyRoutine(savedCart)}
                    disabled={applyingRoutineId === savedCart.id}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.routineListName}>
                        {savedCart.name}
                      </Text>
                      <Text style={styles.routineListMeta}>
                        {savedCart.item_count} item
                        {savedCart.item_count === 1 ? "" : "s"}
                      </Text>
                    </View>
                    {applyingRoutineId === savedCart.id ? (
                      <ActivityIndicator
                        color={Colors.primary_blue}
                        size="small"
                      />
                    ) : (
                      <Text style={styles.routineListAction}>Add</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setLoadRoutineVisible(false)}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={() => {
                  setLoadRoutineVisible(false);
                  navigation.navigate("SavedCarts");
                }}
              >
                <Text style={styles.modalSecondaryText}>Manage</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Filler for behind the floating tab bar */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 90,
          backgroundColor: Colors.base_bg,
          zIndex: -1,
        }}
      />
    </View>
  );
};

export default Cart;

// --------------------
//     STYLES (same)
// --------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.base_bg,
  },
  header: {
    paddingBottom: Spacing.md,
    backgroundColor: Colors.base_bg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  webHeader: {
    alignItems: "center",
  },
  headerContent: {
    paddingHorizontal: Spacing.lg,
    width: "100%",
  },
  webHeaderContent: {
    maxWidth: WebLayout.maxContentWidth,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: Typography.heading3.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  itemCount: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 200, // Reduced padding since footer is smaller
  },
  selectionInsightCard: {
    marginBottom: Spacing.md,
  },
  selectionInsightTitle: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  selectionInsightText: {
    fontSize: 13,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
  },
  routineRow: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    gap: Spacing.sm,
  },
  routineButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  routineButtonText: {
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.darkTeal,
    fontWeight: "700",
  },
  webScrollContent: {
    alignSelf: "center",
    width: "100%",
    maxWidth: WebLayout.maxContentWidth,
  },
  cartItemCard: {
    flexDirection: "row",
    padding: Spacing.xs,
    marginBottom: Spacing.md,
    alignItems: "center",
  },
  webButton: {
    cursor: "pointer",
  } as any,
  checkbox: {
    marginRight: Spacing.xs,
  },
  itemImage: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.medium,
    backgroundColor: Colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: BorderRadius.medium,
  },
  itemDetails: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontFamily: Typography.bodyLarge.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
    marginBottom: 4,
    marginTop: 4,
  },
  itemPrice: {
    fontSize: 15,
    fontFamily: Typography.bodyLarge.fontFamily,
    fontWeight: "700",
    color: Colors.primary_blue,
    marginBottom: Spacing.sm,
  },
  itemMetaText: {
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    marginBottom: Spacing.xs,
  },
  itemUnavailableText: {
    color: Colors.error,
    fontWeight: "700",
  },
  quantityContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  quantityButton: {
    width: 20,
    height: 20,
    borderRadius: BorderRadius.medium, // 8px (was 14)
    backgroundColor: Colors.white,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.lightGray,
  },
  quantityText: {
    fontSize: 15,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
    marginHorizontal: Spacing.md,
    minWidth: 30,
    textAlign: "center",
  },
  removeButton: {
    padding: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  breakdownContainer: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.lightGray,
  },
  checkoutContainer: {
    bottom: 90, // Raised to sit above floating tab bar
    paddingVertical: Spacing.md,
  },
  webCheckoutContainer: {
    alignItems: "center",
  },
  checkoutContent: {
    paddingHorizontal: Spacing.lg,
    width: "100%",
  },
  webCheckoutContent: {
    maxWidth: WebLayout.maxContentWidth,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm, // Reduced margin
  },
  summaryRowCompact: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 14, // Smaller font
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 14, // Smaller font
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
  },
  totalLabelSmall: {
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
    marginBottom: 2,
  },
  totalValue: {
    fontSize: 20,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.primary_blue,
  },
  checkoutButton: {
    backgroundColor: Colors.primary_blue,
    paddingVertical: Spacing.sm + 2, // Reduced padding
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.medium,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    elevation: 3,
  },
  checkoutButtonDisabled: {
    backgroundColor: Colors.mutedGray,
    opacity: 0.5,
  },
  checkoutButtonText: {
    fontSize: 16, // Slightly smaller
    fontFamily: Typography.buttonText.fontFamily,
    fontWeight: "700",
    color: Colors.white,
    marginRight: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.large,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.lightGray,
    color: Colors.darkTeal,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontSize: 15,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
  },
  modalCancelButton: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 4,
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "600",
    color: Colors.darkTeal,
  },
  modalPrimaryButton: {
    backgroundColor: Colors.primary_blue,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 4,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 70,
  },
  modalPrimaryText: {
    fontSize: 14,
    fontFamily: Typography.buttonText.fontFamily,
    fontWeight: "700",
    color: Colors.white,
  },
  modalSecondaryButton: {
    backgroundColor: Colors.primary_accent,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 4,
  },
  modalSecondaryText: {
    fontSize: 14,
    fontFamily: Typography.buttonText.fontFamily,
    color: Colors.white,
    fontWeight: "700",
  },
  modalEmptyText: {
    fontSize: 13,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
  },
  routineList: {
    maxHeight: 280,
  },
  routineListItem: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.lightGray,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  routineListName: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
  },
  routineListMeta: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: Typography.bodySmall.fontFamily,
    color: Colors.mutedGray,
  },
  routineListAction: {
    fontSize: 13,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.primary_blue,
    fontWeight: "700",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xxxl,
  },
  emptyText: {
    fontSize: 24,
    fontFamily: Typography.heading4.fontFamily,
    fontWeight: "700",
    color: Colors.darkTeal,
    marginTop: Spacing.xl,
    marginBottom: Spacing.xs,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    color: Colors.mutedGray,
    textAlign: "center",
  },
});
