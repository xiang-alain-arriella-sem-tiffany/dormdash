import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

export type MapRegion = MapCoordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

type MarkerInfo = {
  coordinate: MapCoordinate;
  title: string;
  description?: string;
  pinColor?: string;
};

type NormalizedMarkerInfo = Omit<MarkerInfo, "coordinate"> & {
  coordinate: MapCoordinate | null;
};

type NativeOSMMapProps = {
  initialRegion: MapRegion;
  tileUrlTemplate?: string;
  pickup?: MarkerInfo;
  dropoff?: MarkerInfo;
  dasher?: MarkerInfo;
  routeCoordinates?: MapCoordinate[];
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
};

const getColor = (pinColor?: string, fallback = "#2563EB") =>
  pinColor || fallback;

const toNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeCoordinate = (
  coord?: Partial<MapCoordinate> | null,
): MapCoordinate | null => {
  if (!coord) return null;
  const latitude = toNumber(coord.latitude);
  const longitude = toNumber(coord.longitude);
  if (latitude == null || longitude == null) return null;

  const latLooksValid = Math.abs(latitude) <= 90;
  const lngLooksValid = Math.abs(longitude) <= 180;
  if (latLooksValid && lngLooksValid) {
    return { latitude, longitude };
  }

  // Auto-correct common lat/lng swap from upstream payloads.
  const swappedLatLooksValid = Math.abs(longitude) <= 90;
  const swappedLngLooksValid = Math.abs(latitude) <= 180;
  if (swappedLatLooksValid && swappedLngLooksValid) {
    return { latitude: longitude, longitude: latitude };
  }

  return null;
};

const normalizeMarker = (
  marker?: MarkerInfo | null,
): NormalizedMarkerInfo | null => {
  if (!marker) return null;
  return {
    title: marker.title,
    description: marker.description,
    pinColor: marker.pinColor,
    coordinate: normalizeCoordinate(marker.coordinate),
  };
};

const NativeOSMMap: React.FC<NativeOSMMapProps> = ({
  initialRegion,
  pickup,
  dropoff,
  dasher,
  routeCoordinates,
  showsUserLocation = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<mapboxgl.Marker[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const hasInitialCameraFitRef = useRef(false);
  const isUserInteractingRef = useRef(false);
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  const styleId =
    process.env.EXPO_PUBLIC_MAPBOX_STYLE?.trim() || "mapbox/streets-v12";
  const [browserUserLocation, setBrowserUserLocation] =
    useState<MapCoordinate | null>(null);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const [mapLoadError, setMapLoadError] = useState<string | null>(null);
  const normalizedInitialCenter = useMemo(
    () => normalizeCoordinate(initialRegion) || initialRegion,
    [initialRegion],
  );
  const normalizedPickup = useMemo(() => normalizeMarker(pickup), [pickup]);
  const normalizedDropoff = useMemo(() => normalizeMarker(dropoff), [dropoff]);
  const normalizedDasher = useMemo(() => normalizeMarker(dasher), [dasher]);
  const normalizedRouteCoordinates = useMemo(
    () =>
      (routeCoordinates || [])
        .map((coord) => normalizeCoordinate(coord))
        .filter((coord): coord is MapCoordinate => Boolean(coord)),
    [routeCoordinates],
  );
  const normalizedBrowserUserLocation = useMemo(
    () => normalizeCoordinate(browserUserLocation),
    [browserUserLocation],
  );
  const cameraPoints = useMemo(() => {
    const points: MapCoordinate[] = [];
    if (normalizedPickup?.coordinate) points.push(normalizedPickup.coordinate);
    if (normalizedDropoff?.coordinate)
      points.push(normalizedDropoff.coordinate);
    if (normalizedDasher?.coordinate) points.push(normalizedDasher.coordinate);
    for (const point of normalizedRouteCoordinates) points.push(point);
    if (normalizedBrowserUserLocation)
      points.push(normalizedBrowserUserLocation);
    return points;
  }, [
    normalizedPickup,
    normalizedDropoff,
    normalizedDasher,
    normalizedRouteCoordinates,
    normalizedBrowserUserLocation,
  ]);

  const initialZoom = useMemo(() => {
    const latitudeDelta = Math.max(initialRegion.latitudeDelta, 0.001);
    return Math.max(1, Math.min(16, Math.log2(360 / latitudeDelta)));
  }, [initialRegion.latitudeDelta]);

  useEffect(() => {
    if (!mapContainerRef.current || !mapboxToken || mapRef.current) return;

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: `mapbox://styles/${styleId}`,
      center: [
        normalizedInitialCenter.longitude,
        normalizedInitialCenter.latitude,
      ],
      zoom: initialZoom,
      attributionControl: true,
    });

    mapRef.current = map;
    hasInitialCameraFitRef.current = false;
    isUserInteractingRef.current = false;

    const onUserInteractStart = () => {
      isUserInteractingRef.current = true;
    };
    const resizeMap = () => {
      map.resize();
    };
    const onMapLoad = () => {
      setMapLoadError(null);
      resizeMap();
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        window.requestAnimationFrame(resizeMap);
      }
    };
    map.on("dragstart", onUserInteractStart);
    map.on("zoomstart", onUserInteractStart);
    map.on("rotatestart", onUserInteractStart);
    map.on("load", onMapLoad);
    map.on("error", (event: any) => {
      const errorMessage =
        event?.error?.message ||
        (typeof event?.error === "string" ? event.error : null);
      setMapLoadError(
        errorMessage
          ? `Mapbox failed to load: ${errorMessage}`
          : "Mapbox failed to load map tiles. Check your Mapbox token and style.",
      );
    });
    if (typeof window !== "undefined") {
      window.addEventListener("resize", resizeMap);
    }
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        resizeMap();
      });
      resizeObserver.observe(mapContainerRef.current);
    }
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    return () => {
      map.off("dragstart", onUserInteractStart);
      map.off("zoomstart", onUserInteractStart);
      map.off("rotatestart", onUserInteractStart);
      map.off("load", onMapLoad);
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", resizeMap);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, [
    normalizedInitialCenter.latitude,
    normalizedInitialCenter.longitude,
    initialZoom,
    mapboxToken,
    styleId,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasInitialCameraFitRef.current) return;

    const runInitialFit = () => {
      if (hasInitialCameraFitRef.current || isUserInteractingRef.current)
        return;
      if (cameraPoints.length >= 2) {
        const bounds = new mapboxgl.LngLatBounds(
          [cameraPoints[0].longitude, cameraPoints[0].latitude],
          [cameraPoints[0].longitude, cameraPoints[0].latitude],
        );
        for (const point of cameraPoints.slice(1)) {
          bounds.extend([point.longitude, point.latitude]);
        }
        map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 0 });
      } else {
        map.jumpTo({
          center: [
            normalizedInitialCenter.longitude,
            normalizedInitialCenter.latitude,
          ],
          zoom: initialZoom,
        });
      }
      hasInitialCameraFitRef.current = true;
    };

    if (map.isStyleLoaded()) {
      runInitialFit();
      return;
    }

    map.once("load", runInitialFit);
    return () => {
      map.off("load", runInitialFit);
    };
  }, [cameraPoints, initialZoom, normalizedInitialCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = [];

    const points: Array<{
      marker: NormalizedMarkerInfo | null;
      defaultColor: string;
    }> = [
      { marker: normalizedPickup, defaultColor: "#F59E0B" },
      { marker: normalizedDropoff, defaultColor: "#22C55E" },
      { marker: normalizedDasher, defaultColor: "#2563EB" },
    ];

    for (const point of points) {
      if (!point.marker?.coordinate) continue;
      const marker = new mapboxgl.Marker({
        color: getColor(point.marker.pinColor, point.defaultColor),
      })
        .setLngLat([
          point.marker.coordinate.longitude,
          point.marker.coordinate.latitude,
        ])
        .setPopup(
          new mapboxgl.Popup({ offset: 24 }).setText(
            point.marker.description
              ? `${point.marker.title}: ${point.marker.description}`
              : point.marker.title,
          ),
        )
        .addTo(map);
      markerRefs.current.push(marker);
    }
  }, [normalizedPickup, normalizedDropoff, normalizedDasher]);

  useEffect(() => {
    if (!showsUserLocation || typeof navigator === "undefined") {
      setBrowserUserLocation(null);
      setGeolocationError(null);
      return;
    }

    if (!navigator.geolocation) {
      setGeolocationError("Geolocation is not supported in this browser.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setBrowserUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setGeolocationError(null);
      },
      (error) => {
        if (error.code === 1) {
          setGeolocationError(
            "Location permission was denied in your browser.",
          );
          return;
        }
        setGeolocationError("Unable to access your browser location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 15000,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [showsUserLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!normalizedBrowserUserLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      return;
    }

    if (!userMarkerRef.current) {
      userMarkerRef.current = new mapboxgl.Marker({ color: "#0EA5E9" })
        .setLngLat([
          normalizedBrowserUserLocation.longitude,
          normalizedBrowserUserLocation.latitude,
        ])
        .setPopup(new mapboxgl.Popup({ offset: 24 }).setText("Your Location"))
        .addTo(map);
      return;
    }

    userMarkerRef.current.setLngLat([
      normalizedBrowserUserLocation.longitude,
      normalizedBrowserUserLocation.latitude,
    ]);
  }, [normalizedBrowserUserLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateRoute = () => {
      const sourceId = "delivery-route-source";
      const layerId = "delivery-route-layer";
      const routePoints = normalizedRouteCoordinates;
      const hasRoute = routePoints.length > 1;

      if (!hasRoute) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        return;
      }

      const routeGeoJson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: routePoints.map((coord) => [
            coord.longitude,
            coord.latitude,
          ]),
        },
      };

      const existingSource = map.getSource(sourceId) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (existingSource) {
        existingSource.setData(routeGeoJson);
      } else {
        map.addSource(sourceId, {
          type: "geojson",
          data: routeGeoJson,
        });
      }

      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#2563EB",
            "line-width": 4,
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      updateRoute();
      return;
    }

    map.once("load", updateRoute);
    return () => {
      map.off("load", updateRoute);
    };
  }, [normalizedRouteCoordinates]);

  if (!mapboxToken) {
    return (
      <View style={styles.warningContainer}>
        <Text style={styles.warningTitle}>Map unavailable</Text>
        <Text style={styles.warningBody}>
          Set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to display the live map on web.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          maxWidth: "100%",
          height: "100%",
          minHeight: 260,
          display: "block",
        }}
      />
      {mapLoadError ? (
        <View style={styles.geoWarning}>
          <Text style={styles.geoWarningText}>{mapLoadError}</Text>
        </View>
      ) : null}
      {geolocationError ? (
        <View style={styles.geoWarning}>
          <Text style={styles.geoWarningText}>{geolocationError}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    minHeight: 260,
    overflow: "hidden",
  },
  warningContainer: {
    minHeight: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    padding: 16,
    justifyContent: "center",
    gap: 8,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  warningBody: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
  },
  geoWarning: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 8,
    backgroundColor: "rgba(15, 23, 42, 0.86)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  geoWarningText: {
    color: "#F8FAFC",
    fontSize: 12,
    lineHeight: 16,
  },
});

export default NativeOSMMap;
