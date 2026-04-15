import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

function buildPriceEstimationPrompt(
  itemDescription: string,
  storeName: string,
  storeLocation: string,
) {
  return `You are a price estimation assistant for a campus delivery app. You must return ACCURATE real-world menu/shelf prices for items at stores near the University of Pennsylvania in Philadelphia, PA.

Item requested: "${itemDescription}"
Store: "${storeName}"
Store location/address: "${storeLocation}"

Respond with a JSON object (no markdown, no code fences, just the raw JSON) with these fields:
{
  "unitPriceCents": <number — the price of ONE unit of this item in US cents at this specific store, based on real 2025-2026 menu/shelf prices>,
  "confidence": "<'high' if you're quite sure about the price, 'medium' if it's a reasonable guess, 'low' if very uncertain>",
  "reasoning": "<1-2 sentence explanation referencing the specific store, item, and current real-world price>",
  "mismatchWarning": "<null if the store likely sells this item, OR a short warning string if the store is unlikely to carry this item>"
}

CRITICAL PRICING RULES:
- Return the price of ONE single item only — quantity is handled separately by the app
- Use REAL current menu prices for chain stores. Examples of accurate 2025-2026 Philadelphia-area prices:
  * Starbucks Iced White Chocolate Mocha (Grande): ~$6.25-$6.75
  * Starbucks Caramel Frappuccino (Grande): ~$5.95-$6.45
  * Wawa Hoagie (Shortie): ~$5.99-$7.49
  * Chick-fil-A Sandwich Meal: ~$9.59-$10.99
  * CVS snacks/drinks: use standard retail pricing
- For local/independent stores near UPenn, estimate based on typical University City pricing
- unitPriceCents must be the price of a SINGLE item, not the total
- Do NOT lowball prices — accuracy matters more than conservatism
- If there is no mismatch warning, return JSON null for mismatchWarning, not the string "null"`;
}

const priceEstimateResponseFormat = {
  type: "json_schema",
  json_schema: {
    name: "price_estimate",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        unitPriceCents: { type: "number" },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
        },
        reasoning: { type: "string" },
        mismatchWarning: {
          anyOf: [{ type: "string" }, { type: "null" }],
        },
      },
      required: [
        "unitPriceCents",
        "confidence",
        "reasoning",
        "mismatchWarning",
      ],
    },
  },
} as const;

http.route({
  path: "/create-checkout-session",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { name, price, orderId } = body;

      if (!name || typeof price !== "number") {
        return new Response(
          JSON.stringify({ error: "Missing required fields: name and price" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const result = await ctx.runAction(api.checkout.createCheckoutSession, {
        name,
        price,
        ...(orderId ? { orderId: Number(orderId) } : {}),
      });

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

http.route({
  path: "/estimate-item-price",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    try {
      const body = await request.json();
      const { itemDescription, storeName, storeLocation } = body ?? {};

      if (
        typeof itemDescription !== "string" ||
        typeof storeName !== "string" ||
        typeof storeLocation !== "string"
      ) {
        return new Response(
          JSON.stringify({
            error:
              "Missing required fields: itemDescription, storeName, and storeLocation",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }

      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw new Error("OPENAI_API_KEY environment variable is not set");
      }

      const prompt = buildPriceEstimationPrompt(
        itemDescription,
        storeName,
        storeLocation,
      );

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-5.4-nano",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_completion_tokens: 300,
            response_format: priceEstimateResponseFormat,
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI HTTP ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!raw) {
        throw new Error("OpenAI returned an empty price estimate");
      }

      const parsed = JSON.parse(raw);
      if (parsed.mismatchWarning === "null") {
        parsed.mismatchWarning = null;
      }

      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }),
});

// Handle CORS preflight requests
http.route({
  path: "/create-checkout-session",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

http.route({
  path: "/estimate-item-price",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

export default http;
