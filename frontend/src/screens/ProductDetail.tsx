import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  Platform,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
} from "react-native";
import {
  Star,
  ArrowLeft,
  MoreVertical,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  User,
  ShoppingCart,
  MessageCircle,
  Heart,
  Flag,
  Minus,
  Plus,
  ShieldCheck,
  Check,
} from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useReviews } from "../lib/api/queries";
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  WebLayout,
} from "../assets/styles";
import { alert } from "../lib/utils/platform";
import { StatusPill, StickyActionBar, SurfaceCard } from "../components";
import { SafeAreaView } from "react-native-safe-area-context";
import { getOrCreateConversation } from "../lib/api/messages";
import {
  savedListingQueryKeys,
  toggleSavedListing,
  useSavedListingIds,
} from "../lib/api/savedListings";
import {
  formatStockLabel,
  getListingConditionLabel,
  getListingStatusLabel,
  isListingAvailable,
  type ListingCondition,
  type ListingStatus,
} from "../lib/utils/listings";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const isWeb = Platform.OS === "web";
const IMAGE_MAX_WIDTH = 600; // Max width for images on web

type MainStackParamList = {
  ProductDetail: { listingId: number };
  EditListing: { listingId: number };
  PaymentPortal: { priceCents: number; listingTitle: string };
  Conversation: { conversationId: number; listingId?: number };
};

type ProductDetailProps = NativeStackScreenProps<
  MainStackParamList,
  "ProductDetail"
>;

interface Listing {
  id: number;
  user_id: string;
  title: string;
  description: string;
  price_cents: number;
  available_quantity: number;
  condition?: ListingCondition | null;
  status?: ListingStatus | null;
  type: string;
  category_id: number;
  categories?: { name: string } | null;
  listing_images: { url: string }[];
}

interface UserProfile {
  id: string;
  username: string;
  avatar_url?: string;
  rating?: number;
  review_count?: number;
  active_listings_count?: number;
  member_since?: string | null;
}

interface Review {
  id: number;
  listing_id: number;
  reviewer_id: string;
  rating: number;
  comment?: string;
  created_at: string;
  reviewer_name?: string;
  verified_purchase?: boolean;
}

const REPORT_REASONS = ["Spam", "Scam", "Inaccurate", "Unsafe"] as const;

export default function ProductDetail({
  route,
  navigation,
}: ProductDetailProps) {
  const { listingId } = route.params;
  const queryClient = useQueryClient();
  const { width: windowWidth } = useWindowDimensions();
  const isPhoneWeb = isWeb && windowWidth < WebLayout.breakpoints.sm;
  const isWideWeb = isWeb && windowWidth >= WebLayout.breakpoints.lg;

  const [imageIndex, setImageIndex] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [openingConversation, setOpeningConversation] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [savingListing, setSavingListing] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportReason, setReportReason] = useState("Spam");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const imageScrollRef = useRef<ScrollView>(null);
  const addToCartScale = useRef(new Animated.Value(1)).current;
  const { data: savedListingIds = [] } = useSavedListingIds();

  // React Query for listing data - instant on return visits
  const { data: listing, isLoading: listingLoading } = useQuery({
    queryKey: ["listing", listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*, listing_images(url), categories(name)")
        .eq("id", listingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // React Query for seller profile
  const { data: seller } = useQuery({
    queryKey: ["seller", listing?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_profiles")
        .select(
          "id, display_name, username, avatar_url, avg_rating, total_reviews, active_listings_count, member_since",
        )
        .eq("id", listing!.user_id)
        .single();

      if (error) {
        return {
          id: listing!.user_id,
          display_name: "Seller",
          avatar_url: null,
          avg_rating: 0,
          total_reviews: 0,
          active_listings_count: 0,
          member_since: null,
        };
      }
      return data;
    },
    enabled: !!listing?.user_id,
    select: (data) => ({
      id: data.id,
      username: data.display_name || "Seller",
      avatar_url: data.avatar_url || undefined,
      rating: parseFloat(data.avg_rating) || 0,
      review_count: data.total_reviews || 0,
      active_listings_count: Number(data.active_listings_count || 0),
      member_since: data.member_since || null,
    }),
  });

  // React Query for reviews (now includes reviewer names and verified purchase status)
  const { data: reviews = [] } = useReviews(listingId);

  const loading = listingLoading;
  const availableQuantity = Math.max(
    0,
    Number(listing?.available_quantity ?? 0),
  );
  const isSaved = savedListingIds.includes(Number(listingId));
  const listingAvailable = listing
    ? isListingAvailable({
        status: listing.status,
        available_quantity: availableQuantity,
      })
    : false;

  // Check if current user is owner
  useEffect(() => {
    const checkOwnership = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && listing?.user_id === user.id) {
        setIsOwner(true);
      }
    };
    if (listing) checkOwnership();
  }, [listing]);

  useEffect(() => {
    if (!listing) return;
    setSelectedQuantity((current) =>
      Math.min(Math.max(1, current), Math.max(1, availableQuantity || 1)),
    );
  }, [listing, availableQuantity]);

  const handleImageScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SCREEN_WIDTH);
    if (newIndex !== imageIndex && listing?.listing_images) {
      setImageIndex(
        Math.max(0, Math.min(newIndex, listing.listing_images.length - 1)),
      );
    }
  };

  const scrollToImage = (index: number) => {
    if (listing?.listing_images) {
      const clampedIndex = Math.max(
        0,
        Math.min(index, listing.listing_images.length - 1),
      );
      // On web, just update the index (no scrolling needed)
      // On mobile, scroll the ScrollView
      if (!isWeb && imageScrollRef.current) {
        imageScrollRef.current.scrollTo({
          x: clampedIndex * SCREEN_WIDTH,
          animated: true,
        });
      }
      setImageIndex(clampedIndex);
    }
  };

  const handleAddToCart = async () => {
    // Animate button press
    Animated.sequence([
      Animated.timing(addToCartScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(addToCartScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      setAddingToCart(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        setAddingToCart(false);
        alert("Login Required", "You must be logged in to add to cart.");
        return;
      }

      if (!listing || !listingAvailable) {
        alert("Unavailable", "This listing is no longer available.");
        return;
      }

      // Check if item already exists in cart
      const { data: existing, error: existingError } = await supabase
        .from("cart_items")
        .select("*")
        .eq("user_id", userId)
        .eq("listing_id", listing.id)
        .maybeSingle();

      if (existingError) {
        console.error("Error checking cart:", existingError);
        return;
      }

      // If in cart → increment quantity
      if (existing) {
        if (existing.quantity + selectedQuantity > availableQuantity) {
          alert(
            "Stock limit",
            `Only ${formatStockLabel(availableQuantity)} for this listing.`,
          );
          return;
        }

        const { error: updateError } = await supabase
          .from("cart_items")
          .update({ quantity: existing.quantity + selectedQuantity })
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        if (selectedQuantity > availableQuantity) {
          alert(
            "Stock limit",
            `Only ${formatStockLabel(availableQuantity)} for this listing.`,
          );
          return;
        }

        const { error: insertError } = await supabase
          .from("cart_items")
          .insert({
            user_id: userId,
            listing_id: listing.id,
            quantity: selectedQuantity,
          });

        if (insertError) throw insertError;
      }

      alert(
        "Added to Cart",
        selectedQuantity === 1
          ? `${listing.title} was added to your cart.`
          : `${selectedQuantity} of ${listing.title} were added to your cart.`,
        [
          { text: "Continue", style: "cancel" },
          {
            text: "View Cart",
            onPress: () =>
              navigation.navigate("MainTabs" as any, { screen: "CartTab" }),
          },
        ],
      );

      // Invalidate cart cache so Cart screen shows updated data immediately
      queryClient.invalidateQueries({ queryKey: ["cart", userId] });
    } catch (error) {
      console.error("Add to cart error:", error);
      alert("Error", "Could not add item to cart.");
    } finally {
      setAddingToCart(false);
    }
  };

  const handleSubmitReview = async () => {
    try {
      if (!reviewComment.trim() && reviewRating === 0) {
        alert("Error", "Please provide a rating or comment");
        return;
      }

      setSubmittingReview(true);

      const { data: userData } = await supabase.auth.getSession();
      const userId = userData.session?.user?.id;

      if (!userId) {
        alert("Error", "You must be logged in to leave a review");
        return;
      }

      const { error } = await supabase.from("reviews").insert([
        {
          listing_id: listingId,
          reviewer_id: userId,
          rating: reviewRating,
          comment: reviewComment.trim() || null,
        },
      ]);

      if (error) throw error;

      // Reset form
      setReviewComment("");
      setReviewRating(5);

      // Refresh reviews cache
      queryClient.invalidateQueries({ queryKey: ["reviews", listingId] });
      queryClient.invalidateQueries({ queryKey: ["seller", listing?.user_id] });

      alert("Success", "Your review has been posted!");
    } catch (error) {
      console.error("Error submitting review:", error);
      alert("Error", "Failed to submit review. Please try again.");
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleMessageSeller = async () => {
    if (!listing) return;
    if (isOwner || openingConversation) return;

    try {
      setOpeningConversation(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("Login Required", "Please log in to message the seller.");
        return;
      }

      const conversation = await getOrCreateConversation(Number(listing.id));
      navigation.navigate("Conversation", {
        conversationId: Number(conversation.id),
        listingId: Number(listing.id),
      });
    } catch (error: any) {
      console.error("Unable to open conversation:", error);
      alert(
        "Unable to start chat",
        error?.message || "Please try again in a moment.",
      );
    } finally {
      setOpeningConversation(false);
    }
  };

  const handleEditListing = () => {
    setMenuVisible(false);
    navigation.navigate("EditListing", { listingId });
  };

  const handleDeleteListing = () => {
    setMenuVisible(false);
    alert(
      "Delete Listing",
      "Are you sure you want to delete this listing? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeleting(true);

              // Delete related records first (due to foreign key constraints)
              await supabase
                .from("listing_images")
                .delete()
                .eq("listing_id", listingId);

              await supabase
                .from("listing_tags")
                .delete()
                .eq("listing_id", listingId);

              await supabase
                .from("reviews")
                .delete()
                .eq("listing_id", listingId);

              await supabase
                .from("cart_items")
                .delete()
                .eq("listing_id", listingId);

              // Invalidate cart cache after deleting cart items
              queryClient.invalidateQueries({ queryKey: ["cart"] });

              // Delete the listing itself
              const { error } = await supabase
                .from("listings")
                .delete()
                .eq("id", listingId);

              if (error) throw error;

              alert("Success", "Listing has been deleted.", [
                { text: "OK", onPress: () => navigation.goBack() },
              ]);
            } catch (error) {
              console.error("Error deleting listing:", error);
              alert("Error", "Failed to delete listing. Please try again.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleToggleSaved = async () => {
    if (!listing || savingListing) return;

    try {
      setSavingListing(true);
      await toggleSavedListing(Number(listing.id));
      queryClient.invalidateQueries({ queryKey: savedListingQueryKeys.ids });
      queryClient.invalidateQueries({ queryKey: savedListingQueryKeys.list });
    } catch (error: any) {
      console.error("Save listing error:", error);
      alert("Error", error?.message || "Could not update saved items.");
    } finally {
      setSavingListing(false);
    }
  };

  const handleQuantityChange = (delta: number) => {
    if (!listingAvailable) return;
    setSelectedQuantity((current) =>
      Math.min(Math.max(1, current + delta), Math.max(1, availableQuantity)),
    );
  };

  const handleToggleAvailability = async () => {
    if (!listing) return;
    const nextStatus = listing.status === "sold" ? "active" : "sold";
    const nextQuantity =
      nextStatus === "sold" ? 0 : Math.max(1, availableQuantity || 1);

    try {
      setMenuVisible(false);
      const { error } = await supabase
        .from("listings")
        .update({
          status: nextStatus,
          available_quantity: nextQuantity,
        })
        .eq("id", listing.id);

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["listing", listing.id] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    } catch (error) {
      console.error("Update availability error:", error);
      alert("Error", "Could not update listing status.");
    }
  };

  const handleSubmitReport = async () => {
    if (!listing || submittingReport) return;

    try {
      setSubmittingReport(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("Login Required", "Please log in to report this listing.");
        return;
      }

      const { error } = await supabase.from("listing_reports").upsert(
        {
          reporter_id: user.id,
          listing_id: listing.id,
          reason: reportReason,
          details: reportDetails.trim() || null,
        },
        { onConflict: "reporter_id,listing_id" },
      );

      if (error) throw error;

      setReportVisible(false);
      setReportDetails("");
      alert("Report sent", "Thanks. We will review this listing.");
    } catch (error) {
      console.error("Listing report error:", error);
      alert("Error", "Could not submit the report right now.");
    } finally {
      setSubmittingReport(false);
    }
  };

  const calculateAverageRating = (): number => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce(
      (acc: number, review: Review) => acc + review.rating,
      0,
    );
    return sum / reviews.length;
  };

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={16}
            color={star <= rating ? "#FFB800" : Colors.lightGray}
            fill={star <= rating ? "#FFB800" : "transparent"}
          />
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator
          size="large"
          color={Colors.primary_blue}
          style={{ marginTop: 20 }}
        />
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <ArrowLeft size={24} color={Colors.darkTeal} />
          </TouchableOpacity>
        </View>
        <Text style={styles.errorText}>Product not found</Text>
      </SafeAreaView>
    );
  }

  const price = (listing.price_cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={[styles.header, isWeb && styles.headerWeb]}>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft size={24} color={Colors.darkTeal} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Details</Text>
        {isOwner ? (
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setMenuVisible(true)}
            disabled={deleting}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreVertical
              size={20}
              color={deleting ? Colors.lightGray : Colors.darkTeal}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerIconButtonSpacer} />
        )}
      </View>

      {/* Owner Menu Modal */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleEditListing}
            >
              <Pencil size={20} color={Colors.darkTeal} />
              <Text style={styles.menuItemText}>Edit Listing</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleToggleAvailability}
            >
              <Check size={20} color={Colors.primary_blue} />
              <Text style={styles.menuItemText}>
                {listing.status === "sold" ? "Mark Active" : "Mark Sold"}
              </Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleDeleteListing}
            >
              <Trash2 size={20} color={Colors.error || "#E74C3C"} />
              <Text style={[styles.menuItemText, styles.deleteText]}>
                Delete Listing
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWeb && styles.scrollContentWeb,
        ]}
      >
        {/* Image Carousel */}
        {listing.listing_images && listing.listing_images.length > 0 ? (
          <View
            style={[
              styles.imageCarouselContainer,
              isWeb && styles.imageCarouselContainerWeb,
              isWideWeb && styles.imageCarouselContainerWide,
            ]}
          >
            {isWeb ? (
              // Web: Show single image, switch with arrows/indicators
              <View
                style={[
                  styles.imageWrapper,
                  styles.imageWrapperWeb,
                  isWideWeb && styles.imageWrapperWebWide,
                ]}
              >
                <Image
                  source={{ uri: listing.listing_images[imageIndex]?.url }}
                  style={styles.productImage}
                  resizeMode="contain"
                />
              </View>
            ) : (
              // Mobile: Scrollable carousel
              <ScrollView
                ref={imageScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleImageScroll}
                scrollEventThrottle={16}
              >
                {listing.listing_images.map(
                  (img: { url: string }, index: number) => (
                    <View
                      key={index}
                      style={[styles.imageWrapper, { width: SCREEN_WIDTH }]}
                    >
                      <Image
                        source={{ uri: img.url }}
                        style={styles.productImage}
                        resizeMode="cover"
                      />
                    </View>
                  ),
                )}
              </ScrollView>
            )}

            {/* Arrow buttons */}
            {listing.listing_images.length > 1 && (
              <>
                {imageIndex > 0 && (
                  <TouchableOpacity
                    style={[styles.arrowButton, styles.arrowLeft]}
                    onPress={() => scrollToImage(imageIndex - 1)}
                  >
                    <ChevronLeft size={28} color={Colors.white} />
                  </TouchableOpacity>
                )}
                {imageIndex < listing.listing_images.length - 1 && (
                  <TouchableOpacity
                    style={[styles.arrowButton, styles.arrowRight]}
                    onPress={() => scrollToImage(imageIndex + 1)}
                  >
                    <ChevronRight size={28} color={Colors.white} />
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Indicators */}
            {listing.listing_images.length > 1 && (
              <View style={styles.imageIndicators}>
                {listing.listing_images.map((_: unknown, index: number) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.indicator,
                      index === imageIndex && styles.indicatorActive,
                    ]}
                    onPress={() => scrollToImage(index)}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View
            style={[
              styles.imageWrapper,
              isWeb && styles.imageWrapperWeb,
              isWideWeb && styles.imageWrapperWebWide,
            ]}
          >
            <Image
              source={require("../../assets/icon.png")}
              style={styles.productImage}
              resizeMode={isWeb ? "contain" : "cover"}
            />
          </View>
        )}

        {/* Product Info */}
        <View
          style={[
            styles.infoSection,
            isWeb && styles.sectionShellWeb,
            isWideWeb && styles.sectionShellWide,
          ]}
        >
          <Text style={styles.title}>{listing.title}</Text>
          <Text style={styles.price}>{price}</Text>

          <View style={styles.metaPillsRow}>
            {listing.categories?.name ? (
              <StatusPill label={listing.categories.name} tone="info" />
            ) : null}
            <StatusPill
              label={getListingConditionLabel(listing.condition)}
              tone="info"
            />
            <StatusPill
              label={formatStockLabel(availableQuantity)}
              tone={availableQuantity <= 1 ? "warning" : "success"}
            />
            <StatusPill
              label={getListingStatusLabel(listing.status)}
              tone={listingAvailable ? "success" : "warning"}
            />
            <StatusPill label="Campus Pickup" tone="success" />
          </View>

          <Text style={styles.description}>{listing.description}</Text>

          {!isOwner ? (
            <View style={styles.buyerActionRow}>
              <TouchableOpacity
                style={[
                  styles.secondaryInlineButton,
                  savingListing && styles.secondaryInlineButtonDisabled,
                ]}
                onPress={handleToggleSaved}
                disabled={savingListing}
              >
                <Heart
                  size={16}
                  color={Colors.primary_blue}
                  fill={isSaved ? Colors.primary_blue : "transparent"}
                />
                <Text style={styles.secondaryInlineButtonText}>
                  {isSaved ? "Saved" : "Save"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryInlineButton}
                onPress={() => setReportVisible(true)}
              >
                <Flag size={16} color={Colors.primary_blue} />
                <Text style={styles.secondaryInlineButtonText}>Report</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {isOwner ? (
            <View style={styles.ownerActionsRow}>
              <TouchableOpacity
                style={styles.ownerEditButton}
                onPress={handleEditListing}
                disabled={deleting}
              >
                <Pencil size={18} color={Colors.primary_blue} />
                <Text style={styles.ownerEditButtonText}>Edit Listing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ownerEditButton}
                onPress={handleToggleAvailability}
                disabled={deleting}
              >
                <Check size={18} color={Colors.primary_blue} />
                <Text style={styles.ownerEditButtonText}>
                  {listing.status === "sold" ? "Mark Active" : "Mark Sold"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* Seller Info */}
        {seller && (
          <View
            style={[
              styles.sellerSection,
              isWeb && styles.sectionShellWeb,
              isWideWeb && styles.sectionShellWide,
            ]}
          >
            <Text style={styles.sectionTitle}>Seller</Text>
            <SurfaceCard
              variant="glass"
              style={[
                styles.sellerCard,
                isPhoneWeb && styles.sellerCardPhoneWeb,
              ]}
            >
              {seller.avatar_url ? (
                <Image
                  source={{ uri: seller.avatar_url }}
                  style={styles.sellerAvatar}
                />
              ) : (
                <View style={styles.sellerAvatarPlaceholder}>
                  <User size={32} color={Colors.primary_blue} />
                </View>
              )}
              <View style={styles.sellerInfo}>
                <Text style={styles.sellerName}>{seller.username}</Text>
                <View style={styles.trustRow}>
                  <ShieldCheck size={14} color={Colors.primary_green} />
                  <Text style={styles.trustText}>
                    {seller.active_listings_count || 0} active listing
                    {(seller.active_listings_count || 0) === 1 ? "" : "s"}
                    {seller.member_since
                      ? ` · Member since ${new Date(
                          seller.member_since,
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}`
                      : ""}
                  </Text>
                </View>
                {seller.rating !== undefined && seller.review_count > 0 ? (
                  <View>
                    {renderStars(Math.round(seller.rating))}
                    <Text style={styles.ratingText}>
                      {seller.rating.toFixed(1)} ({seller.review_count}{" "}
                      {seller.review_count === 1 ? "review" : "reviews"}{" "}
                      overall)
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.ratingText}>No reviews yet</Text>
                )}
              </View>
            </SurfaceCard>
            {!isOwner ? (
              <TouchableOpacity
                style={[
                  styles.messageSellerButton,
                  openingConversation && styles.messageSellerButtonDisabled,
                ]}
                onPress={handleMessageSeller}
                disabled={openingConversation}
              >
                {openingConversation ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <>
                    <MessageCircle color={Colors.white} size={18} />
                    <Text style={styles.messageSellerButtonText}>
                      Message Seller
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Leave a Review Section */}
        <View
          style={[
            styles.leaveReviewSection,
            isWeb && styles.sectionShellWeb,
            isWideWeb && styles.sectionShellWide,
          ]}
        >
          <Text style={styles.sectionTitle}>Leave a Review</Text>

          {/* Rating Selector */}
          <View style={styles.ratingSelector}>
            <Text style={styles.ratingLabel}>Your Rating:</Text>
            <View style={styles.starsSelector}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setReviewRating(star)}
                  style={styles.starButton}
                >
                  <Star
                    size={32}
                    color={star <= reviewRating ? "#FFB800" : Colors.lightGray}
                    fill={star <= reviewRating ? "#FFB800" : "transparent"}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Comment Input */}
          <Text style={styles.commentLabel}>Your Comment (Optional)</Text>
          <TextInput
            style={styles.commentInput}
            placeholder="Share your experience with this product..."
            placeholderTextColor={Colors.lightGray}
            multiline
            numberOfLines={4}
            value={reviewComment}
            onChangeText={setReviewComment}
            editable={!submittingReview}
          />

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitReviewButton,
              submittingReview && styles.submitReviewButtonDisabled,
            ]}
            onPress={handleSubmitReview}
            disabled={submittingReview}
          >
            {submittingReview ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={styles.submitReviewButtonText}>Submit Review</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Reviews Section */}
        {reviews.length > 0 && (
          <View
            style={[
              styles.reviewsSection,
              isWeb && styles.sectionShellWeb,
              isWideWeb && styles.sectionShellWide,
            ]}
          >
            <Text style={styles.sectionTitle}>Reviews</Text>
            <View style={styles.ratingOverview}>
              <View style={styles.ratingScore}>
                <Text style={styles.ratingNumber}>
                  {calculateAverageRating().toFixed(1)}
                </Text>
                {renderStars(Math.round(calculateAverageRating()))}
              </View>
              <Text style={styles.reviewCount}>
                {reviews.length} review{reviews.length !== 1 ? "s" : ""}
              </Text>
            </View>

            {reviews.map((review: Review) => (
              <React.Fragment key={review.id}>
                <SurfaceCard variant="outlined" style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewerInfo}>
                      <Text style={styles.reviewerName}>
                        {review.reviewer_name || "Anonymous"}
                      </Text>
                      {review.verified_purchase && (
                        <View style={styles.verifiedBadge}>
                          <ShieldCheck
                            size={14}
                            color={Colors.primary_green}
                            strokeWidth={2.5}
                          />
                          <Text style={styles.verifiedText}>
                            Verified Purchase
                          </Text>
                        </View>
                      )}
                    </View>
                    {renderStars(review.rating)}
                  </View>
                  {review.comment && (
                    <Text style={styles.reviewComment}>{review.comment}</Text>
                  )}
                  <Text style={styles.reviewDate}>
                    {new Date(review.created_at).toLocaleDateString()}
                  </Text>
                </SurfaceCard>
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Empty Reviews State */}
        {reviews.length === 0 && (
          <View
            style={[
              styles.noReviewsSection,
              isWeb && styles.sectionShellWeb,
              isWideWeb && styles.sectionShellWide,
            ]}
          >
            <Text style={styles.noReviewsText}>
              No reviews yet. Be the first to review!
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={reportVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReportVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setReportVisible(false)}
        >
          <View style={styles.reportCard}>
            <Text style={styles.reportTitle}>Report Listing</Text>
            <Text style={styles.reportSubtitle}>
              Flag spam, scams, inaccurate details, or unsafe content.
            </Text>
            <View style={styles.reportReasonsRow}>
              {REPORT_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={[
                    styles.reportReasonChip,
                    reportReason === reason && styles.reportReasonChipActive,
                  ]}
                  onPress={() => setReportReason(reason)}
                >
                  <Text
                    style={[
                      styles.reportReasonText,
                      reportReason === reason && styles.reportReasonTextActive,
                    ]}
                  >
                    {reason}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.commentInput}
              placeholder="Optional details"
              placeholderTextColor={Colors.lightGray}
              multiline
              numberOfLines={4}
              value={reportDetails}
              onChangeText={setReportDetails}
              editable={!submittingReport}
            />
            <TouchableOpacity
              style={[
                styles.submitReviewButton,
                submittingReport && styles.submitReviewButtonDisabled,
              ]}
              onPress={handleSubmitReport}
              disabled={submittingReport}
            >
              {submittingReport ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={styles.submitReviewButtonText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Add to Cart Button */}
      <StickyActionBar style={styles.buyButtonContainer}>
        <Animated.View
          style={[
            styles.buyActionInner,
            isWeb && styles.buyActionInnerWeb,
            { transform: [{ scale: addToCartScale }] },
          ]}
        >
          <View
            style={[
              styles.purchaseControls,
              isWeb && styles.purchaseControlsWeb,
            ]}
          >
            <View style={styles.quantityPicker}>
              <TouchableOpacity
                style={styles.quantityPickerButton}
                onPress={() => handleQuantityChange(-1)}
                disabled={!listingAvailable || selectedQuantity <= 1}
              >
                <Minus color={Colors.darkTeal} size={18} />
              </TouchableOpacity>
              <Text style={styles.quantityPickerText}>{selectedQuantity}</Text>
              <TouchableOpacity
                style={styles.quantityPickerButton}
                onPress={() => handleQuantityChange(1)}
                disabled={
                  !listingAvailable || selectedQuantity >= availableQuantity
                }
              >
                <Plus color={Colors.darkTeal} size={18} />
              </TouchableOpacity>
            </View>
            <Text style={styles.stockFootnote}>
              {formatStockLabel(availableQuantity)}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.buyButton, addingToCart && styles.buyButtonDisabled]}
            onPress={handleAddToCart}
            disabled={addingToCart || !listingAvailable}
            activeOpacity={0.8}
          >
            {addingToCart ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <>
                <ShoppingCart
                  color={Colors.white}
                  size={24}
                  style={{ marginRight: Spacing.sm }}
                />
                <Text style={styles.buyButtonText}>
                  {listingAvailable ? "Add to Cart" : "Unavailable"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </StickyActionBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  headerWeb: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    paddingHorizontal: Spacing.xl,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconButtonSpacer: {
    width: 44,
    height: 44,
  },
  headerTitle: {
    ...Typography.heading4,
    color: Colors.darkTeal,
    fontWeight: "700",
  },
  scrollContent: {
    paddingBottom: 100,
  },
  scrollContentWeb: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 148,
  },
  imageCarouselContainer: {
    position: "relative",
    alignItems: "center",
    backgroundColor: Colors.lightMint,
  },
  imageCarouselContainerWeb: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginTop: Spacing.md,
  },
  imageCarouselContainerWide: {
    marginTop: Spacing.lg,
  },
  imageWrapper: {
    width: "100%",
    maxWidth: isWeb ? IMAGE_MAX_WIDTH : undefined,
    height: 420,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.lightMint,
    alignSelf: "center",
  },
  imageWrapperWeb: {
    maxWidth: undefined,
    height: 500,
  },
  imageWrapperWebWide: {
    height: 560,
  },
  productImage: {
    width: "100%",
    height: "100%",
  },
  arrowButton: {
    position: "absolute",
    top: "50%",
    marginTop: -24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  arrowLeft: {
    left: Spacing.md,
  },
  arrowRight: {
    right: Spacing.md,
  },
  imageIndicators: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
    backgroundColor: Colors.lightMint,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D1D5DB",
  },
  indicatorActive: {
    backgroundColor: Colors.primary_blue,
    width: 28,
  },
  infoSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.white,
  },
  sectionShellWeb: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 24,
    marginTop: Spacing.lg,
    overflow: "hidden",
  },
  sectionShellWide: {
    paddingHorizontal: Spacing.xl,
  },
  metaPillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.heading3,
    color: Colors.darkTeal,
    marginBottom: Spacing.md,
    fontWeight: "700",
  },
  price: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6B7280", // medium gray
    marginBottom: Spacing.md,
  },
  description: {
    ...Typography.bodyMedium,
    color: Colors.mutedGray,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  buyerActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  secondaryInlineButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.primary_blue,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
  },
  secondaryInlineButtonDisabled: {
    opacity: 0.65,
  },
  secondaryInlineButtonText: {
    ...Typography.bodySmall,
    color: Colors.primary_blue,
    fontWeight: "700",
  },
  ownerActionsRow: {
    marginTop: Spacing.xs,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  ownerEditButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary_blue,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  ownerEditButtonText: {
    ...Typography.bodySmall,
    color: Colors.primary_blue,
    fontWeight: "700",
  },
  sellerSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: "#F9FAFB",
  },
  sectionTitle: {
    ...Typography.heading4,
    color: Colors.darkTeal,
    marginBottom: Spacing.md,
    fontWeight: "700",
  },
  sellerCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
  },
  sellerCardPhoneWeb: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  sellerAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginRight: Spacing.lg,
  },
  sellerAvatarPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.lightMint,
    marginRight: Spacing.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  sellerInfo: {
    flex: 1,
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  trustText: {
    ...Typography.bodySmall,
    color: Colors.mutedGray,
    flex: 1,
  },
  messageSellerButton: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary_blue,
    borderRadius: BorderRadius.medium,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.xs,
  },
  messageSellerButtonDisabled: {
    opacity: 0.7,
  },
  messageSellerButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: Typography.bodyMedium.fontFamily,
    fontWeight: "700",
  },
  sellerName: {
    ...Typography.bodyLarge,
    color: Colors.darkTeal,
    marginBottom: Spacing.xs,
    fontWeight: "600",
  },
  starsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.xs,
    gap: 2,
  },
  ratingText: {
    ...Typography.bodySmall,
    color: Colors.mutedGray,
    marginTop: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  reviewsSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
  },
  ratingOverview: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  ratingScore: {
    alignItems: "center",
    marginRight: Spacing.xxl,
  },
  ratingNumber: {
    fontSize: 36,
    fontWeight: "700",
    color: Colors.primary_blue,
    marginBottom: Spacing.sm,
  },
  reviewCount: {
    ...Typography.bodySmall,
    color: Colors.mutedGray,
    fontWeight: "500",
  },
  reviewCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.sm,
  },
  reviewerInfo: {
    flex: 1,
    flexDirection: "column",
    gap: Spacing.xs,
  },
  reviewerName: {
    ...Typography.bodyMedium,
    fontWeight: "600",
    color: Colors.darkTeal,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  verifiedText: {
    ...Typography.bodySmall,
    fontSize: 12,
    color: Colors.primary_green,
    fontWeight: "500",
  },
  reviewComment: {
    ...Typography.bodyMedium,
    color: Colors.darkTeal,
    marginBottom: Spacing.sm,
    lineHeight: 22,
  },
  reviewDate: {
    ...Typography.bodySmall,
    color: Colors.mutedGray,
    marginTop: Spacing.sm,
  },
  noReviewsSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  noReviewsText: {
    ...Typography.bodyMedium,
    color: Colors.mutedGray,
    textAlign: "center",
    fontStyle: "italic",
  },

  // Buy Button
  buyButtonContainer: {
    bottom: 0,
    ...(isWeb
      ? {
          width: "100%",
          maxWidth: 1180,
          alignSelf: "center",
          paddingHorizontal: Spacing.lg,
          bottom: 12,
        }
      : null),
  },
  buyActionInner: {
    width: "100%",
  },
  buyActionInnerWeb: {
    alignSelf: "center",
    maxWidth: 560,
  },
  purchaseControls: {
    marginBottom: Spacing.sm,
    alignItems: "center",
    gap: Spacing.xs,
    width: "100%",
  },
  purchaseControlsWeb: {
    alignItems: "center",
  },
  quantityPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  quantityPickerButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityPickerText: {
    minWidth: 32,
    textAlign: "center",
    ...Typography.bodyLarge,
    color: Colors.darkTeal,
    fontWeight: "700",
  },
  stockFootnote: {
    ...Typography.bodySmall,
    color: Colors.mutedGray,
  },
  buyButton: {
    backgroundColor: Colors.primary_blue,
    width: "100%",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.medium,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  buyButtonDisabled: {
    backgroundColor: Colors.borderGray,
  },
  buyButtonText: {
    ...Typography.bodyLarge,
    color: Colors.white,
    fontWeight: "700",
  },
  errorText: {
    ...Typography.bodyMedium,
    color: Colors.mutedGray,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  leaveReviewSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  ratingSelector: {
    marginBottom: Spacing.lg,
  },
  ratingLabel: {
    ...Typography.bodyMedium,
    fontWeight: "600",
    color: Colors.darkTeal,
    marginBottom: Spacing.md,
  },
  starsSelector: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: Spacing.lg,
  },
  starButton: {
    padding: Spacing.sm,
  },
  commentLabel: {
    ...Typography.bodyMedium,
    fontWeight: "600",
    color: Colors.darkTeal,
    marginBottom: Spacing.sm,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: BorderRadius.medium,
    padding: Spacing.md,
    fontSize: Typography.bodyMedium.fontSize,
    color: Colors.darkTeal,
    backgroundColor: Colors.white,
    marginBottom: Spacing.lg,
    textAlignVertical: "top",
  },
  submitReviewButton: {
    backgroundColor: Colors.primary_green,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.medium,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  submitReviewButtonDisabled: {
    opacity: 0.6,
  },
  submitReviewButtonText: {
    ...Typography.bodyLarge,
    color: Colors.white,
    fontWeight: "600",
  },

  // Menu Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.medium,
    minWidth: 200,
    paddingVertical: Spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "500",
    color: Colors.darkTeal,
  },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.lightGray,
    marginHorizontal: Spacing.md,
  },
  deleteText: {
    color: Colors.error || "#E74C3C",
  },
  reportCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.medium,
    width: "86%",
    maxWidth: 420,
    padding: Spacing.lg,
  },
  reportTitle: {
    ...Typography.heading4,
    color: Colors.darkTeal,
    fontWeight: "700",
  },
  reportSubtitle: {
    ...Typography.bodySmall,
    color: Colors.mutedGray,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  reportReasonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  reportReasonChip: {
    borderWidth: 1,
    borderColor: Colors.borderGray,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  reportReasonChipActive: {
    backgroundColor: Colors.primary_blue,
    borderColor: Colors.primary_blue,
  },
  reportReasonText: {
    ...Typography.bodySmall,
    color: Colors.darkTeal,
    fontWeight: "700",
  },
  reportReasonTextActive: {
    color: Colors.white,
  },
});
