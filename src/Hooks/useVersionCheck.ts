import { useEffect, useState } from "react";

export function useVersionCheck() {
  const [isOutdated, setIsOutdated] = useState(false);

  useEffect(() => {
    fetch(`/version.json?t=${Date.now()}`)
      .then((r) => r.json())
      .then((data: { version: string }) => {
        if (data.version !== __APP_VERSION__) {
          setIsOutdated(true);
        }
      })
      .catch(() => {});
  }, []);

  return isOutdated;
}
