import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Colors,
  SemanticColors,
  Shadows,
  Spacing,
  Typography,
  WebLayout,
} from "../assets/styles";
import {
  ArrowRight,
  Clock3,
  Route,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import {
  LiveBadge,
  SectionHeader,
  StatusPill,
  SurfaceCard,
} from "../components";

type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
};

type NavProp = NativeStackNavigationProp<AuthStackParamList, "Welcome">;

interface WelcomeFeature {
  title: string;
  description: string;
  icon: LucideIcon;
}

const HERO_HIGHLIGHTS = [
  "Penn-only community",
  "Built for buyers and sellers",
  "Local delivery around campus",
];

const SELLING_POINTS: WelcomeFeature[] = [
  {
    title: "Trusted Penn Network",
    description:
      "Meet verified campus users instead of random marketplace strangers.",
    icon: ShieldCheck,
  },
  {
    title: "Faster Checkout",
    description:
      "List, buy, and confirm in fewer taps with a flow built for student speed.",
    icon: Wallet,
  },
  {
    title: "Local Delivery Flow",
    description:
      "Coordinate on-campus handoff or delivery with transparent order updates.",
    icon: Truck,
  },
  {
    title: "Live Listing Discovery",
    description:
      "Browse what is available near you and move quickly on high-demand items.",
    icon: Store,
  },
];

export default function AuthWelcome() {
  const navigation = useNavigation<NavProp>();
  const isWeb = Platform.OS === "web";
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTranslate = useRef(new Animated.Value(18)).current;
  const floatA = useRef(new Animated.Value(0)).current;
  const floatB = useRef(new Animated.Value(0)).current;

  const isLargeWeb = isWeb && width >= WebLayout.breakpoints.lg;
  const isPhoneWeb = isWeb && width < WebLayout.breakpoints.sm;
  const isUltraWideWeb = isWeb && width >= WebLayout.breakpoints.xl;
  const isTablet = width >= WebLayout.breakpoints.sm;
  const heroMinHeight = isWeb ? undefined : Math.max(height * 0.72, 520);

  useEffect(() => {
    const intro = Animated.parallel([
      Animated.timing(heroOpacity, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(heroTranslate, {
        toValue: 0,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    const orbitA = Animated.loop(
      Animated.sequence([
        Animated.timing(floatA, {
          toValue: 1,
          duration: 4600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatA, {
          toValue: 0,
          duration: 4600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const orbitB = Animated.loop(
      Animated.sequence([
        Animated.timing(floatB, {
          toValue: 1,
          duration: 6200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatB, {
          toValue: 0,
          duration: 6200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    intro.start();
    orbitA.start();
    orbitB.start();

    return () => {
      orbitA.stop();
      orbitB.stop();
    };
  }, [floatA, floatB, heroOpacity, heroTranslate]);

  const orbATransform = useMemo(
    () => ({
      transform: [
        {
          translateY: floatA.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -22],
          }),
        },
        {
          translateX: floatA.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 16],
          }),
        },
      ],
    }),
    [floatA],
  );

  const orbBTransform = useMemo(
    () => ({
      transform: [
        {
          translateY: floatB.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 20],
          }),
        },
        {
          translateX: floatB.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -14],
          }),
        },
      ],
    }),
    [floatB],
  );

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.ambientOrbOne, orbATransform]} />
      <Animated.View style={[styles.ambientOrbTwo, orbBTransform]} />
      <View style={styles.ambientGrid} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          isWeb && styles.scrollContentWeb,
          {
            paddingTop: Math.max(insets.top, Spacing.lg),
            paddingBottom: Math.max(insets.bottom + Spacing.lg, Spacing.xxl),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.page,
            isWeb && styles.pageWeb,
            isTablet && !isWeb && styles.pageTablet,
            isWeb && styles.pageWebNoGap,
            isUltraWideWeb && styles.pageWebWide,
          ]}
        >
          <Animated.View
            style={[
              styles.heroSection,
              isLargeWeb && styles.heroSectionWeb,
              { minHeight: heroMinHeight },
              {
                opacity: heroOpacity,
                transform: [{ translateY: heroTranslate }],
              },
            ]}
          >
            <View
              style={[styles.heroContent, isLargeWeb && styles.heroContentWeb]}
            >
              <View
                style={[
                  styles.heroPrimary,
                  isLargeWeb && styles.heroPrimaryWeb,
                ]}
              >
                <View style={styles.badgesTopRow}>
                  <LiveBadge label="Campus live" />
                  <StatusPill label="Penn-only" tone="success" />
                </View>

                <Text style={styles.heroKicker}>DORMDASH MARKETPLACE</Text>
                <Text
                  style={[
                    styles.heroTitle,
                    isLargeWeb && styles.heroTitleWeb,
                    isPhoneWeb && styles.heroTitlePhoneWeb,
                  ]}
                >
                  Buy it. Sell it. Get it fast across Penn.
                </Text>
                <Text style={styles.heroSubtitle}>
                  A student-first marketplace that keeps listings local,
                  checkout simple, and delivery flexible for campus life.
                </Text>

                <View style={styles.highlightRow}>
                  {HERO_HIGHLIGHTS.map((item) => (
                    <View key={item} style={styles.highlightChip}>
                      <Sparkles size={14} color={Colors.primary_blue} />
                      <Text style={styles.highlightText}>{item}</Text>
                    </View>
                  ))}
                </View>

                <View
                  style={[
                    styles.ctaRow,
                    isLargeWeb && styles.ctaRowWeb,
                    isPhoneWeb && styles.ctaRowPhoneWeb,
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.ctaButton,
                      styles.ctaButtonPrimary,
                      isLargeWeb && styles.ctaButtonWeb,
                    ]}
                    onPress={() => navigation.navigate("Register")}
                  >
                    <Text style={styles.ctaButtonPrimaryText}>
                      Create Account
                    </Text>
                    <ArrowRight size={18} color={Colors.white} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.ctaButton,
                      styles.ctaButtonSecondary,
                      isLargeWeb && styles.ctaButtonWeb,
                    ]}
                    onPress={() => navigation.navigate("Login")}
                  >
                    <Text style={styles.ctaButtonSecondaryText}>Login</Text>
                    <ArrowRight size={18} color={Colors.darkTeal} />
                  </TouchableOpacity>
                </View>
              </View>

              <SurfaceCard
                variant="glass"
                style={[styles.heroPanel, isLargeWeb && styles.heroPanelWeb]}
              >
                <SectionHeader
                  title="Why students choose DormDash"
                  subtitle="Designed around campus speed and trust."
                  rightSlot={<StatusPill label="Always active" tone="info" />}
                />
                <View style={styles.heroPanelRows}>
                  <View style={styles.heroPanelRow}>
                    <Clock3 size={18} color={Colors.primary_blue} />
                    <Text style={styles.heroPanelText}>
                      Quick listing flow for books, gadgets, and dorm
                      essentials.
                    </Text>
                  </View>
                  <View style={styles.heroPanelRow}>
                    <Route size={18} color={Colors.primary_green} />
                    <Text style={styles.heroPanelText}>
                      Built-in path from discovery to pickup or delivery.
                    </Text>
                  </View>
                  <View style={styles.heroPanelRow}>
                    <ShieldCheck size={18} color={Colors.darkTeal} />
                    <Text style={styles.heroPanelText}>
                      Penn-focused community experience with clear status
                      updates.
                    </Text>
                  </View>
                </View>
              </SurfaceCard>
            </View>
          </Animated.View>

          <SurfaceCard
            variant="default"
            style={[styles.sectionCard, isWeb && styles.firstSectionGapWeb]}
          >
            <SectionHeader
              title="Selling points"
              subtitle="Everything needed to transact confidently on campus."
              rightSlot={<StatusPill label="Feature-first" tone="neutral" />}
            />
            <View
              style={[
                styles.featureGrid,
                isLargeWeb && styles.featureGridWeb,
                isUltraWideWeb && styles.featureGridWide,
              ]}
            >
              {SELLING_POINTS.map((point) => (
                <View key={point.title} style={styles.featureItem}>
                  <View style={styles.featureIconWrap}>
                    <point.icon size={20} color={Colors.primary_blue} />
                  </View>
                  <View style={styles.featureTextWrap}>
                    <Text style={styles.featureTitle}>{point.title}</Text>
                    <Text style={styles.featureDescription}>
                      {point.description}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </SurfaceCard>

          <SurfaceCard
            variant="mint"
            style={[styles.sectionCard, styles.sectionGap]}
          >
            <SectionHeader
              title="How it works"
              subtitle="Three simple steps from listing to completed order."
            />
            <View style={[styles.stepRow, isLargeWeb && styles.stepRowWeb]}>
              <View style={styles.stepCard}>
                <View style={styles.stepIndex}>
                  <Text style={styles.stepIndexText}>1</Text>
                </View>
                <Text style={styles.stepTitle}>Post or browse</Text>
                <Text style={styles.stepText}>
                  Create a listing quickly or search what is live near you.
                </Text>
              </View>
              <View style={styles.stepCard}>
                <View style={styles.stepIndex}>
                  <Text style={styles.stepIndexText}>2</Text>
                </View>
                <Text style={styles.stepTitle}>Checkout fast</Text>
                <Text style={styles.stepText}>
                  Confirm details and complete purchase in a smooth flow.
                </Text>
              </View>
              <View style={styles.stepCard}>
                <View style={styles.stepIndex}>
                  <Text style={styles.stepIndexText}>3</Text>
                </View>
                <Text style={styles.stepTitle}>Meet or deliver</Text>
                <Text style={styles.stepText}>
                  Coordinate pickup or delivery with clear order progress.
                </Text>
              </View>
            </View>
          </SurfaceCard>

          <SurfaceCard
            variant="glass"
            style={[styles.sectionCard, styles.sectionGap, styles.finalCtaCard]}
          >
            <View style={styles.logoStrip}>
              <Image
                source={require("../../assets/logo.png")}
                style={[styles.logo, isWeb && styles.logoWeb]}
                resizeMode="contain"
              />
            </View>
            <SectionHeader
              title="Ready to make your first campus trade?"
              subtitle="Join DormDash and start buying, listing, and delivering with confidence."
              rightSlot={<StatusPill label="Ready now" tone="success" />}
              style={styles.sectionHeader}
            />
            <View style={styles.pillRow}>
              <StatusPill label="Penn-only" tone="success" />
              <StatusPill label="Fast flow" tone="info" />
              <StatusPill label="Campus logistics" tone="warning" />
            </View>
            <View style={[styles.ctaRow, isLargeWeb && styles.ctaRowWeb]}>
              <TouchableOpacity
                style={[
                  styles.ctaButton,
                  styles.ctaButtonPrimary,
                  isLargeWeb && styles.ctaButtonWeb,
                ]}
                onPress={() => navigation.navigate("Register")}
              >
                <Text style={styles.ctaButtonPrimaryText}>Create Account</Text>
                <ArrowRight size={18} color={Colors.white} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.ctaButton,
                  styles.ctaButtonSecondary,
                  isLargeWeb && styles.ctaButtonWeb,
                ]}
                onPress={() => navigation.navigate("Login")}
              >
                <Text style={styles.ctaButtonSecondaryText}>Login</Text>
                <ArrowRight size={18} color={Colors.darkTeal} />
              </TouchableOpacity>
            </View>
          </SurfaceCard>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.base_bg,
  },
  ambientOrbOne: {
    position: "absolute",
    top: -120,
    right: -60,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(49, 161, 233, 0.16)",
  },
  ambientOrbTwo: {
    position: "absolute",
    bottom: 80,
    left: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(101, 209, 162, 0.2)",
  },
  ambientGrid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    borderColor: "rgba(57, 96, 91, 0.04)",
    borderLeftWidth: 1,
    borderTopWidth: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  scrollContentWeb: {
    paddingHorizontal: Spacing.xl,
  },
  page: {
    width: "100%",
    gap: Spacing.lg,
  },
  pageWebNoGap: {
    gap: 0,
  },
  pageWeb: {
    maxWidth: 1280,
    alignSelf: "center",
  },
  pageWebWide: {
    maxWidth: 1360,
  },
  pageTablet: {
    alignSelf: "center",
    maxWidth: WebLayout.maxContentWidth - 140,
  },
  heroSection: {
    width: "100%",
    justifyContent: "center",
  },
  heroSectionWeb: {
    justifyContent: "flex-start",
  },
  heroContent: {
    gap: Spacing.lg,
  },
  heroContentWeb: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  heroPrimary: {
    justifyContent: "flex-start",
  },
  heroPrimaryWeb: {
    flex: 1.35,
    justifyContent: "flex-start",
  },
  badgesTopRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  heroKicker: {
    ...Typography.bodySmall,
    letterSpacing: 1,
    fontWeight: "700",
    color: Colors.primary_blue,
    marginBottom: Spacing.xs,
  },
  heroTitle: {
    ...Typography.heading2,
    fontSize: 40,
    lineHeight: 46,
    color: Colors.darkTeal,
    marginBottom: Spacing.sm,
  },
  heroTitleWeb: {
    fontSize: 54,
    lineHeight: 60,
  },
  heroTitlePhoneWeb: {
    fontSize: 42,
    lineHeight: 48,
  },
  heroSubtitle: {
    ...Typography.bodyLarge,
    color: Colors.mutedGray,
    maxWidth: 700,
    marginBottom: Spacing.md,
  },
  highlightRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  highlightChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Shadows.sm,
  },
  highlightText: {
    ...Typography.bodySmall,
    color: Colors.darkTeal,
    fontWeight: "600",
  },
  ctaRow: {
    gap: Spacing.sm,
    width: "100%",
  },
  ctaRowWeb: {
    flexDirection: "row",
  },
  ctaRowPhoneWeb: {
    flexDirection: "column",
  },
  ctaButton: {
    borderRadius: 16,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    minHeight: 56,
  },
  ctaButtonWeb: {
    flex: 1,
  },
  ctaButtonPrimary: {
    backgroundColor: Colors.primary_blue,
    ...Shadows.glow,
  },
  ctaButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: Colors.borderLight,
    borderWidth: 1,
  },
  ctaButtonPrimaryText: {
    ...Typography.buttonText,
    color: Colors.white,
    fontSize: 16,
  },
  ctaButtonSecondaryText: {
    ...Typography.buttonText,
    color: Colors.darkTeal,
    fontSize: 16,
  },
  heroPanel: {
    justifyContent: "center",
    alignSelf: "auto",
    borderColor: SemanticColors.borderSubtle,
    ...Shadows.md,
  },
  heroPanelWeb: {
    flex: 1,
    minWidth: 280,
    alignSelf: "stretch",
  },
  heroPanelRows: {
    gap: Spacing.md,
  },
  heroPanelRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  heroPanelText: {
    ...Typography.bodyMedium,
    color: Colors.darkTeal,
    flex: 1,
    lineHeight: 22,
  },
  sectionCard: {
    borderColor: SemanticColors.borderSubtle,
    ...Shadows.md,
  },
  firstSectionGapWeb: {
    marginTop: Spacing.sm,
  },
  sectionGap: {
    marginTop: Spacing.lg,
  },
  featureGrid: {
    gap: Spacing.md,
  },
  featureGridWeb: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  featureGridWide: {
    justifyContent: "space-between",
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SemanticColors.borderSubtle,
    padding: Spacing.md,
    flexGrow: 1,
    minWidth: 250,
    flexBasis: "48%",
  },
  featureIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(49, 161, 233, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureTextWrap: {
    flex: 1,
    gap: Spacing.xs,
  },
  featureTitle: {
    ...Typography.bodySemibold,
    color: Colors.darkTeal,
  },
  featureDescription: {
    ...Typography.bodySmall,
    color: Colors.mutedGray,
    lineHeight: 18,
  },
  stepRow: {
    gap: Spacing.md,
  },
  stepRowWeb: {
    flexDirection: "row",
  },
  stepCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderColor: SemanticColors.borderSubtle,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  stepIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary_blue,
  },
  stepIndexText: {
    ...Typography.bodySmall,
    color: Colors.white,
    fontWeight: "800",
  },
  stepTitle: {
    ...Typography.bodySemibold,
    color: Colors.darkTeal,
  },
  stepText: {
    ...Typography.bodySmall,
    color: Colors.mutedGray,
    lineHeight: 18,
  },
  logoStrip: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 220,
    height: 100,
  },
  logoWeb: {
    width: 280,
    height: 120,
  },
  sectionHeader: {
    marginBottom: Spacing.sm,
  },
  pillRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
    marginBottom: Spacing.md,
  },
  finalCtaCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: SemanticColors.borderSubtle,
    ...Shadows.md,
  },
});
