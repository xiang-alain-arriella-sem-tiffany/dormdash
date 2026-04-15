import React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ListingCard from "../components/ListingCard";
import EmptyState from "../components/EmptyState";
import { Colors, Typography, Spacing } from "../assets/styles";
import { useSavedListings } from "../lib/api/savedListings";

type SavedListingsNavigationProp = NativeStackNavigationProp<any>;

const ProfileSavedListings: React.FC = () => {
  const navigation = useNavigation<SavedListingsNavigationProp>();
  const {
    data: listings = [],
    isLoading,
    refetch,
    isRefetching,
  } = useSavedListings();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <ChevronLeft color={Colors.darkTeal} size={32} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Items ({listings.length})</Text>
        <View style={styles.placeholder} />
      </View>

      {isLoading ? (
        <ActivityIndicator
          size="large"
          color={Colors.primary_blue}
          style={{ marginTop: Spacing.lg }}
        />
      ) : listings.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="No saved items yet"
          subtitle="Save listings to compare them later without crowding your cart."
        />
      ) : (
        <FlatList
          data={listings}
          renderItem={({ item }) => <ListingCard listing={item as any} />}
          keyExtractor={(item: any) => item.id.toString()}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
            />
          }
        />
      )}
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
    paddingTop: 50,
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
  row: {
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
});

export default ProfileSavedListings;
