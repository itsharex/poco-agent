"use client";

import { useEffect, useRef, useState } from "react";

const LOGO_GIF = "/logo.gif";
const FALLBACK_LOGO = "/logo.svg";

interface LaunchScreenProps {
  onAnimationComplete?: () => void;
  gifDuration?: number; // GIF animation duration in ms
}

export function LaunchScreen({
  onAnimationComplete,
  gifDuration = 3000,
}: LaunchScreenProps) {
  const [logo, setLogo] = useState(LOGO_GIF);
  const [hasError, setHasError] = useState(false);
  const completedRef = useRef(false);

  const handleImageError = () => {
    if (!hasError) {
      setHasError(true);
      setLogo(FALLBACK_LOGO);
    }
  };

  // Ensure callback is triggered after GIF duration
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onAnimationComplete?.();
      }
    }, gifDuration);

    return () => clearTimeout(timer);
  }, [gifDuration, onAnimationComplete]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-6 py-8 text-foreground">
      <div className="relative h-48 w-48 overflow-hidden rounded-full sm:h-65 sm:w-65">
        {/* eslint-disable-next-line @next/next/no-img-element -- Using native img for proper GIF animation handling */}
        <img
          src={logo}
          alt="Poco avatar"
          className="h-full w-full object-cover"
          onError={handleImageError}
        />
      </div>

      <p className="absolute bottom-10 text-center text-sm font-medium tracking-wide text-muted-foreground sm:text-base">
        <span className="font-brand">Poco: Your Pocket Coworker</span>
      </p>
    </div>
  );
}
