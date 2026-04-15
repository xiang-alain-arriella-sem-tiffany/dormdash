export interface PriceEstimateResponse {
  unitPrice: number; // single-item price in cents
  quantity: number;
  subtotal: number; // unitPrice * quantity in cents
  tax: number; // Philadelphia 8% sales tax in cents
  estimatedItemPrice: number; // subtotal + tax in cents
  recommendedBountyAmount: number; // estimatedItemPrice + dasher comp in cents
  dasherProfit: number; // in cents
  dasherProfitPercentage: number; // percentage
  confidence: "high" | "medium" | "low";
  reasoning: string;
  mismatchWarning?: string;
}

const CONVEX_SITE_URL =
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL ??
  process.env.EXPO_PUBLIC_CONVEX_URL?.replace(
    /\.convex\.cloud$/,
    ".convex.site",
  ) ??
  "";

const PHILLY_TAX_RATE = 0.08; // Philadelphia, PA sales tax

function calculateDasherCompensation(subtotalWithTax: number) {
  let recommendedMargin: number;
  if (subtotalWithTax < 500) {
    recommendedMargin = 300;
  } else if (subtotalWithTax < 1500) {
    recommendedMargin = 400;
  } else {
    recommendedMargin = 600;
  }
  return {
    recommendedMargin,
    recommendedBountyAmount: subtotalWithTax + recommendedMargin,
  };
}

export const estimateItemPrice = async (
  itemDescription: string,
  storeName: string,
  storeLocation: string,
  quantity: number = 1,
): Promise<PriceEstimateResponse> => {
  try {
    if (!CONVEX_SITE_URL) {
      throw new Error("EXPO_PUBLIC_CONVEX_SITE_URL is not set");
    }

    const response = await fetch(
      `${CONVEX_SITE_URL.replace(/\/$/, "")}/estimate-item-price`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemDescription,
          storeName,
          storeLocation,
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Price estimation HTTP ${response.status}: ${errorBody}`);
    }

    const parsed = await response.json();

    const unitPrice = Math.max(50, Math.round(Number(parsed.unitPriceCents)));
    const subtotal = unitPrice * quantity;
    const tax = Math.round(subtotal * PHILLY_TAX_RATE);
    const estimatedItemPrice = subtotal + tax;

    const confidence: "high" | "medium" | "low" = [
      "high",
      "medium",
      "low",
    ].includes(parsed.confidence)
      ? parsed.confidence
      : "medium";
    const reasoning =
      typeof parsed.reasoning === "string"
        ? parsed.reasoning
        : "AI-based estimate.";
    const mismatchWarning =
      typeof parsed.mismatchWarning === "string"
        ? parsed.mismatchWarning
        : undefined;

    const { recommendedMargin, recommendedBountyAmount } =
      calculateDasherCompensation(estimatedItemPrice);

    return {
      unitPrice,
      quantity,
      subtotal,
      tax,
      estimatedItemPrice,
      recommendedBountyAmount,
      dasherProfit: recommendedMargin,
      dasherProfitPercentage: Math.round(
        (recommendedMargin / estimatedItemPrice) * 100,
      ),
      confidence,
      reasoning,
      mismatchWarning,
    };
  } catch (error) {
    console.error("Price estimation error:", error);
    return {
      unitPrice: 650,
      quantity: 1,
      subtotal: 650,
      tax: 52,
      estimatedItemPrice: 702,
      recommendedBountyAmount: 1002,
      dasherProfit: 300,
      dasherProfitPercentage: 43,
      confidence: "low",
      reasoning:
        "Using default estimate due to estimation service unavailability.",
    };
  }
};
