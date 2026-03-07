"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LaunchScreen } from "@/components/shared/launch-screen";
import { startStartupPreload } from "@/lib/startup-preload";

const GIF_DURATION_MS = 2500; // Adjust based on your GIF duration

export function StartupSplashGate({ children }: { children: React.ReactNode }) {
  const [preloadDone, setPreloadDone] = useState(false);
  const [gifDone, setGifDone] = useState(false);

  // Start preload in parallel
  useEffect(() => {
    let active = true;
    (async () => {
      await startStartupPreload();
      if (active) {
        setPreloadDone(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleGifComplete = useCallback(() => {
    setGifDone(true);
  }, []);

  // Derive ready state from preload and gif completion
  const ready = useMemo(() => preloadDone && gifDone, [preloadDone, gifDone]);

  if (!ready) {
    return (
      <LaunchScreen
        onAnimationComplete={handleGifComplete}
        gifDuration={GIF_DURATION_MS}
      />
    );
  }

  return <>{children}</>;
}
