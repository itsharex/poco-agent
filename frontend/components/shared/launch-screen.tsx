"use client";

import { useState } from "react";

const LOGO_GIF = "/logo.gif";
const FALLBACK_LOGO = "/logo.svg";

export function LaunchScreen() {
  const [logo, setLogo] = useState(LOGO_GIF);
  const [hasError, setHasError] = useState(false);

  const handleImageError = () => {
    if (!hasError) {
      setHasError(true);
      setLogo(FALLBACK_LOGO);
    }
  };

  const handleImageLoad = () => {
    // After GIF loads and plays once, replace with static logo
    const gifDuration = 3000; // Adjust based on your GIF duration
    setTimeout(() => {
      setLogo(FALLBACK_LOGO);
    }, gifDuration);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-6 py-8 text-foreground">
      <div className="relative h-48 w-48 overflow-hidden rounded-full sm:h-65 sm:w-65">
        <img
          src={logo}
          alt="Poco avatar"
          className="h-full w-full object-cover"
          onError={handleImageError}
          onLoad={handleImageLoad}
        />
      </div>

      <p className="absolute bottom-10 text-center text-sm font-medium tracking-wide text-muted-foreground sm:text-base">
        <span className="font-brand">Poco: Your Pocket Coworker</span>
      </p>
    </div>
  );
}
