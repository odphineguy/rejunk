import { useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Phoenix, AZ. Open-Meteo is free and needs no API key.
const PHOENIX = { lat: 33.4484, lng: -112.074 };
const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${PHOENIX.lat}&longitude=${PHOENIX.lng}` +
  `&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=America%2FPhoenix`;
const REFRESH_MS = 15 * 60 * 1000; // refresh every 15 min

type WeatherState = {
  temp: number;
  code: number;
} | null;

// WMO weather codes → icon + plain-language label.
function describe(code: number): { Icon: LucideIcon; label: string } {
  if (code === 0) return { Icon: Sun, label: "Clear" };
  if (code === 1 || code === 2) return { Icon: CloudSun, label: "Partly cloudy" };
  if (code === 3) return { Icon: Cloud, label: "Cloudy" };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: "Fog" };
  if (code >= 51 && code <= 57) return { Icon: CloudDrizzle, label: "Drizzle" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { Icon: CloudRain, label: "Rain" };
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86))
    return { Icon: CloudSnow, label: "Snow" };
  if (code >= 95) return { Icon: CloudLightning, label: "Thunderstorm" };
  return { Icon: Cloud, label: "—" };
}

export function WeatherChip() {
  const [weather, setWeather] = useState<WeatherState>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const res = await fetch(WEATHER_URL);
        if (!res.ok) return;
        const data = await res.json();
        const temp = data?.current?.temperature_2m;
        const code = data?.current?.weather_code;
        if (active && typeof temp === "number" && typeof code === "number") {
          setWeather({ temp: Math.round(temp), code });
        }
      } catch {
        // Offline or blocked — chip just stays hidden.
      }
    };

    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!weather) return null;

  const { Icon, label } = describe(weather.code);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="hidden h-11 items-center gap-2 rounded-[11px] border border-border bg-card px-3 text-sm font-medium text-foreground sm:flex"
          aria-label={`Phoenix weather: ${label}, ${weather.temp} degrees`}
        >
          <Icon className="size-[18px] text-muted-foreground" />
          <span className="tabular-nums">{weather.temp}°F</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        Phoenix, AZ · {label} · {weather.temp}°F
      </TooltipContent>
    </Tooltip>
  );
}
